import { reconcileHeadcount } from '../engine/business/crew';
import { craftRole, managerRole } from '../engine/business/headcount';
import { defaultLines, forecastFromCustomers } from '../engine/business/products';
import type { Business } from '../engine/types';
import type { BusinessStyle, PriceLevel } from '../content/schemas';
import { emptyTravel } from '../engine/travel/types';
import { emptyMigration } from '../engine/migration/types';
import { emptyGrind } from '../engine/fame/query';
import { emptySocial, engagementFactor, handleSuggestion, hashOf, nicheList, platformList } from '../engine/social/query';
import { tourSizeFor } from '../engine/fame/grind';
import type { TourSize } from '../engine/types';
import { countryOfCity } from '../engine/country';
import { emptySchoolLife, emptyWorkYear } from '../engine/school/state';
// Read data directly: migrations also run in Node tools without Vite's import.meta.env.
import compiled from '../content/compiled/content.json' with { type: 'json' };
import type { ContentBundle } from '../content/schemas';
import { emptyLanguageLearning, legacyLanguages, householdLanguages } from '../engine/languages';
import { languageSkillSchema, type LanguageSkill } from '../content/schemas/languages';
import { CURRENT_SCHEMA_VERSION, type SaveEnvelope } from './envelope';

/** Upgrades saved data from schemaVersion `from` to `from + 1`. */
export interface Migration {
  from: number;
  description: string;
  migrate: (data: unknown) => unknown;
}

/**
 * Every migration ever shipped, oldest first. Never edit or remove one that
 * has shipped: old saves on players' devices still depend on it.
 */
