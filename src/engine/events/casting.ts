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
import { rollScore, weightedPick } from '../random';
import { fitsPresence } from '../presence';
import { isAdmirerMatch, isRomanticMatch, partnerAgeRange, SUPPORT_KINDS } from '../relationships';
import { chance, nextInt, pick, type RngState } from '../rng';
import type { Id, LifeState, Person } from '../types';

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
 * the support thresholds, most trusted first.
 */
export function castCandidates(state: LifeState, spec: CastSpec, content: ContentBundle, preferHousehold = false): Person[] {
  const support = content.balance.relationships.support;
  const found = Object.keys(state.relationships)
    .sort()
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      if (!person || !person.alive || rel.status === 'ended') return [];
      if (spec.support) {
        if (rel.status !== 'active' || !SUPPORT_KINDS.includes(rel.kind)) return [];
        if (rel.trust < support.minTrust || rel.affection < support.minAffection) return [];
      } else if (rel.kind !== spec.kind) {
        return [];
      }
      if (spec.romantic && !isRomanticMatch(state, person, content)) return [];
      if (spec.admirer && !isAdmirerMatch(state, person, content)) return [];
      if (!fitsPresence(state, id, spec.presence, content)) return [];
      return fitsAge(state, spec, personAge(state, person)) ? [person] : [];
    });
  if (spec.support) {
    const rel = (p: Person) => state.relationships[p.id]!;
    // A partner who lives with you comes first for home and wellbeing (C1,
    // the household rule); otherwise the most trusted. Stable sort: ties keep id order.
    const first = (p: Person) => (preferHousehold && state.housing.partnerId === p.id ? 1 : 0);
    found.sort((a, b) => first(b) - first(a) || rel(b).trust - rel(a).trust || rel(b).affection - rel(a).affection);
  }
  return found;
}

function nextPersonId(state: LifeState): Id {
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
  };
  const newPerson = content.balance.events.newPerson;
  state.relationships[id] = {
    personId: id,
    kind,
    status: 'active',
    affection: rollScore(rng, newPerson.affection),
    trust: rollScore(rng, newPerson.trust),
    memories: [],
    since: state.currentYear,
  };
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
    if (!view.people[id]?.alive) return fail();
    cast[role] = id;
    used.add(id);
  }
  for (const role of Object.keys(def.cast ?? {}).sort()) {
    if (cast[role] !== undefined) continue;
    const spec = def.cast![role]!;
    const preferHousehold = content.registries.categories.categories[def.category]?.household === true;
    const options = castCandidates(view, spec, content, preferHousehold).filter((p) => !used.has(p.id));
    const canCreate =
      spec.createIfMissing === true && spec.kind !== undefined && (CREATABLE_KINDS as readonly string[]).includes(spec.kind);
    const wantsNew = canCreate && spec.newChance !== undefined && chance(rng, spec.newChance);
    let id: Id | null = null;
    // A support role goes to the most trusted person; others to anyone who fits.
    if (options.length > 0 && !wantsNew) id = spec.support ? options[0]!.id : pick(rng, options).id;
    else if (canCreate) {
      id = createPerson(state, spec, rng, content);
      if (id) created.push(id);
    }
    if (id === null) {
      if (spec.optional) continue;
      return fail();
    }
    cast[role] = id;
    used.add(id);
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
    delete state.people[id];
    delete state.relationships[id];
  }
}
