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
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