export const migrations: readonly Migration[] = [
  {
    from: 1,
    description: 'Stage 3: add the year recap and death record (both empty for a Stage 2 life)',
    migrate: (data) =>
      typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data, recap: null, death: null } : data,
  },
  {
    from: 2,
    description:
      'Stage 4: add lifetime happiness. Happiness never changed in Stage 3, so every finished year had the current value.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { phase?: unknown; character?: { age?: unknown; stats?: { happiness?: unknown } } };
      const age = typeof life.character?.age === 'number' ? life.character.age : 0;
      const happiness = typeof life.character?.stats?.happiness === 'number' ? life.character.stats.happiness : 0;
      const years = Math.max(0, life.phase === 'events' || life.phase === 'yearEnd' ? age - 1 : age);
      return { ...data, lifetime: { happinessTotal: happiness * years, years } };
    },
  },
  {
    from: 3,
    description:
      'Stage 5: mark everyone who has been your spouse (wasSpouse). A spouse is marked; an ex is marked when a ' +
      'memory shows the marriage ("married_you" or "divorced"). Saves from before Stage 5 have neither.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { relationships?: unknown };
      if (typeof life.relationships !== 'object' || life.relationships === null) return data;
      const relationships: Record<string, unknown> = {};
      for (const [id, value] of Object.entries(life.relationships as Record<string, unknown>)) {
        const rel = value as { kind?: unknown; memories?: unknown };
        const memories = Array.isArray(rel.memories) ? (rel.memories as { tag?: unknown }[]) : [];
        const married =
          rel.kind === 'spouse' || (rel.kind === 'ex' && memories.some((m) => m.tag === 'married_you' || m.tag === 'divorced'));
        relationships[id] = married && typeof value === 'object' && value !== null ? { ...value, wasSpouse: true } : value;
      }
      return { ...data, relationships };
    },
  },
  {
    from: 4,
    description:
      'Stage 6: the birth city (the city you lived in, since nobody could move before), the year you moved into your ' +
      'home (birth), money-trouble tracking (none yet) and the earnings record (empty: nobody earned before). The ' +
      'ledger has never run, so there is no last ledger.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { birthYear?: unknown; character?: unknown; finances?: unknown; housing?: unknown };
      const character = isRecord(life.character) ? { ...life.character, birthCityId: life.character.cityId } : life.character;
      const finances = isRecord(life.finances) ? { ...life.finances, earnings: { years: 0, total: 0 }, hardshipYears: 0 } : life.finances;
      const housing = isRecord(life.housing) ? { ...life.housing, since: life.birthYear } : life.housing;
      return { ...data, character, finances, housing };
    },
  },
  {
    from: 5,
    description:
      'Stage 7: education. Adds the admission, the program you left, this year’s applications and scholarship money ' +
      '(all empty). Nobody went to school before, so an adult (18 or older) is given the high school diploma they ' +
      'would have earned at 18, without a GPA; a child starts school at the next age-up.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const life = data as { birthYear?: unknown; currentYear?: unknown; education?: unknown };
      if (!isRecord(life.education)) return data;
      const credentials = Array.isArray(life.education.credentials) ? [...(life.education.credentials as unknown[])] : [];
      const { birthYear, currentYear } = life;
      if (typeof birthYear === 'number' && typeof currentYear === 'number' && currentYear - birthYear >= 18 && credentials.length === 0) {
        credentials.push({ type: 'hs_diploma', year: birthYear + 18 });
      }
      return { ...data, education: { ...life.education, credentials, admission: null, left: null, applied: [], fund: 0 } };
    },
  },
  {
    from: 6,
    description:
      'Stage 8: careers. Adds this year’s job applications and job openings (both empty: the openings are rolled as ' +
      'the next year begins). Nobody could hold a job before, so there is no job and no career history to upgrade.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const life = data as { career?: unknown };
      if (!isRecord(life.career)) return data;
      return { ...data, career: { ...life.career, job: null, history: [], applied: [], openings: [] } };
    },
  },
  {
    from: 7,
    description:
      'Stage 9: health, legal and self-discovery. Adds the self-discovery record (nothing has surfaced yet: latent ' +
      'traits could not surface before). Health conditions, the criminal record, probation and prison already had ' +
      'their (empty) places, and nothing could fill them before, so they need no upgrade.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      return { ...data, discovery: { surfaced: {} } };
    },
  },
  {
    from: 8,
    description:
      'C1: the Happiness baseline each year drifts toward (a hidden value rolled at birth). A life from before C1 ' +
      'gets the average baseline, 50 (balance/creation.yaml when C1 shipped). Follow-ups, outcome money and rent ' +
      'changes are new optional fields, so they need no upgrade.',
    migrate: (data) => {
      if (!isRecord(data) || !isRecord(data.character) || !isRecord(data.character.hidden)) return data;
      const hidden = { ...data.character.hidden, happinessBaseline: 50 };
      return { ...data, character: { ...data.character, hidden } };
    },
  },
  {
    from: 9,
    description:
      'E1: moods, wealth and interactions. Everyone in your life gets a mood (50, drifting to a baseline from the ' +
      'next year on), a baseline of 50 and a wealth level: your family background for everyone, since nothing ' +
      'recorded who anyone was before (family wealth is the one background the life has). Interaction counters ' +
      'start empty (an optional field), and there is no outcome card waiting.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const wealth = isRecord(data.character) && typeof data.character.familyWealth === 'string' ? data.character.familyWealth : 'middle';
      const people: Record<string, unknown> = {};
      if (isRecord(data.people)) {
        for (const [id, value] of Object.entries(data.people)) {
          people[id] = isRecord(value) ? { ...value, mood: 50, moodBase: 50, wealthLevel: wealth } : value;
        }
      }
      return { ...data, people, pendingInteraction: null };
    },
  },
  {
    from: 10,
    description:
      'E2a: children and parenting. Everyone gets the ability to carry a pregnancy from their gender category (women ' +
      'can, men can\'t; nonbinary people by a fixed rule, since nothing recorded a choice: they can when the number ' +
      'in their id is even, and you can if you are nonbinary only when the last digit of the life\'s year of birth is ' +
      'even). The life gets an empty family record. A saved ledger gets zero child costs and support. Children, ' +
      'parenting styles and prior children are optional fields: nobody had any before.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const carries = (category: unknown, seed: number) => (category === 'woman' ? true : category === 'man' ? false : seed % 2 === 0);
      const birthYear = typeof data.birthYear === 'number' ? data.birthYear : 0;
      const character = isRecord(data.character)
        ? { ...data.character, canCarry: carries(isRecord(data.character.identity) ? data.character.identity.genderCategory : undefined, birthYear) }
        : data.character;
      const people: Record<string, unknown> = {};
      if (isRecord(data.people)) {
        for (const [id, value] of Object.entries(data.people)) {
          const category = isRecord(value) && isRecord(value.identity) ? value.identity.genderCategory : undefined;
          const n = Number(id.replace(/\D/g, '')) || 0;
          people[id] = isRecord(value) ? { ...value, canCarry: carries(category, n) } : value;
        }
      }
      let finances = data.finances;
      if (isRecord(finances) && isRecord(finances.lastLedger)) {
        finances = { ...finances, lastLedger: { ...finances.lastLedger, children: 0, supportPaid: 0, supportReceived: 0 } };
      }
      const family = { pregnancy: null, process: null, support: null, attempts: 0, lostChildren: 0, miscarriages: 0 };
      return { ...data, character, people, finances, family };
    },
  },
  {
    from: 11,
    description:
      'E2b: heir play and inheritance. A life gets no will, no estate settlement and a family line of its own: the ' +
      'line is the life (its id), named after the character\'s family name, with an unremarkable reputation (50) ' +
      'and no deeds. Trust, guardians and foster care are optional fields: nobody had any before. Relatives in ' +
      'the kind "relative" (aunts and uncles) only arrive with heirs.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const lineage = isRecord(data.lineage) ? data.lineage : { generation: 1 };
      const familyName = isRecord(data.character) && isRecord(data.character.name) && typeof data.character.name.last === 'string' ? data.character.name.last : 'Family';
      const lineId = typeof lineage.parentLifeId === 'string' ? lineage.parentLifeId : data.id;
      return { ...data, will: null, estate: null, lineage: { ...lineage, lineId, familyName, reputation: 50, deeds: [] } };
    },
  },
  {
    from: 12,
    description:
      'E3: people\'s own lives. A life starts with no news, and last year\'s ledger with no care costs. People get their ' +
      'life summary (job level, partner, children, troubles; "life" on a person) from the first yearly step that ' +
      'meets them, built from what the save already holds (their job, wealth and relationship to you), so nobody ' +
      'is given a partner, children or troubles they never had.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      let finances = data.finances;
      if (isRecord(finances) && isRecord(finances.lastLedger)) {
        finances = { ...finances, lastLedger: { ...finances.lastLedger, care: 0 } };
      }
      return { ...data, finances, news: [] };
    },
  },
  {
    from: 13,
    description:
      'E4: the social web. A life starts with no ties and no knowledge items. Ties between the people you know ' +
      '("web" on the life) are built from the family\'s structure by the first yearly step, from what the save ' +
      'already holds, and what people have heard starts from the first year the web step notices it; so nobody ' +
      'is given a feud, a couple or a rumor they never had.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      return { ...data, web: { ties: {}, items: [], nextItem: 1, seen: [] } };
    },
  },
  {
    from: 14,
    description:
      'M1: mental health. A life gets its mental health record (no trauma, nobody who has noticed, nothing recovered ' +
      'from, no crises). Depression and anxiety were shown by name before this stage, so a life that has one keeps it ' +
      'named (diagnosed in the year it began); one that was being treated is in therapy, which is what treatment ' +
      'meant. ADHD and neurodivergence are rolled at birth, so lives from before M1 have none, and nobody is given ' +
      'a condition they never had.',
    migrate: (data) => {
      if (!isRecord(data) || !isRecord(data.health)) return data;
      const conditions = Array.isArray(data.health.conditions)
        ? (data.health.conditions as unknown[]).map((c) => {
            if (!isRecord(c) || (c.conditionId !== 'depression' && c.conditionId !== 'anxiety_disorder')) return c;
            const since = typeof c.since === 'number' ? c.since : 0;
            return { ...c, diagnosed: since, diagnosedBy: 'doctor', ...(c.treated === true ? { care: ['therapy'] } : {}) };
          })
        : data.health.conditions;
      return { ...data, health: { ...data.health, conditions, mental: { trauma: 0, noticed: {}, past: {}, crises: 0 } } };
    },
  },
  {
    from: 15,
    description:
      'E5: pets, vehicles and homes. A life starts owning nothing ("possessions" on the life), and nobody is given a ' +
      'pet, a car or a vacation home they never had. The yearly ledger gains two lines, upkeep and insurance, which are ' +
      'zero for every year already kept. An estate settled before this stage passed no possessions and sold none.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const finances = isRecord(data.finances)
        ? {
            ...data.finances,
            ...(isRecord(data.finances.lastLedger) ? { lastLedger: { ...data.finances.lastLedger, upkeep: 0, insurance: 0 } } : {}),
          }
        : data.finances;
      const estate = isRecord(data.estate) ? { ...data.estate, possessionSales: 0 } : data.estate;
      return { ...data, finances, estate, possessions: { items: [], nextId: 1, claims: [], noVehicleYears: 0 } };
    },
  },
  {
    from: 16,
    description:
      'T1: the teen years. A life gains a "teen" record: no crowds, focus, job, teams or house rules yet (the first teen year ' +
      'sets up a school\'s crowds and the rules at home). Anyone who is an adult, or already drives (the can_drive flag), ' +
      'holds a license, so nobody loses a car they own. Offenses from before 18 on the record of an adult are marked sealed ' +
      '(without a history entry); the record a teen has now counts as seen, so nothing from before is answered at home.',
    migrate: (data) => {
      if (!isRecord(data) || !isRecord(data.character)) return data;
      const age = typeof data.character.age === 'number' ? data.character.age : 0;
      const birthYear = typeof data.birthYear === 'number' ? data.birthYear : 0;
      const flags = isRecord(data.flags) ? data.flags : {};
      const legal = isRecord(data.legal) ? data.legal : { record: [] };
      const record = Array.isArray(legal.record) ? legal.record : [];
      const adult = age >= 18;
      const sealedRecord = adult
        ? record.map((r) => (isRecord(r) && typeof r.year === 'number' && r.year - birthYear < 18 ? { ...r, sealed: true } : r))
        : record;
      const hadJuvenile = adult && sealedRecord.some((r) => isRecord(r) && r.sealed === true);
      const licensed = adult || flags.can_drive === true;
      return {
        ...data,
        legal: { ...legal, record: sealedRecord },
        teen: {
          school: null,
          cliques: [],
          nextClique: 1,
          member: null,
          turnedAway: {},
          standing: 40,
          focus: null,
          focusYears: { school: 0, friends: 0, work: 0, passion: 0 },
          passion: 0,
          license: licensed ? { stage: 'licensed', since: typeof data.currentYear === 'number' ? data.currentYear : birthYear, lessons: 0, fails: 0 } : { stage: 'none', lessons: 0, fails: 0 },
          job: null,
          activities: [],
          home: null,
          penalties: [],
          totals: { broken: 0, caught: 0, negotiated: 0, won: 0 },
          seenRecords: record.length,
          ...(hadJuvenile ? { sealed: true } : {}),
        },
      };
    },
  },
  {
    from: 17,
    description:
      'E6a: crime careers. A life gains a "crime" record (no crew, no heat, no past) and its finances gain a dirty money balance of 0. ' +
      'Nobody is placed in a crew by the upgrade: a crime life begins with an offer, as it does for a new life.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const finances = isRecord(data.finances) ? { ...data.finances, dirty: 0 } : data.finances;
      return {
        ...data,
        finances,
        crime: {
          crew: null,
          rank: 0,
          peak: 0,
          rankSince: 0,
          standing: 0,
          lowYears: 0,
          awayYears: 0,
          heat: 0,
          rivalry: 0,
          jobs: { year: 0, count: 0, last: 0 },
          past: [],
          laundered: { year: 0, byFront: {} },
          totals: { jobs: 0, earned: 0, cleaned: 0, fees: 0, lost: 0, spent: 0, arrests: 0, years: 0 },
        },
      };
    },
  },
  {
    from: 18,
    description:
      'E6b: fame in arts and media. A life gains a "fame" record (no career, no fans, nothing signed or released). ' +
      'Nobody is given a career by the upgrade: a career begins with a first step, as it does for a new life.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      return {
        ...data,
        fame: {
          active: false,
          main: null,
          second: null,
          paths: {},
          image: 50,
          fans: 0,
          mood: 60,
          burnout: 0,
          commitment: 'steady',
          scene: 'social',
          agent: null,
          contract: null,
          plan: null,
          projects: [],
          awards: [],
          people: { super: [], hater: [], critic: [] },
          stalker: null,
          headlines: [],
          income: { year: 0, gross: 0, agent: 0, company: 0, trust: 0, scene: 0 },
          totals: { projects: 0, hits: 0, flops: 0, breaks: 0, fades: 0, comebacks: 0, nominations: 0, wins: 0, scandals: 0, tours: 0, burnouts: 0, crossovers: 0, stalkers: 0, earned: 0 },
        },
      };
    },
  },
  {
    from: 19,
    description:
      'E6c: sports. A life gains a "sports" record (no sport, no team, no contract, no seasons). Nobody is given a career by the upgrade: ' +
      'a sports career begins with a first step, as it does for a new life.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      return {
        ...data,
        sports: {
          sport: null,
          position: null,
          pro: false,
          team: null,
          contract: null,
          unsigned: 0,
          focus: 'skills',
          form: 0,
          pain: false,
          rest: false,
          ask: null,
          playOut: false,
          seasons: [],
          run: null,
          draft: null,
          suspended: 0,
          traded: 0,
          released: 0,
          agedOut: 0,
          totals: { seasons: 0, proSeasons: 0, playoffs: 0, finals: 0, titles: 0, allStars: 0, injuries: 0, serious: 0, playedThrough: 0, trades: 0, releases: 0, suspensions: 0, earned: 0, bestRating: 0 },
        },
      };
    },
  },
  {
    from: 20,
    description:
      'L1: later life. A life gains a "later" record (no care needed, no warning of a death, no amends made). Nobody is given ' +
      'grandchildren by the upgrade directly: the next year\'s step meets the children of your grown children and makes them people ' +
      'on your People list, as it does for a new life.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      return { ...data, later: { care: null, terminal: null, amends: [], offered: {} } };
    },
  },
  {
    from: 21,
    description:
      'W2: belonging. A life gains a "belonging" record: it belongs to no groups, and its faith and values are marked to be ' +
      'worked out. The next yearly step gives it a faith (its family\'s, like any life) and values from its temperament, from ' +
      'its seed, so nobody is given a religion or a place in a congregation by the upgrade itself. The yearly ledger gains a ' +
      '"giving" line, zero for every year already kept.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const finances = isRecord(data.finances)
        ? { ...data.finances, ...(isRecord(data.finances.lastLedger) ? { lastLedger: { ...data.finances.lastLedger, giving: 0 } } : {}) }
        : data.finances;
      const mid = { community: 50, compassion: 50, tradition: 50, independence: 50, civic: 50 };
      return {
        ...data,
        finances,
        belonging: {
          household: { faith: null, devotion: 0 },
          faith: { id: null, strength: 0, raised: null, since: null, changes: 0 },
          values: { ...mid },
          temperament: { ...mid },
          groups: {},
          cities: {},
          memberships: [],
          past: [],
          nextGroup: 1,
          community: 45,
          repCarry: 0,
          offered: {},
          upgrade: true,
        },
      };
    },
  },
  {
    from: 22,
    description:
      'W3: businesses. A life gains a "business" record: it owns no business and has none behind it, and nobody is given one ' +
      'by the upgrade. The yearly ledger gains a "business" line (money put into a business), zero for every year already kept. ' +
      'An estate settled before this stage passed no business and sold none.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const finances = isRecord(data.finances)
        ? { ...data.finances, ...(isRecord(data.finances.lastLedger) ? { lastLedger: { ...data.finances.lastLedger, business: 0 } } : {}) }
        : data.finances;
      const estate = isRecord(data.estate) ? { ...data.estate, businesses: [], businessSales: 0 } : data.estate;
      return {
        ...data,
        finances,
        estate,
        business: { items: [], nextBusiness: 1, nextLocation: 1, taken: [], past: [], offered: {}, year: { year: 0, draw: 0, inject: 0 }, experience: {}, worth: 0 },
      };
    },
  },
  {
    from: 23,
    description:
      'W4a: countries. A life now belongs to the country of its city (nothing new is stored), and a random life asks for its country when it is made. Every life saved before was lived in the United States, so the creation entry in its input log now says so: it replays as the life it was.',
    migrate: (data) => {
      if (!isRecord(data) || !Array.isArray(data.inputLog)) return data;
      const inputLog = data.inputLog.map((entry: unknown) => {
        if (!isRecord(entry) || entry.kind !== 'create' || !isRecord(entry.payload)) return entry;
        if (entry.payload.mode !== 'random' || entry.payload.countryId !== undefined) return entry;
        return { ...entry, payload: { ...entry.payload, countryId: 'us' } };
      });
      return { ...data, inputLog };
    },
  },
  {
    from: 24,
    description: 'W4b: languages from saved birth city and family; no guessed ancestry. Existing skills are preserved.',
    migrate: upgradeLanguageData,
  },
  {
    from: 25,
    description: 'W5: empty travel and residence; preserve existing life and replay snapshots.',
    migrate: upgradeTravelData,
  },
  {
    from: 26,
    description: 'W6: citizenships from the birth city (you) and the city each person lives in; empty migration record. Nobody had emigrated before this version, so no status is invented.',
    migrate: upgradeMigrationData,
  },
  {
    from: 27,
    description:
      'B1: name heritage on the character and each person. It is filled only where the saved names show it (exactly one ' +
      'heritage in the city\'s country name pool holds both their first and last name); otherwise it stays unset. ' +
      'Heir replay snapshots are upgraded the same way.',
    migrate: upgradeHeritageData,
  },
  {
    from: 28,
    description:
      'Batch 2a: activities. Adds this year\'s activity record (nothing done yet, in the life\'s current year). Valuables are a new ' +
      'possession kind and nothing owned one before, so no possession changes. Heir replay snapshots are upgraded the same way.',
    migrate: upgradePastimesData,
  },
  {
    from: 29,
    description:
      'Batch 2b: risk and legal activities. New debt kinds (bank, payday, shark) and an optional list of former names on the character; ' +
      'no existing data changes, so the save is kept as it is. Heir replay snapshots need nothing either.',
    migrate: (data) => data,
  },
  {
    from: 30,
    description:
      'Batch 3: school and work life. Adds the school record (no class or teachers yet: the first school year makes them, and the ' +
      'choice at the end of compulsory school counts as settled for anyone already past it) and this year\'s work record (nothing ' +
      'done yet). Heir replay snapshots are upgraded the same way.',
    migrate: upgradeSchoolWorkData,
  },
  {
    from: 31,
    description:
      'Batch 4: music, bands and the grind. Fame gains a band (none), past bands and band offers (none), an instrument (none), ' +
      'this year\'s shows, tour and practice (none yet, in the life\'s current year), what was played going into the year (nothing), ' +
      'a tour cost in the year\'s income (0) and new totals (0). A tour used to be a box ticked on a project: a project lined up ' +
      'with it ticked keeps its tour, now booked on its own for the coming year at the size your rung gives, at no cost (it was ' +
      'free before). Heir replay snapshots are upgraded the same way.',
    migrate: upgradeGrindData,
  },
  {
    from: 32,
    description:
      'Batch 5: sports I. A life\'s sports record gains the tryout in hand (none), the last tryouts (none), the teams that cut you (none), ' +
      'whether you are without a team (no), a club team (none), this year\'s training (none), scholarship offers and the scholarship you hold ' +
      '(none), combine points (0), the year the draft passed you by (0), your role on the team (starter), your jersey number (none) and ' +
      'captaincy (no), and new totals (0). A school team in a sport is now the sports career\'s school rung and one record: a life playing ' +
      'a sport at the school level, under 18, gains the matching school team in its teams and clubs (if there is room), and a school sports ' +
      'team joined by a life with no career starts one when the next year begins. Nobody loses a career. Heir replay snapshots are upgraded the same way.',
    migrate: upgradeSportsFiveData,
  },
  {
    from: 33,
    description:
      'Batch 6: sports II. A life gains the teams it plays with (the game\'s own: no renames, moves or added teams) and each league moved between ' +
      '(none). A life\'s sports record gains the academy, loan and loan offer (none), the transfer window (none), the year the national side ' +
      'last called you up (never), the year an academy let you go (never), the year you moved abroad for a club (never), your club\'s last move ' +
      'between leagues (none), and new totals (0). A soccer club on record is in the top league. Heir replay snapshots are upgraded the same way.',
    migrate: upgradeSportsSixData,
  },
  {
    from: 34,
    description:
      'B2: business depth. Every business gains the lines it sells (the kind\'s default lines, each at the price level the whole business had), ' +
      'its orders (normal), a headcount per location and role (the staffing preset, with named staff in their roles), its crew as pools ' +
      '(the heads the old model computed, at skill 50 and the business\'s morale), training (none), stock on hand (none, valued at 0) and a ' +
      'first forecast from last year\'s customers, franchises (none) and no location manager. Named staff gain a role from their title. ' +
      'Nothing about last year\'s report, profits, cash, assets or worth changes, and nobody gets a franchise or a location manager. ' +
      'Estates and heir replay snapshots are upgraded the same way.',
    migrate: upgradeBusinessDepthData,
  },
  {
    from: 35,
    description:
      'Batch 8: social media. A life gains its social record (no accounts, no posts, nothing earned). A life with an active career in the ' +
      'social media path gets an account on the platform its way in started at (the first platform for a way in that has none), with a ' +
      'handle suggested from its name, a niche, and as many followers as its fame in the path is worth, so that its reach and fame agree ' +
      '(an account opened under 18 is private and was set up by a parent). Heir replay snapshots are upgraded the same way.',
    migrate: upgradeSocialData,
  },
  {
    from: 36,
    description:
      'Batch 10: language and travel, expanded. A life\'s language record gains the year each paid method of study (an app, a tutor) was last used ' +
      '(never), this year\'s practice with native speakers (none), certificates and exams (none held, none sat), the languages spoken with children at ' +
      'home (none) and new totals (0). Its travel record gains the year of the last business trip (never), and trips by style, activity and souvenir, ' +
      'business allowance and stays with a family along (all 0). A stay in progress keeps going solo, as it began. The retirement record is kept by ' +
      'the country the years were earned in: all years so far count for the country the life is in, which is how they were counted before. Heir ' +
      'replay snapshots are upgraded the same way.',
    migrate: upgradeLanguageTravelData,
  },
];

