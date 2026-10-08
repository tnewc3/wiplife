/**
 * Heir conversion (E2b): when a life ends, any living child can carry on, at
 * whatever age they are. `continueAsHeir` builds the new life from the dead
 * one, in one pure step:
 *
 *  - the child expands into a full character (their stats, personality,
 *    identity, hidden traits and talent are kept; the rest is rolled);
 *  - the relationships are rebuilt from the heir's side: the parent who
 *    died is `parent` (dead), your spouse or your child's other parent is
 *    `parent` or `stepparent`, your other children are siblings, your
 *    parents are grandparents and your siblings are aunts and uncles
 *    (`relative`); friends and coworkers don't carry over;
 *  - the estate share moves over: a grown heir gets savings (and a home with
 *    its mortgage); a minor's money, and a home sold on their behalf, is held
 *    in trust until the trust release age;
 *  - a minor lives with a guardian (a surviving parent, then a stepparent,
 *    grandparent, relative or older sibling), or goes into foster care
 *    (an event path); a grown heir lives on their own;
 *  - family reputation carries over (the line's reputation shapes the heir's
 *    own and how people treat them) and the lineage records the generation;
 *  - a "Previously" card and a childhood recap open their life history, and
 *    the events about the estate and the heir's memories are scheduled.
 *
 * All randomness comes from the new life's own seeded generator.
 */
import { giveNeuro } from '../mental/neuro';
import { emptyMental } from '../mental/query';
import type { ContentBundle } from '../../content/schemas';
import { HEIR_MEMORY_MAP, HEIR_MEMORY_TAGS, type GuardianKind } from '../../content/schemas';
import { canTakeJob, startJob } from '../career';
import { InvalidInputError } from '../creation/input';
import { rollAppearance, rollGenderCategory, rollHidden, rollIdentity } from '../creation/character';
import { pickUnused, rollHeritage } from '../creation/family';
import { enrollForAge, schoolAges } from '../education';
import { nextPersonId } from '../events/casting';
import { addDebt, wholeDollars } from '../finance';
import { livingChildren } from '../family/children';
import { moveTo, refreshHousingCost } from '../housing';
import { moodBaseline } from '../interactions/mood';
import { yourWealth } from '../interactions/wealth';
import { clampInt, rollScore } from '../random';
import { chance, createRng, nextInt, pick, type RngState } from '../rng';
import { renderText, type TextContext, type TextRole } from '../text';
import { lifeStageForAge } from '../systems/aging';
import type {
  Character,
  EstateLine,
  HistoryEntry,
  Id,
  LifeState,
  Person,
  Personality,
  Relationship,
  RelationshipKind,
  Stats,
} from '../types';
import { PhaseError } from '../life';
import { receivePossessions } from './possessions';
import { ensureStructure } from '../web/structure';
import { emptyWeb } from '../web/ties';
import { emptyPossessions } from '../possessions/query';
import { startingTeen } from '../teen/query';
import { emptyCrime } from '../crime/query';

/** A deep copy through JSON: the life holds plain data only (the engine has no structuredClone). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** The ids of the living children who could carry on (any age); none until the life has ended. */
export function heirCandidates(dead: LifeState): Id[] {
  return dead.phase === 'dead' ? livingChildren(dead).map((p) => p.id) : [];
}

function role(person: Pick<Person, 'name' | 'identity'>): TextRole {
  return { name: person.name, pronouns: person.identity.pronouns };
}

const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;

const PERSONALITY_KEYS = ['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability'] as const;

/** What a minor heir gets when their inherited home is sold: the value less selling costs and the mortgage (never below zero). */
export function homeSaleNet(value: number, mortgage: number, content: ContentBundle): number {
  const sold = value - wholeDollars(value * content.balance.economy.ownership.sellingCosts);
  return Math.max(0, sold - mortgage);
}

/**
 * Who takes a minor in, from the people around the heir (alive, still in
 * their life): a surviving parent first, then a stepparent, a grandparent, a
 * relative or an older sibling who is of an age to, and fond enough. Null
 * when no one can (foster care follows).
 */
