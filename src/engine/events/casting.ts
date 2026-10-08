/**
 * Casting: fills each role of an event with an existing person who fits, or
 * (for friends, classmates and acquaintances) someone new. Romantic roles are
 * the meeting pool: only adults with attraction both ways. Support roles find
 * the most trusted person who would step in.
 */
import type { CastSpec, ContentBundle, EventDef, GenderCategory } from '../../content/schemas';
import { CREATABLE_KINDS } from '../../content/schemas';
import { rollGenderCategory, rollIdentity, rollRelativeTraits } from '../creation/character';
import { pickUnused, rollHeritage } from '../creation/family';
import { rollCanCarry } from '../family/carrying';
import { rollPriorChildren } from '../family/children';
import { moodBaseline } from '../interactions/mood';
import { rollWealth } from '../interactions/wealth';
import { clampInt, rollScore, weightedPick } from '../random';
import { fitsPresence } from '../presence';
import { isAdmirerMatch, isRomanticMatch, partnerAgeRange, SUPPORT_KINDS } from '../relationships';
import { chance, nextInt, pick, type RngState } from '../rng';
import type { Id, LifeState, Person } from '../types';
import { ITEM_ROLE } from '../web/query';
import { evaluate } from '../conditions';
import { POSSESSION_ROLES } from '../../content/schemas';
import { livingPets, vacationHomesOf, vehiclesOf, possessionById } from '../possessions/query';
import { crowdMembers } from '../teen/query';
import { crewDef, crewPeople } from '../crime/query';
import { shapePerson } from '../crime/crew';

function personAge(state: LifeState, person: Person): number {
  return state.currentYear - person.birthYear;
}

function fitsAge(state: LifeState, spec: CastSpec, age: number): boolean {
  if (spec.age && (age < spec.age.min || age > spec.age.max)) return false;
  if (spec.ageOffset) {
    const offset = age - state.character.age;
    if (offset < spec.ageOffset.min || offset > spec.ageOffset.max) return false;
  }
  return true;
}

/**
 * Living people who fit the spec, in id order: of its kind (not faded out of
 * your life), of its ages, and for a romantic role a possible partner. For a
 * support role: close people (not estranged) whose trust and affection reach
 * the support thresholds, most trusted first. With preferHousehold (C1, home
 * and wellbeing events), a partner who lives with you is always a candidate,
 * first, whatever the thresholds: they are there, so they notice.
 */
export function castCandidates(state: LifeState, spec: CastSpec, content: ContentBundle, preferHousehold = false): Person[] {
  const support = content.balance.relationships.support;
  // E2a: someone who has died is only ever passed in, never found.
  if (spec.deceased) return [];
  const found = Object.keys(state.relationships)
    .sort()
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      if (!person || !person.alive || rel.status === 'ended') return [];
      if (spec.noticed) {
        // M1: someone who noticed you struggling and took it one of these ways.
        const noticing = state.health.mental.noticed[id];
        if (rel.status !== 'active' || !noticing || !spec.noticed.includes(noticing.reaction)) return [];
        if (spec.kind !== undefined && rel.kind !== spec.kind) return [];
      } else if (spec.support) {
        if (rel.status !== 'active' || !SUPPORT_KINDS.includes(rel.kind)) return [];
        const housePartner = preferHousehold && state.housing.partnerId === id;
        if (!housePartner && (rel.trust < support.minTrust || rel.affection < support.minAffection)) return [];
      } else if (spec.crowd) {
        // T1: someone from your crowd (or its rival's): a friend or classmate who is one of its members.
        if (!crowdMembers(state, spec.crowd).includes(id) || (rel.kind !== 'friend' && rel.kind !== 'classmate') || rel.status !== 'active') return [];
      } else if (spec.crew) {
        // E6a: someone from your crew (or the one that runs it, or who is talking to the police), or from the rival crew.
        if (!crewPeople(state, spec.crew).includes(id) || rel.status !== 'active') return [];
      } else if (rel.kind !== spec.kind) {
        return [];
      }
      if (spec.romantic && !isRomanticMatch(state, person, content)) return [];
      if (spec.admirer && !isAdmirerMatch(state, person, content)) return [];
      if (!fitsPresence(state, id, spec.presence, content)) return [];
      return fitsAge(state, spec, personAge(state, person)) ? [person] : [];
    });
  if (spec.noticed) {
    // The closest first.
    found.sort((a, b) => state.relationships[b.id]!.affection - state.relationships[a.id]!.affection || (a.id < b.id ? -1 : 1));
  }
  if (spec.support) {
    const rel = (p: Person) => state.relationships[p.id]!;
    // A partner who lives with you comes first for home and wellbeing (C1,
    // the household rule); otherwise the most trusted. Stable sort: ties keep id order.
    const first = (p: Person) => (preferHousehold && state.housing.partnerId === p.id ? 1 : 0);
    found.sort((a, b) => first(b) - first(a) || rel(b).trust - rel(a).trust || rel(b).affection - rel(a).affection);
  }
  return found;
}

