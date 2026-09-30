/**
 * Casting: fills each role of an event with an existing person who fits, or
 * (for friends, classmates and acquaintances) someone new.
 */
import type { CastSpec, ContentBundle, EventDef } from '../../content/schemas';
import { CREATABLE_KINDS } from '../../content/schemas';
import { rollGenderCategory, rollIdentity, rollRelativeTraits } from '../creation/character';
import { pickUnused, rollHeritage } from '../creation/family';
import { rollScore } from '../random';
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

/** Living people with a relationship of the spec's kind who fit its ages, in id order. */
export function castCandidates(state: LifeState, spec: CastSpec): Person[] {
  return Object.keys(state.relationships)
    .sort()
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      if (!person || !person.alive || rel.kind !== spec.kind || rel.status === 'ended') return [];
      return fitsAge(state, spec, personAge(state, person)) ? [person] : [];
    });
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
  return min <= max ? { min, max } : null;
}

/** Creates someone new for a role and adds them (and the relationship) to the life. */
function createPerson(state: LifeState, spec: CastSpec, rng: RngState, content: ContentBundle): Id | null {
  const range = newPersonAgeRange(state, spec, content);
  if (!range) return null;
  const city = content.cities[state.character.cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) return null;

  const age = nextInt(rng, range.min, range.max);
  const category = rollGenderCategory(rng, content);
  const heritage = pool.heritages[rollHeritage(rng, content, pool)]!;
  const used = new Set([state.character.name.first, ...Object.values(state.people).map((p) => p.name.first)]);
  const family = content.balance.creation.family;
  const id = nextPersonId(state);
  state.people[id] = {
    id,
    name: { first: pickUnused(rng, heritage.first[category], used), last: pick(rng, heritage.last) },
    birthYear: state.currentYear - age,
    alive: true,
    identity: rollIdentity(rng, content, category),
    traits: rollRelativeTraits(rng, content),
    looks: rollScore(rng, family.relativeLooks),
    smarts: rollScore(rng, family.relativeSmarts),
    cityId: state.character.cityId,
    tags: [spec.kind],
  };
  const newPerson = content.balance.events.newPerson;
  state.relationships[id] = {
    personId: id,
    kind: spec.kind,
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
 * Returns null when a role can't be filled; anyone created is removed again.
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
    const options = castCandidates(view, spec).filter((p) => !used.has(p.id));
    const canCreate = spec.createIfMissing === true && (CREATABLE_KINDS as readonly string[]).includes(spec.kind);
    const wantsNew = canCreate && spec.newChance !== undefined && chance(rng, spec.newChance);
    let id: Id | null = null;
    if (options.length > 0 && !wantsNew) id = pick(rng, options).id;
    else if (canCreate) {
      id = createPerson(state, spec, rng, content);
      if (id) created.push(id);
    }
    if (id === null) return fail();
    cast[role] = id;
    used.add(id);
  }
  return { cast, created };
}

/** Removes people created for a cast that was then rejected. */
export function uncast(state: LifeState, created: readonly Id[]): void {
  for (const id of created) {
    delete state.people[id];
    delete state.relationships[id];
  }
}