/** The reach at which a curve of reach to fame gives this fame (the inverse of curveAt, which is increasing). */
function reachForFame(points: readonly { at: number; x: number }[], fame: number): number {
  if (fame <= points[0]!.x) return points[0]!.at;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (fame <= b.x) return a.at + ((b.at - a.at) * (fame - a.x)) / (b.x - a.x);
  }
  return points[points.length - 1]!.at;
}

/** Batch 8: the social record a save from before it lacks; a career in the social media path gets the account that matches its fame. */
function upgradeSocialData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const year = typeof data.currentYear === 'number' ? data.currentYear : 0;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeSocialData(entry.payload.snapshot) } };
  }) : data.inputLog;
  if (data.social !== undefined) return { ...data, inputLog };
  const social = emptySocial(year);
  const fame = isRecord(data.fame) ? data.fame : undefined;
  const path = fame && isRecord(fame.paths) && isRecord(fame.paths.social) ? fame.paths.social : undefined;
  if (fame && fame.active === true && path && typeof path.fame === 'number') {
    const list = platformList(content);
    const route = typeof path.route === 'string' ? path.route : undefined;
    const platform = list.find((p) => route !== undefined && p.routes.includes(route)) ?? list.find((p) => p.routes.length > 0) ?? list[0];
    const niches = nicheList(content);
    const seed = typeof data.seed === 'string' ? data.seed : '';
    const first = isRecord(data.character) && isRecord(data.character.name) && typeof data.character.name.first === 'string' ? data.character.name.first : '';
    if (platform && niches.length > 0) {
      const b = content.balance.social;
      const engagement = 50;
      const weight = b.platforms[platform.id]?.reach ?? 1;
      const reach = reachForFame(b.fame.at, path.fame);
      const followers = Math.max(b.start.followers, Math.round(reach / (weight * engagementFactor(engagement, content))));
      const recent = Array.isArray(path.recent) ? path.recent.filter((q): q is number => typeof q === 'number') : [];
      const quality = recent.length > 0 ? Math.round(recent.reduce((a, q) => a + q, 0) / recent.length) : b.start.quality;
      const since = typeof path.since === 'number' ? path.since : year;
      const birthYear = typeof data.birthYear === 'number' ? data.birthYear : year - 18;
      const minor = year - birthYear < content.balance.economy.independenceAge;
      const openedMinor = since - birthYear < content.balance.economy.independenceAge;
      const pay = b.pay[platform.pay];
      social.accounts[platform.id] = {
        platform: platform.id,
        handle: handleSuggestion({ seed, character: { name: { first } } } as never, content, 0),
        niche: niches[hashOf(`${seed}:niche`) % niches.length]!.id,
        followers,
        engagement,
        since,
        private: minor,
        byParent: openedMinor,
        posts: 0,
        quality: Math.min(100, Math.max(0, quality)),
        monetized: followers >= pay.threshold && !minor ? year : 0,
        demonetized: 0,
        earned: 0,
        peak: followers,
      };
      social.totals.opened = 1;
      if (social.accounts[platform.id]!.monetized > 0) social.totals.monetized = 1;
    }
  }
  return { ...data, inputLog, social };
}