export function chooseGuardian(life: LifeState, content: ContentBundle): { id: Id; kind: GuardianKind } | null {
  const g = content.balance.family.heir.guardian;
  const tiers: GuardianKind[] = ['parent', 'stepparent', 'grandparent', 'relative', 'sibling'];
  const options: { id: Id; kind: GuardianKind; tier: number; affection: number }[] = [];
  for (const id of Object.keys(life.relationships).sort(byId)) {
    const rel = life.relationships[id]!;
    const person = life.people[id];
    const tier = tiers.indexOf(rel.kind as GuardianKind);
    if (tier < 0 || !person?.alive || rel.status !== 'active' || person.tags.includes('foster')) continue;
    const age = life.currentYear - person.birthYear;
    if (rel.kind !== 'parent' && (age < g.minAge || age > g.maxAge || rel.affection < g.minAffection)) continue;
    options.push({ id, kind: rel.kind as GuardianKind, tier, affection: rel.affection });
  }
  options.sort((a, b) => a.tier - b.tier || b.affection - a.affection || byId(a.id, b.id));
  return options[0] ? { id: options[0].id, kind: options[0].kind } : null;
}

/**
 * A foster carer: someone new, of the heir's city, kind `stepparent` and
 * tagged `foster`. Added to the life with their relationship; returns the id.
 */
export function createFosterCarer(life: LifeState, rng: RngState, content: ContentBundle): Id {
  const city = content.cities[life.character.cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) throw new Error(`No name pool for city "${life.character.cityId}"`);
  const { fosterAge, bonds } = content.balance.family.heir;
  const category = rollGenderCategory(rng, content);
  const heritage = pool.heritages[rollHeritage(rng, content, pool)]!;
  const used = new Set([life.character.name.first, ...Object.values(life.people).map((p) => p.name.first)]);
  const id = nextPersonId(life);
  const person: Person = {
    id,
    name: { first: pickUnused(rng, heritage.first[category], used), last: pick(rng, heritage.last) },
    birthYear: life.currentYear - nextInt(rng, fosterAge.min, fosterAge.max),
    alive: true,
    identity: rollIdentity(rng, content, category),
    traits: {},
    looks: rollScore(rng, content.balance.creation.family.relativeLooks),
    smarts: rollScore(rng, content.balance.creation.family.relativeSmarts),
    cityId: life.character.cityId,
    tags: ['family', 'foster'],
    mood: 50,
    moodBase: 50,
    wealthLevel: 'working',
    canCarry: false,
  };
  for (const trait of ['kindness', 'discipline'] as const) person.traits[trait] = rollScore(rng, content.balance.creation.personality);
  life.people[id] = person;
  life.relationships[id] = {
    personId: id,
    kind: 'stepparent',
    status: 'active',
    affection: rollScore(rng, bonds.foster.affection),
    trust: rollScore(rng, bonds.foster.trust),
    memories: [],
    since: life.currentYear,
  };
  person.mood = person.moodBase = moodBaseline(life, person, content);
  return id;
}