/** The next free person id (p1, p2...). */
export function nextPersonId(state: LifeState): Id {
  let max = 0;
  for (const id of Object.keys(state.people)) {
    const n = Number(id.slice(1));
    if (id.startsWith('p') && Number.isInteger(n)) max = Math.max(max, n);
  }
  return `p${max + 1}`;
}

/** The age range a new person for this spec can have, or null if none is possible. */
function newPersonAgeRange(state: LifeState, spec: CastSpec, content: ContentBundle): { min: number; max: number } | null {
  let min = 0;
  let max = content.balance.events.newPerson.maxAge;
  if (spec.age) {
    min = Math.max(min, spec.age.min);
    max = Math.min(max, spec.age.max);
  }
  if (spec.ageOffset) {
    min = Math.max(min, state.character.age + spec.ageOffset.min);
    max = Math.min(max, state.character.age + spec.ageOffset.max);
  }
  if (spec.romantic || spec.admirer) {
    const range = partnerAgeRange(state.character.age, content);
    min = Math.max(min, range.min);
    max = Math.min(max, range.max);
  }
  return min <= max ? { min, max } : null;
}

/** A new potential partner's gender: one you're attracted to, by the usual weights. Null if you're attracted to no one. */
function romanticCategory(state: LifeState, rng: RngState, content: ContentBundle): GenderCategory | null {
  const wanted = state.character.identity.attractedTo;
  if (wanted.length === 0) return null;
  const weights = content.balance.creation.genderCategory;
  const options = wanted.map((c) => [c, weights[c] ?? 0] as const);
  return options.some(([, w]) => w > 0) ? weightedPick(rng, options) : pick(rng, wanted);
}

/**
 * A new admirer's gender (Stage 9): one you're not attracted to (yet),
 * leaning toward one your latent attraction includes. Null if you're
 * attracted to everyone.
 */
function admirerCategory(state: LifeState, rng: RngState, content: ContentBundle): GenderCategory | null {
  const mine = state.character.identity.attractedTo;
  const latent = state.character.latent.identity?.attractedTo ?? [];
  const weights = content.balance.creation.genderCategory;
  const options = (['man', 'woman', 'nonbinary'] as const)
    .filter((c) => !mine.includes(c))
    .map((c) => [c, Math.max(1, weights[c] ?? 0) * (latent.includes(c) ? 10 : 1)] as const);
  return options.length === 0 ? null : weightedPick(rng, options);
}

/**
 * Creates someone new for a role and adds them (and the relationship) to the
 * life. A romantic role creates an adult you're attracted to who is attracted
 * to you (and needs you to be an adult). The career system also uses it to
 * staff your workplace (bosses and coworkers).
 */
export function createPerson(state: LifeState, spec: CastSpec, rng: RngState, content: ContentBundle): Id | null {
  const kind = spec.kind;
  if (kind === undefined) return null;
  if ((spec.romantic || spec.admirer) && state.character.age < content.balance.relationships.adultAge) return null;
  // New people live in your city, or (a role that needs someone who lives
  // elsewhere) in another one; nobody new joins your household.
  if (spec.presence === 'household') return null;
  const range = newPersonAgeRange(state, spec, content);
  if (!range) return null;
  const city = content.cities[state.character.cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) return null;
  const romantic = spec.romantic ? romanticCategory(state, rng, content) : spec.admirer ? admirerCategory(state, rng, content) : null;
  if ((spec.romantic || spec.admirer) && romantic === null) return null;

  const age = nextInt(rng, range.min, range.max);
  const category = romantic ?? rollGenderCategory(rng, content);
  const heritage = pool.heritages[rollHeritage(rng, content, pool)]!;
  const used = new Set([state.character.name.first, ...Object.values(state.people).map((p) => p.name.first)]);
  const family = content.balance.creation.family;
  const id = nextPersonId(state);
  state.people[id] = {
    id,
    name: { first: pickUnused(rng, heritage.first[category], used), last: pick(rng, heritage.last) },
    birthYear: state.currentYear - age,
    alive: true,
    identity: rollIdentity(rng, content, category, spec.romantic || spec.admirer ? state.character.identity.genderCategory : undefined),
    traits: rollRelativeTraits(rng, content),
    looks: rollScore(rng, family.relativeLooks),
    smarts: rollScore(rng, family.relativeSmarts),
    cityId: spec.presence === 'elsewhere' ? otherCity(state, rng, content) : state.character.cityId,
    tags: [kind],
    // E1: set below, once they're in your life.
    mood: 50,
    moodBase: 50,
    wealthLevel: 'middle',
    canCarry: rollCanCarry(rng, category, content),
  };
  const newPerson = content.balance.events.newPerson;
  state.relationships[id] = {
    personId: id,
    kind,
    status: 'active',
    // E2b: your family's name goes before you: people start fonder (or cooler) by its reputation.
    affection: clampInt(rollScore(rng, newPerson.affection) + Math.round((state.lineage.reputation - 50) * content.balance.family.heir.newPersonAffection), 0, 100),
    trust: rollScore(rng, newPerson.trust),
    memories: [],
    since: state.currentYear,
  };
  // E1: their occupation and wealth level, and the mood they start in.
  const person = state.people[id]!;
  const wealth = rollWealth(state, kind, age, rng, content);
  if (wealth.occupation !== undefined) person.occupation = wealth.occupation;
  person.wealthLevel = wealth.wealthLevel;
  person.mood = person.moodBase = moodBaseline(state, person, content);
  // E2a: a potential partner may have children from before (they become your stepchildren if you marry).
  if (spec.romantic || spec.admirer) {
    const prior = rollPriorChildren(rng, age, state.currentYear, content);
    if (prior.length > 0) person.priorChildren = prior;
  }
  return id;
}