function upgradeBusinessDepth(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const content = compiled as ContentBundle;
  const def = typeof raw.defId === 'string' ? content.businesses[raw.defId] : undefined;
  if (!def || !Array.isArray(raw.locations) || !Array.isArray(raw.staff)) return raw;
  const style = (typeof raw.style === 'string' ? raw.style : 'standard') as BusinessStyle;
  const level = (typeof raw.prices === 'string' ? raw.prices : 'fair') as PriceLevel;
  const craft = craftRole(def);
  const manager = managerRole(def);
  const licensed = def.roles.find((r) => r.licensed === true);
  const staff = raw.staff.map((s: unknown) => {
    if (!isRecord(s) || typeof s.roleId === 'string') return s;
    const byTitle = def.roles.find((r) => r.title === s.title);
    const roleId = s.manager === true ? (manager?.id ?? craft.id) : s.licensed === true && licensed ? licensed.id : (byTitle?.id ?? craft.id);
    return { ...s, roleId };
  });
  const locations = raw.locations.map((l: unknown) => (isRecord(l) ? { ...l, stock: isRecord(l.stock) ? l.stock : {}, forecast: isRecord(l.forecast) ? l.forecast : forecastFromCustomers(def, (typeof l.style === 'string' ? l.style : style) as BusinessStyle, isRecord(l.result) && typeof l.result.customers === 'number' ? l.result.customers : 0, content) } : l));
  const b = { ...raw, staff, locations, lines: defaultLines(def, style, content).map((l) => ({ ...l, price: level })), orders: {}, headcount: {}, crew: [], training: 'none', stockValue: 0, franchises: [] } as unknown as Business;
  // Targets from the staffing preset (named people keep their places), the crew from what the old model computed.
  reconcileHeadcount(b, def, content);
  return b;
}