/** The history entries that open an heir's life: where they came from, how they were raised, what they did, and the loss. */
function childhoodRecap(dead: LifeState, heir: Person & { child: NonNullable<Person['child']> }, parentRole: TextRole, oldRel: Relationship, rng: RngState, content: ContentBundle): HistoryEntry[] {
  const text = content.text.heir.recap;
  const birthYear = heir.birthYear;
  const entries: HistoryEntry[] = [];
  const add = (year: number, line: string, importance: 1 | 2 | 3, tags: string[]) =>
    entries.push({ year, age: year - birthYear, text: line, tags: ['childhood', ...tags], importance });
  const ctx = (values: Record<string, string | number> = {}): TextContext => ({ roles: { parent: parentRole }, values });

  const adopted = heir.child.origin === 'adopted';
  const joined = adopted ? Math.max(birthYear, oldRel.since) : birthYear;
  add(joined, renderText(pick(rng, adopted ? text.origin.adopted : text.origin.birth), ctx({ age: joined - birthYear })), adopted ? 2 : 1, ['origin']);

  // How they were raised: the first time each style memory was written, at most four, oldest first.
  const seen = new Set<string>();
  const memories = [...oldRel.memories]
    .sort((a, b) => a.year - b.year)
    .filter((m) => (HEIR_MEMORY_TAGS as readonly string[]).includes(m.tag) && !seen.has(m.tag) && seen.add(m.tag) !== undefined)
    .slice(0, content.balance.family.heir.recapMemories);
  for (const m of memories) {
    const year = Math.min(dead.currentYear, Math.max(birthYear, m.year));
    add(year, renderText(text.memories[m.tag as (typeof HEIR_MEMORY_TAGS)[number]], ctx()), 1, ['raised', m.tag]);
  }
  if (heir.child.movedOutYear !== undefined) add(heir.child.movedOutYear, renderText(pick(rng, text.movedOut), ctx()), 1, ['movedOut']);

  const heirAge = dead.currentYear - birthYear;
  const loss = renderText(pick(rng, text.loss), ctx({ age: dead.character.age, heirAge }));
  entries.push({ year: dead.currentYear, age: heirAge, text: loss, tags: ['milestone', 'parentDeath', 'heir'], importance: 3 });
  // Oldest first, keeping the order within a year.
  return entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.year - b.e.year || a.i - b.i).map(({ e }) => e);
}

/**
 * Builds the heir's life from the life that ended. Throws PhaseError unless
 * the life is in the dead phase, and InvalidInputError for anyone who isn't
 * one of its living children.
 */