export interface CastResult {
  cast: Record<string, Id>;
  /** People created for this cast, so a rejected event can remove them again. */
  created: Id[];
}

/**
 * Casts every role of the event, in role-name order. `preset` roles (carried
 * over by a scheduled follow-up) are kept if that person is still alive.
 * Returns null when a role can't be filled (an optional role is left out
 * instead); anyone created is removed again.
 */
export function castEvent(
  state: LifeState,
  def: EventDef,
  rng: RngState,
  content: ContentBundle,
  preset: Record<string, Id> = {},
  /** A plain snapshot of `state` to read candidates from (faster than an Immer draft). */
  view: LifeState = state,
): CastResult | null {
  const cast: Record<string, Id> = {};
  const created: Id[] = [];
  const used = new Set<Id>();
  const fail = () => {
    uncast(state, created);
    return null;
  };

  for (const [role, id] of Object.entries(preset)) {
    // E4: the knowledge item an event is about travels in the cast under a pseudo-role.
    if (role === ITEM_ROLE) {
      cast[role] = id;
      continue;
    }
    // E5: the possession a follow-up is about must still be yours (a pet that died this year still counts for its own event).
    if ((Object.values(POSSESSION_ROLES) as string[]).includes(role)) {
      if (!possessionById(view, id)) return fail();
      cast[role] = id;
      continue;
    }
    const known = view.people[id];
    // Someone who has died can only fill a role that says so (E2a: the grief events).
    if (!known || (!known.alive && def.cast?.[role]?.deceased !== true)) return fail();
    cast[role] = id;
    used.add(id);
  }
  for (const role of Object.keys(def.cast ?? {}).sort()) {
    if (cast[role] !== undefined) continue;
    const spec = def.cast![role]!;
    const preferHousehold = content.registries.categories.categories[def.category]?.household === true;
    const options = castCandidates(view, spec, content, preferHousehold).filter((p) => !used.has(p.id));
    const canCreate =
      spec.createIfMissing === true && spec.kind !== undefined && (CREATABLE_KINDS as readonly string[]).includes(spec.kind) && (spec.crew === undefined || (spec.crew === 'rival' && state.crime.crew !== null));
    const wantsNew = canCreate && spec.newChance !== undefined && chance(rng, spec.newChance);
    let id: Id | null = null;
    // A support or noticed role goes to the most trusted (closest) person; others to anyone who fits.
    if (options.length > 0 && !wantsNew) id = spec.support || spec.noticed ? options[0]!.id : pick(rng, options).id;
    else if (canCreate) {
      id = createPerson(state, spec, rng, content);
      if (id) {
        created.push(id);
        // E6a: someone met from the rival crew joins its people.
        const crew = state.crime.crew;
        const def = spec.crew === 'rival' ? crewDef(content, crew?.rival) : undefined;
        if (crew && def) {
          crew.rivalMembers.push(id);
          shapePerson(state.people[id]!, def, `crew:${def.id}`);
          state.relationships[id]!.affection = rollScore(rng, content.balance.crime.entry.rivalAffection);
        }
      }
    }
    if (id === null) {
      if (spec.optional) continue;
      return fail();
    }
    cast[role] = id;
    used.add(id);
  }
  // E5: the possessions the event is about: one of each kind it binds, picked among those that make its requirements true.
  for (const kind of def.bind ?? []) {
    const key = POSSESSION_ROLES[kind];
    if (cast[key] !== undefined) continue;
    const pool = kind === 'pet' ? livingPets(view) : kind === 'vehicle' ? vehiclesOf(view) : vacationHomesOf(view);
    const fitting = pool.filter((p) => evaluate(def.requires, view, { cast: { ...cast, [key]: p.id }, roles: 'assumeTrue', content }));
    if (fitting.length === 0) return fail();
    cast[key] = pick(rng, fitting).id;
  }
  return { cast, created };
}

/** A city other than yours (for someone who lives elsewhere), from the active cities. */
export function otherCity(state: LifeState, rng: RngState, content: ContentBundle): Id {
  const options = Object.keys(content.cities)
    .sort()
    .filter((id) => id !== state.character.cityId && !content.cities[id]!.retired);
  return options.length > 0 ? pick(rng, options) : state.character.cityId;
}

/** Removes people created for a cast that was then rejected. */
export function uncast(state: LifeState, created: readonly Id[]): void {
  for (const id of created) {
    if (state.crime.crew) state.crime.crew.rivalMembers = state.crime.crew.rivalMembers.filter((m) => m !== id);
    delete state.people[id];
    delete state.relationships[id];
  }
}