function upgradeBusinessDepthData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeBusinessDepthData(entry.payload.snapshot) } };
  }) : data.inputLog;
  const business = isRecord(data.business) && Array.isArray(data.business.items) ? { ...data.business, items: data.business.items.map(upgradeBusinessDepth) } : data.business;
  const estate = isRecord(data.estate) && Array.isArray(data.estate.businesses) ? { ...data.estate, businesses: data.estate.businesses.map((t: unknown) => (isRecord(t) ? { ...t, item: upgradeBusinessDepth(t.item) } : t)) } : data.estate;
  return { ...data, inputLog, business, estate };
}

function upgradeSportsSixData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeSportsSixData(entry.payload.snapshot) } };
  }) : data.inputLog;
  const league = data.league ?? { setup: { renamed: {}, moved: {}, added: [] }, pending: null, tiers: {}, tierYear: 0 };
  if (!isRecord(data.sports)) return { ...data, inputLog, league };
  const old = data.sports;
  const totals = isRecord(old.totals) ? old.totals : {};
  const sportId = typeof old.sport === 'string' ? old.sport : '';
  const twoLeagues = content.famePaths[sportId]?.sport?.leagues.pro.tiers !== undefined;
  const team = isRecord(old.team) && old.team.level === 'pro' && twoLeagues && old.team.division === undefined ? { ...old.team, division: 1 } : old.team;
  const sports = {
    ...old,
    team,
    totals: { loans: 0, transfers: 0, fees: 0, graduates: 0, abroad: 0, caps: 0, tournaments: 0, tournamentTitles: 0, goneUp: 0, goneDown: 0, ...totals },
    academy: null,
    loan: null,
    loanOffer: null,
    transfer: null,
    calledUp: 0,
    academyOut: 0,
    abroadYear: 0,
    moved: null,
  };
  return { ...data, inputLog, league, sports };
}