export function continueAsHeir(dead: LifeState, heirId: Id, content: ContentBundle): LifeState {
  if (dead.phase !== 'dead' || !dead.estate) throw new PhaseError(`Can't continue from a life in the "${dead.phase}" phase (expected "dead").`);
  const candidate = livingChildren(dead).find((p) => p.id === heirId);
  if (!candidate) throw new InvalidInputError([{ path: 'heir', message: `"${heirId}" is not one of your living children.` }]);

  const hb = content.balance.family.heir;
  const creation = content.balance.creation;
  const year = dead.currentYear;
  const seed = `${dead.seed}.${heirId}`;
  const rng = createRng(seed);
  const parentAge = dead.character.age;
  const oldRel = dead.relationships[heirId]!;
  const kid = candidate.child;
  const age = year - candidate.birthYear;
  const independent = age >= content.balance.economy.independenceAge;

  // ── People: the parent who died, and the family around the heir ─────────
  const people: Record<Id, Person> = {};
  const relationships: Record<Id, Relationship> = {};
  const parentId = nextPersonId(dead);
  const c = dead.character;
  people[parentId] = {
    id: parentId,
    name: { ...c.name },
    birthYear: dead.birthYear,
    alive: false,
    deathYear: year,
    identity: cloneJson(c.identity),
    traits: { ...c.personality },
    looks: c.stats.looks,
    smarts: c.stats.smarts,
    cityId: c.cityId,
    ...(dead.career.job ? { occupation: dead.career.job.jobId } : {}),
    tags: ['family'],
    mood: 50,
    moodBase: 50,
    wealthLevel: yourWealth(dead, content),
    canCarry: c.canCarry,
  };
  const parentRole = role(people[parentId]!);
  relationships[parentId] = {
    personId: parentId,
    kind: 'parent',
    status: 'active',
    affection: oldRel.affection,
    trust: oldRel.trust,
    // How they were raised, from the heir's side: the first time each style memory was written.
    memories: HEIR_MEMORY_TAGS.flatMap((tag) => {
      const first = oldRel.memories.filter((m) => m.tag === tag).sort((a, b) => a.year - b.year)[0];
      return first ? [{ tag: HEIR_MEMORY_MAP[tag], year: Math.min(year, first.year) }] : [];
    }),
    since: Math.min(year, oldRel.since),
  };

  const bring = (id: Id, kind: RelationshipKind, bond: keyof typeof hb.bonds, status: Relationship['status'] = 'active'): void => {
    const original = dead.people[id];
    if (!original || people[id]) return;
    const person: Person = cloneJson(original);
    delete person.child;
    delete person.priorChildren;
    // E3: what they were to the parent who died (care at their home, a request they made) doesn't carry over; the family has taken it on.
    if (person.life) {
      delete person.life.requestYear;
      if (person.life.care === 'home' || person.life.care === 'paid') person.life.care = 'sibling';
    }
    people[id] = person;
    const bonds = hb.bonds[bond];
    relationships[id] = {
      personId: id,
      kind,
      status,
      affection: rollScore(rng, bonds.affection),
      trust: rollScore(rng, bonds.trust),
      memories: person.alive ? [{ tag: 'lost_the_same_parent', year }] : [],
      since: Math.min(year, kind === 'parent' || kind === 'sibling' ? candidate.birthYear : year),
    };
  };

  const ids = Object.keys(dead.relationships).sort(byId);
  const aliveActive = (id: Id) => dead.people[id]?.alive === true && dead.relationships[id]!.status !== 'ended';
  // The heir themselves: a person no more, a character now.
  const otherId = kid.otherParentId !== undefined && dead.people[kid.otherParentId] ? kid.otherParentId : undefined;
  if (otherId !== undefined) {
    const old = dead.relationships[otherId]!;
    bring(otherId, 'parent', 'parent', old.status === 'estranged' ? 'estranged' : 'active');
    // A parent who died is a loss, not a shared one.
    if (!dead.people[otherId]!.alive) relationships[otherId]!.memories = [];
  }
  const spouse = ids.find((id) => dead.relationships[id]!.kind === 'spouse' && dead.relationships[id]!.status === 'active' && dead.people[id]!.alive);
  if (spouse !== undefined && spouse !== otherId) bring(spouse, 'stepparent', 'stepparent');
  for (const id of ids) {
    const rel = dead.relationships[id]!;
    const person = dead.people[id]!;
    if (id === heirId) continue;
    if (rel.kind === 'child' && person.alive) bring(id, 'sibling', 'sibling', rel.status === 'estranged' ? 'estranged' : 'active');
    else if (rel.kind === 'stepchild' && aliveActive(id) && person.child?.otherParentId !== undefined && (person.child.otherParentId === otherId || person.child.otherParentId === spouse)) {
      bring(id, 'sibling', 'sibling');
    } else if ((rel.kind === 'parent' || rel.kind === 'stepparent') && aliveActive(id)) bring(id, 'grandparent', 'grandparent');
    else if (rel.kind === 'sibling' && aliveActive(id)) bring(id, 'relative', 'relative', rel.status === 'estranged' ? 'estranged' : 'active');
  }

  // ── The heir as a character ──────────────────────────────────────────────
  const hidden = rollHidden(rng, content);
  const personality = {} as Personality;
  for (const key of PERSONALITY_KEYS) personality[key] = candidate.traits[key] ?? creation.personality.mean;
  const stats: Stats = {
    health: kid.health,
    happiness: kid.happiness,
    smarts: candidate.smarts,
    looks: candidate.looks,
    fitness: kid.fitness,
    stress: kid.stress,
  };
  hidden.geneticRisk = kid.geneticRisk;
  hidden.talent = kid.talent;
  hidden.vice = 0;
  // The family's name goes before them: their own reputation starts from the line's.
  hidden.reputation = clampInt(hidden.reputation + Math.round((dead.lineage.reputation - 50) * hb.reputation.carry), 0, 100);
  const character: Character = {
    name: { ...candidate.name },
    age,
    lifeStage: lifeStageForAge(age, content),
    identity: cloneJson(candidate.identity),
    latent: cloneJson(kid.latent),
    appearance: { descriptors: rollAppearance(rng, content) },
    stats,
    personality,
    hidden,
    cityId: candidate.cityId,
    birthCityId: candidate.cityId,
    familyWealth: yourWealth(dead, content),
    custom: false,
    canCarry: candidate.canCarry,
  };

  const life: LifeState = {
    id: `life_${seed}`,
    seed,
    rng,
    birthYear: candidate.birthYear,
    currentYear: year,
    phase: 'yearStart',
    character,
    people,
    relationships,
    education: { current: null, credentials: [], admission: null, left: null, applied: [], fund: 0 },
    career: { job: null, gig: false, retired: false, history: [], applied: [], openings: [] },
    finances: { savings: 0, debts: [], lifestyle: 'comfortable', earnings: { years: 0, total: 0 }, hardshipYears: 0, dirty: 0 },
    housing: { kind: 'with_parents', cityId: candidate.cityId, annualCost: 0, since: year },
    health: { conditions: [], mental: emptyMental() },
    legal: { record: [] },
    discovery: { surfaced: {} },
    flags: {},
    eventLog: {},
    scheduled: [],
    pending: [],
    pendingInteraction: null,
    family: { pregnancy: null, process: null, support: null, attempts: 0, lostChildren: 0, miscarriages: 0 },
    history: [],
    inputLog: [],
    recap: { year, age, statsBefore: { ...stats }, statsAfter: { ...stats } },
    death: null,
    lifetime: { happinessTotal: Math.round(kid.happiness * age), years: age },
    will: null,
    estate: null,
    lineage: {
      generation: dead.lineage.generation + 1,
      parentLifeId: dead.id,
      lineId: dead.lineage.lineId,
      familyName: dead.lineage.familyName,
      reputation: dead.lineage.reputation,
      deeds: [...dead.lineage.deeds],
    },
    news: [],
    web: emptyWeb(),
    possessions: emptyPossessions(),
    teen: startingTeen(age, year, content),
    crime: emptyCrime(),
  };

  // ── What they inherit ────────────────────────────────────────────────────
  const line: EstateLine | undefined = dead.estate.lines.find((l) => l.kind === 'person' && l.id === heirId);
  const cash = line?.cash ?? 0;
  const property = line?.property;
  const lines: string[] = [];
  const gText = content.text.heir.previously;
  let inheritedHome: { value: number; city: string } | null = null;

  if (independent) {
    life.finances.savings = hb.adultSavings[life.character.familyWealth] + cash;
    if (property) {
      life.housing = { kind: 'owned', cityId: dead.housing.cityId, annualCost: 0, homeValue: property.value, since: year };
      life.character.cityId = dead.housing.cityId;
      if (property.mortgage > 0) life.housing.mortgageDebtId = addDebt(life, 'mortgage', property.mortgage, content).id;
      life.flags.inherited_a_home = true;
      inheritedHome = { value: property.value, city: content.cities[dead.housing.cityId]?.name ?? '' };
    }
  } else {
    const held = cash + (property ? homeSaleNet(property.value, property.mortgage, content) : 0);
    if (held > 0) life.finances.trust = { balance: held, releaseAge: hb.trustReleaseAge };
  }
  if (dead.estate.source === 'will') life.flags.estate_will = true;
  else life.flags.estate_no_will = true;
  const leftOut = dead.estate.source === 'will' && !line;
  if (leftOut) life.flags.left_out_of_will = true;

  // ── Where they live ──────────────────────────────────────────────────────
  let guardianId: Id | null = null;
  let guardianKind: GuardianKind | 'foster' | null = null;
  if (!independent) {
    const guardian = chooseGuardian(life, content);
    if (guardian) {
      guardianId = guardian.id;
      guardianKind = guardian.kind;
    } else {
      guardianId = createFosterCarer(life, rng, content);
      guardianKind = 'foster';
    }
    const home = life.people[guardianId]!;
    life.character.cityId = home.cityId;
    // The heir lives where the guardian does.
    life.housing = { kind: 'with_parents', cityId: home.cityId, annualCost: 0, since: year, guardianId, ...(guardianKind === 'foster' ? { foster: true as const } : {}) };
    if (guardianKind === 'foster') {
      life.flags.in_foster_care = true;
      life.relationships[guardianId]!.memories.push({ tag: 'foster_carer', year });
    } else if (guardianKind !== 'parent') life.relationships[guardianId]!.memories.push({ tag: 'took_you_in', year });
  } else if (!property) {
    const living = Object.keys(life.relationships).sort(byId).find((id) => life.relationships[id]!.kind === 'parent' && life.people[id]!.alive && life.relationships[id]!.status === 'active');
    if (age < hb.livesHomeUntil && kid.movedOutYear === undefined && living !== undefined) {
      life.housing = { kind: 'with_parents', cityId: life.people[living]!.cityId, annualCost: 0, since: year };
      life.character.cityId = life.people[living]!.cityId;
    } else moveTo(life, 'renting', life.character.cityId, content);
  }
  refreshHousingCost(life, content);
  life.character.birthCityId = candidate.cityId;

  // ── School and work ──────────────────────────────────────────────────────
  const ages = schoolAges(content);
  if (age >= ages.highEnd) life.education.credentials.push({ type: 'hs_diploma', year: candidate.birthYear + ages.highEnd });
  else if (enrollForAge(life, content) && kid.gpa > 0 && life.education.current) life.education.current.gpa = Math.min(4, kid.gpa);
  if (independent && candidate.occupation !== undefined && canTakeJob(life, candidate.occupation, content)) startJob(life, candidate.occupation, content);

  // ── Possessions (E5 hook) ────────────────────────────────────────────────
  receivePossessions(life, dead.estate.possessions.filter((t) => t.toPersonId === heirId), content);

  // ── The web between the people around them (E4) ──────────────────────────
  // Rebuilt from the heir's side: who is married to whom, who is whose sibling, who a parent to whom. A pair that was tied
  // in the parent's life in the same way keeps how it stood (and a feud), without the side the parent took.
  // M1: the heir carries any born-with condition their parent passed on (they start unnamed).
  giveNeuro(life, candidate.neuro ?? [], content);
  ensureStructure(life, life.web, rng, content, year);
  for (const [key, tie] of Object.entries(life.web.ties)) {
    const old = dead.web.ties[key];
    if (old && old.kind === tie.kind) {
      tie.affection = old.affection;
      if (old.feud) tie.feud = { since: Math.min(old.feud.since, year) };
    }
  }

  // ── The card, the recap and what comes next ──────────────────────────────
  const cause = content.causes[dead.death?.causeId ?? '']?.text ?? 'natural causes';
  const base: TextContext = { roles: { parent: parentRole }, values: { age: parentAge, year, cause, heirAge: age, city: inheritedHome?.city ?? '', releaseAge: hb.trustReleaseAge, amount: '', value: '' } };
  lines.push(renderText(pick(rng, gText.died), base));
  if (guardianId !== null && guardianKind !== null) {
    const g = life.people[guardianId]!;
    lines.push(renderText(pick(rng, gText.guardian[guardianKind]), { ...base, roles: { ...base.roles, guardian: role(g) } }));
  } else lines.push(renderText(pick(rng, gText.grown), base));
  if (leftOut) lines.push(renderText(pick(rng, gText.inherited.leftOut), base));
  else if (cash <= 0 && !property) lines.push(renderText(pick(rng, gText.inherited.nothing), base));
  else {
    if (cash > 0 && independent) lines.push(renderText(gText.inherited.cash, { ...base, values: { ...base.values, amount: dollars(cash) } }));
    if (!independent && life.finances.trust) lines.push(renderText(gText.inherited.trust, { ...base, values: { ...base.values, amount: dollars(life.finances.trust.balance) } }));
    if (inheritedHome) lines.push(renderText(gText.inherited.home, { ...base, values: { ...base.values, value: dollars(inheritedHome.value) } }));
  }
  life.lineage.previously = { parentName: `${c.name.first} ${c.name.last}`, lines };

  // The childhood recap comes first; what the conversion itself wrote (starting school, a first job) follows it.
  life.history.unshift(...childhoodRecap(dead, { ...candidate, child: kid }, parentRole, oldRel, rng, content));
  if (guardianKind === 'foster') {
    const t = content.text.heir.recap.foster.began;
    life.history.push({ year, age, text: renderText(pick(rng, t), {}), tags: ['milestone', 'foster'], importance: 2 });
  }

  scheduleHeirEvents(life, dead, { heirId, parentId, line, leftOut, guardianKind }, rng, content);

  // Their moods start from where they stand now.
  for (const person of Object.values(life.people)) if (person.alive) person.mood = person.moodBase = moodBaseline(life, person, content);

  // The input log starts with a snapshot, so the life can be replayed from here (src/engine/replay.ts).
  const snapshot = JSON.parse(JSON.stringify({ ...life, inputLog: [] })) as Record<string, unknown>;
  life.inputLog = [{ year, kind: 'create', payload: { heir: true, startAge: age, parentLifeId: dead.id, snapshot } }];
  return life;
}