function upgradeSportsFiveData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeSportsFiveData(entry.payload.snapshot) } };
  }) : data.inputLog;
  if (!isRecord(data.sports)) return { ...data, inputLog };
  const old = data.sports;
  const totals = isRecord(old.totals) ? old.totals : {};
  const sports = {
    ...old,
    totals: { tryouts: 0, tryoutsMade: 0, scholarships: 0, scholarshipsLost: 0, trainedTeam: 0, trainedGym: 0, trainedCoach: 0, signedAfterUndrafted: 0, ...totals },
    tryout: null,
    tried: [],
    cut: {},
    teamless: false,
    club: null,
    training: { year: 0, team: 0, gym: 0, coach: 0, member: false, spent: 0 },
    offers: [],
    scholarship: null,
    combine: 0,
    passed: 0,
    role: 'starter',
    number: null,
    captain: false,
  };
  let teen = data.teen;
  const age = isRecord(data.character) && typeof data.character.age === 'number' ? data.character.age : 99;
  const year = typeof data.currentYear === 'number' ? data.currentYear : 0;
  const team = isRecord(old.team) ? old.team : null;
  if (isRecord(teen) && Array.isArray(teen.activities) && team?.level === 'school' && typeof old.sport === 'string' && age < content.balance.relationships.adultAge) {
    const def = Object.values(content.activities).find((a) => a.sport === old.sport && !a.retired);
    const have = teen.activities.some((a: unknown) => isRecord(a) && a.id === def?.id);
    if (def && !have && teen.activities.length < content.balance.teen.activities.max) {
      teen = { ...teen, activities: [...teen.activities, { id: def.id, since: year, tier: 'varsity' }] };
    }
  }
  return { ...data, inputLog, sports, teen };
}

function upgradeGrindData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeGrindData(entry.payload.snapshot) } };
  }) : data.inputLog;
  if (!isRecord(data.fame)) return { ...data, inputLog };
  const fame = data.fame;
  const year = typeof data.currentYear === 'number' ? data.currentYear : 0;
  let tour: { path: string; size: TourSize; cost: number } | null = null;
  let plan = fame.plan;
  if (isRecord(plan)) {
    const { tour: ticked, ...rest } = plan;
    plan = rest;
    const pathId = typeof rest.path === 'string' ? rest.path : '';
    const def = content.famePaths[pathId];
    const path = isRecord(fame.paths) ? fame.paths[pathId] : undefined;
    if (ticked === true && def && isRecord(path) && typeof path.rung === 'number') tour = { path: pathId, size: tourSizeFor(def, path.rung, content), cost: 0 };
  }
  const income = isRecord(fame.income) ? { ...fame.income, tour: 0 } : fame.income;
  const totals = isRecord(fame.totals) ? { shows: 0, practice: 0, bandsFormed: 0, bandsJoined: 0, bandSplits: 0, memberChanges: 0, genreSwitches: 0, offGenre: 0, ...fame.totals } : fame.totals;
  return {
    ...data,
    inputLog,
    fame: { ...fame, plan, income, totals, band: null, pastBands: [], offers: [], instrument: null, grind: tour ? { ...emptyGrind(year), tour } : emptyGrind(0), played: { year: 0, shows: 0, tour: null } },
  };
}

/** The one heritage of this name pool that has both names, or undefined (none, or more than one). */
function heritageOfNames(cityId: unknown, name: unknown): string | undefined {
  const content = compiled as ContentBundle;
  const city = typeof cityId === 'string' ? content.cities[cityId] : undefined;
  const pool = city ? content.names[city.countryId] : undefined;
  if (!pool || !isRecord(name) || typeof name.first !== 'string' || typeof name.last !== 'string') return undefined;
  const first = name.first.toLocaleLowerCase('en-US');
  const last = name.last.toLocaleLowerCase('en-US');
  const found = Object.entries(pool.heritages).filter(
    ([, h]) => h.last.some((n) => n.toLocaleLowerCase('en-US') === last) && (['man', 'woman', 'nonbinary'] as const).some((c) => h.first[c].some((n) => n.toLocaleLowerCase('en-US') === first)),
  );
  return found.length === 1 ? found[0]![0] : undefined;
}

function upgradeHeritageData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeHeritageData(entry.payload.snapshot) } };
  }) : data.inputLog;
  const withHeritage = (who: unknown, cityId: unknown): unknown => {
    if (!isRecord(who) || who.heritage !== undefined) return who;
    const heritage = heritageOfNames(cityId, who.name);
    return heritage === undefined ? who : { ...who, heritage };
  };
  const people = isRecord(data.people)
    ? Object.fromEntries(Object.entries(data.people).map(([id, p]) => [id, isRecord(p) ? withHeritage(p, p.cityId) : p]))
    : data.people;
  const character = isRecord(data.character) ? withHeritage(data.character, data.character.birthCityId ?? data.character.cityId) : data.character;
  return { ...data, inputLog, people, character };
}

function upgradeMigrationData(data: unknown): unknown {
  const content = compiled as ContentBundle;
  if (!isRecord(data) || !isRecord(data.character)) return data;
  const countryOf = (cityId: unknown): string => {
    const city = typeof cityId === 'string' ? content.cities[cityId] : undefined;
    return city?.countryId ?? 'us';
  };
  const people = isRecord(data.people)
    ? Object.fromEntries(Object.entries(data.people).map(([id, p]) => [id, isRecord(p) ? { ...p, citizenships: p.citizenships ?? [countryOf(p.cityId)] } : p]))
    : data.people;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeMigrationData(entry.payload.snapshot) } };
  }) : data.inputLog;
  return {
    ...data,
    inputLog,
    people,
    character: { ...data.character, citizenships: data.character.citizenships ?? [countryOf(data.character.birthCityId ?? data.character.cityId)] },
    migration: data.migration ?? emptyMigration(),
  };
}