const ONE_YEAR = { min: 1, max: 1 };

/** The events a conversion schedules: the will read, disputes the will or its absence led to, the first year with a guardian, foster care, and memories of how the heir was raised. */
function scheduleHeirEvents(
  life: LifeState,
  dead: LifeState,
  ctx: { heirId: Id; parentId: Id; line: EstateLine | undefined; leftOut: boolean; guardianKind: GuardianKind | 'foster' | null },
  rng: RngState,
  content: ContentBundle,
): void {
  const reg = content.registries.heir;
  const drama = content.balance.family.heir.drama;
  const year = life.currentYear;
  const estate = dead.estate!;
  const schedule = (ids: readonly Id[], cast: Record<string, Id>, years: { min: number; max: number }) => {
    const eventId = pick(rng, ids);
    life.scheduled.push({ eventId, dueYear: year + nextInt(rng, years.min, years.max), cast: { ...cast } });
  };
  const parent = { parent: ctx.parentId };

  // Guardian and foster care come first.
  if (ctx.guardianKind === 'foster') schedule(reg.foster, {}, ONE_YEAR);
  else if (ctx.guardianKind !== null) schedule(reg.guardian[ctx.guardianKind], {}, ONE_YEAR);

  if (estate.source === 'will') schedule(reg.will, parent, ONE_YEAR);
  else schedule(reg.noWill, parent, ONE_YEAR);
  if (ctx.leftOut) schedule(reg.leftOut, parent, { min: 1, max: 2 });

  const siblings = estate.lines.filter((l) => l.kind === 'person' && l.id !== ctx.heirId && (l.relation === 'child' || l.relation === 'stepchild'));
  const unequal = estate.source === 'will' && siblings.some((s) => s.percent !== (ctx.line?.percent ?? 0));
  const siblingIds = Object.keys(life.relationships).sort(byId).filter((id) => life.relationships[id]!.kind === 'sibling' && life.people[id]!.alive && life.currentYear - life.people[id]!.birthYear >= 18);
  const estranged = siblingIds.find((id) => life.relationships[id]!.status === 'estranged');
  const dispute = drama.inYears;
  if (estranged !== undefined && chance(rng, drama.estrangedContest)) schedule(reg.estrangedContest, { ...parent, sibling: estranged }, dispute);
  else if (estate.source === 'will' && unequal && siblingIds.length > 0 && chance(rng, drama.siblingDispute)) schedule(reg.siblingDispute, { ...parent, sibling: siblingIds[0]! }, dispute);
  else if (estate.source === 'default' && siblingIds.length > 0 && chance(rng, drama.noWillDispute)) schedule(reg.noWillDispute, { ...parent, sibling: siblingIds[0]! }, dispute);
  if (estate.lines.some((l) => l.kind === 'person' && l.relation !== 'child' && l.relation !== 'stepchild' && l.relation !== 'spouse' && l.relation !== 'parent' && l.relation !== 'sibling') && estate.source === 'will' && chance(rng, drama.unexpectedBeneficiary)) {
    schedule(reg.unexpectedBeneficiary, parent, dispute);
  }
  if (estate.lines.some((l) => l.kind === 'cause') && chance(rng, drama.causeLetter)) schedule(reg.causeLetter, parent, dispute);

  // Memories of how the heir was raised, from the memories on their relationship with the parent who died.
  const memories = life.relationships[ctx.parentId]!.memories;
  let remembered = 0;
  for (const tag of HEIR_MEMORY_TAGS) {
    if (remembered >= content.balance.family.heir.memoryEvent.max || !memories.some((m) => m.tag === HEIR_MEMORY_MAP[tag])) continue;
    if (!chance(rng, content.balance.family.heir.memoryEvent.chance)) continue;
    schedule(reg.memories[tag], parent, content.balance.family.heir.memoryEvent.inYears);
    remembered += 1;
  }
}