/** Batch 10: the language, travel and retirement records a save from before it lacks. Nothing is invented: no certificate, no business trip, no family stay. */
function upgradeLanguageTravelData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeLanguageTravelData(entry.payload.snapshot) } };
  }) : data.inputLog;
  const fresh = emptyLanguageLearning();
  const languages = isRecord(data.languages) ? { ...fresh, ...data.languages, totals: { ...fresh.totals, ...(isRecord(data.languages.totals) ? data.languages.totals : {}) } } : data.languages;
  const travel = isRecord(data.travel) ? { ...emptyTravel(), ...data.travel, totals: { ...emptyTravel().totals, ...(isRecord(data.travel.totals) ? data.travel.totals : {}) } } : data.travel;
  let finances = data.finances;
  if (isRecord(finances) && isRecord(finances.earnings) && finances.earnings.byCountry === undefined) {
    const cityId = isRecord(data.character) && typeof data.character.cityId === 'string' ? data.character.cityId : '';
    const country = content.cities[cityId]?.countryId ?? 'us';
    const { years, total } = finances.earnings;
    finances = { ...finances, earnings: { ...finances.earnings, byCountry: typeof years === 'number' && years > 0 ? { [country]: { years, total } } : {} } };
  }
  return { ...data, inputLog, languages, travel, finances };
}

function upgradeTravelData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeTravelData(entry.payload.snapshot) } };
  }) : data.inputLog;
  return { ...data, inputLog, travel: data.travel ?? emptyTravel() };
}

function upgradePastimesData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradePastimesData(entry.payload.snapshot) } };
  }) : data.inputLog;
  return { ...data, inputLog, pastimes: data.pastimes ?? { year: typeof data.currentYear === 'number' ? data.currentYear : 0, counts: {}, receipts: [] } };
}

/** Batch 3: the school and work records a save from before it lacks. */
function upgradeSchoolWorkData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  const content = compiled as ContentBundle;
  const year = typeof data.currentYear === 'number' ? data.currentYear : 0;
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeSchoolWorkData(entry.payload.snapshot) } };
  }) : data.inputLog;
  let education = data.education;
  if (isRecord(education) && education.school === undefined) {
    const cur = isRecord(education.current) ? education.current : null;
    const cityId = isRecord(data.character) && typeof data.character.cityId === 'string' ? data.character.cityId : '';
    const choice = countryOfCity(cityId, content).school.choice;
    // Anyone already past the year the choice is made in has made it (or never had one).
    const before = choice !== undefined && cur !== null && cur.program === 'high' && typeof cur.year === 'number' && cur.year <= choice.year;
    education = { ...education, school: { ...emptySchoolLife(), year: { ...emptySchoolLife().year, year }, chosen: !before } };
  }
  const career = isRecord(data.career) && data.career.work === undefined ? { ...data.career, work: emptyWorkYear(year) } : data.career;
  return { ...data, inputLog, education, career };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function upgradeLanguageData(data: unknown): unknown {
  const content = compiled as ContentBundle;
  if (!isRecord(data) || !isRecord(data.character) || !isRecord(data.people)) return data;
  const year = typeof data.currentYear === 'number' ? data.currentYear : 0;
  const people = Object.fromEntries(Object.entries(data.people).map(([id, p]) => [id, isRecord(p) && typeof p.cityId === 'string' ? { ...p, languages: p.languages ?? legacyLanguages(p.cityId, year, `${String(data.seed)}:${id}`, content) } : p]));
  const parents: { languages: LanguageSkill[] }[] = [];
  if (isRecord(data.relationships)) for (const [id, rel] of Object.entries(data.relationships)) {
    const p = people[id];
    if (isRecord(rel) && rel.kind === 'parent' && isRecord(p)) {
      const parsed = languageSkillSchema.array().safeParse(p.languages);
      if (parsed.success) parents.push({ languages: parsed.data });
    }
  }
  const city = typeof data.character.birthCityId === 'string' ? data.character.birthCityId : String(data.character.cityId);
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.payload) || !isRecord(entry.payload.snapshot)) return entry;
    return { ...entry, payload: { ...entry.payload, snapshot: upgradeLanguageData(entry.payload.snapshot) } };
  }) : data.inputLog;
  return { ...data, inputLog, people, character: { ...data.character, languages: data.character.languages ?? householdLanguages(city, parents, year, content) }, languages: data.languages ?? emptyLanguageLearning() };
}

export class MigrationError extends Error {
  override name = 'MigrationError';
}

/**
 * Runs the migrations needed to bring an envelope up to `targetVersion`, in
 * order. Throws a MigrationError if the save comes from a newer version of the
 * game or if a step is missing.
 */
export function migrateEnvelope(
  envelope: SaveEnvelope,
  list: readonly Migration[] = migrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): SaveEnvelope {
  if (envelope.schemaVersion > targetVersion) {
    throw new MigrationError(
      `Save uses schema version ${envelope.schemaVersion}, but this version of WIPlife only understands up to ${targetVersion}.`,
    );
  }
  let data = envelope.data;
  for (let version = envelope.schemaVersion; version < targetVersion; version++) {
    const step = list.find((m) => m.from === version);
    if (!step) throw new MigrationError(`No migration from schema version ${version} to ${version + 1}.`);
    data = step.migrate(data);
  }
  return { ...envelope, schemaVersion: targetVersion, data };
}

/** Checks that the list has exactly one step for every version below the target. */
export function assertMigrationChain(
  list: readonly Migration[] = migrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): void {
  for (let version = 1; version < targetVersion; version++) {
    const count = list.filter((m) => m.from === version).length;
    if (count !== 1) throw new MigrationError(`Expected one migration from version ${version}, found ${count}.`);
  }
  const stray = list.find((m) => m.from < 1 || m.from >= targetVersion);
  if (stray) throw new MigrationError(`Migration from version ${stray.from} is outside the chain.`);
}
