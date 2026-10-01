/**
 * Relationship rules (docs/design.md, section H): which kinds belong
 * together, who is attracted to whom, the adults-only rule for romance, and
 * which changes a relationship may go through. Casting, effects, conditions,
 * actions, invariants and selectors all ask these functions, so each rule
 * lives in one place.
 */
import type { ContentBundle, EventDef, Outcome, RomanceStatus } from '../content/schemas';
import { curveAt } from './curve';
import type { Id, Identity, LifeState, Person, Relationship, RelationshipKind, RelationshipStatus } from './types';

export const FAMILY_KINDS: readonly RelationshipKind[] = ['parent', 'stepparent', 'grandparent', 'sibling'];
/** A current romance: dating, engaged or married. */
export const PARTNER_KINDS: readonly RelationshipKind[] = ['partner', 'fiance', 'spouse'];
/** Every romantic kind, including exes. */
export const ROMANTIC_KINDS: readonly RelationshipKind[] = [...PARTNER_KINDS, 'ex'];
export const WORK_KINDS: readonly RelationshipKind[] = ['coworker', 'boss'];
/** Kinds a content effect may turn a relationship into (family and work come from their own systems). */
export const EFFECT_KINDS: readonly RelationshipKind[] = ['friend', 'classmate', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex'];
/** Kinds that can step in during a crisis (support roles). */
export const SUPPORT_KINDS: readonly RelationshipKind[] = [...FAMILY_KINDS, 'friend', ...PARTNER_KINDS];
/** Kinds you can ask out: people you know who aren't family and aren't already your partner. */
export const ASKABLE_KINDS: readonly RelationshipKind[] = ['friend', 'acquaintance', 'classmate', 'coworker', 'boss', 'ex'];

export const isFamilyKind = (kind: RelationshipKind) => FAMILY_KINDS.includes(kind);
export const isPartnerKind = (kind: RelationshipKind) => PARTNER_KINDS.includes(kind);
export const isRomanticKind = (kind: RelationshipKind) => ROMANTIC_KINDS.includes(kind);

/** Someone's age this year, or at death. */
export function ageOf(state: LifeState, person: Person): number {
  return (person.deathYear ?? state.currentYear) - person.birthYear;
}

/** The year the relationship took its current kind. */
export function kindSince(rel: Relationship): number {
  return rel.kindSince ?? rel.since;
}

/** Whole years the relationship has had its current kind. */
export function yearsInKind(state: LifeState, rel: Relationship): number {
  return state.currentYear - kindSince(rel);
}

/** True when `a` is attracted to `b`'s gender category. */
export function attractedTo(a: Identity, b: Identity): boolean {
  return a.attractedTo.includes(b.genderCategory);
}

/** Two-way attraction: you're attracted to them and they're attracted to you. */
export function mutualAttraction(state: LifeState, person: Person): boolean {
  return attractedTo(state.character.identity, person.identity) && attractedTo(person.identity, state.character.identity);
}

/** True when you and this person are both old enough for romance. */
export function bothAdults(state: LifeState, person: Person, content: ContentBundle): boolean {
  const { adultAge } = content.balance.relationships;
  return state.character.age >= adultAge && ageOf(state, person) >= adultAge;
}

/**
 * The ages a new potential partner can have when you are `age`
 * (balance/relationships.yaml meeting): a gap below and above your age that
 * widens as you get older, never below the adult age. Empty (min > max) when
 * you're not an adult yourself.
 */
export function partnerAgeRange(age: number, content: ContentBundle): { min: number; max: number } {
  const { adultAge, meeting } = content.balance.relationships;
  if (age < adultAge) return { min: adultAge, max: adultAge - 1 };
  return {
    min: Math.max(adultAge, age - Math.round(curveAt(meeting.younger, age))),
    max: age + Math.round(curveAt(meeting.older, age)),
  };
}

/**
 * A possible partner: a living adult (and you an adult too), not family,
 * with attraction both ways.
 */
export function isRomanticMatch(state: LifeState, person: Person, content: ContentBundle): boolean {
  const rel = state.relationships[person.id];
  if (!person.alive || (rel && isFamilyKind(rel.kind))) return false;
  return bothAdults(state, person, content) && mutualAttraction(state, person);
}

/**
 * A possible admirer for a "try it and decide" moment (Stage 9): a living
 * adult (you an adult too), not family, attracted to you, of a gender you're
 * not attracted to (yet).
 */
export function isAdmirerMatch(state: LifeState, person: Person, content: ContentBundle): boolean {
  const rel = state.relationships[person.id];
  if (!person.alive || (rel && isFamilyKind(rel.kind))) return false;
  const me = state.character.identity;
  return bothAdults(state, person, content) && attractedTo(person.identity, me) && !attractedTo(me, person.identity);
}

/** True when this relationship is a current romance (living, active partner, fiancé or spouse). */
export function isCurrentPartner(state: LifeState, rel: Relationship): boolean {
  return isPartnerKind(rel.kind) && rel.status === 'active' && state.people[rel.personId]?.alive === true;
}

/** Your current partner, fiancé or spouse, if any (there is never more than one). */
export function currentPartner(state: LifeState): Relationship | null {
  for (const rel of Object.values(state.relationships)) {
    if (isCurrentPartner(state, rel)) return rel;
  }
  return null;
}

/** Single, dating, engaged or married, from your current partner. */
export function romanceStatus(state: LifeState): RomanceStatus {
  const partner = currentPartner(state);
  if (!partner) return 'single';
  return partner.kind === 'spouse' ? 'married' : partner.kind === 'fiance' ? 'engaged' : 'dating';
}

/**
 * Whether the relationship with this person may take a new kind. The engine
 * checks every kind change against these rules, whatever the content says:
 *
 * - Family stays family, and nobody becomes family through an event.
 * - Romance (partner, fiancé, spouse) needs both people to be living adults
 *   with attraction both ways, and you can have only one partner at a time.
 * - Dating comes before an engagement; a wedding follows dating or an
 *   engagement; an ex is someone you dated, were engaged to or married.
 * - A current partner stops being one only by becoming an ex.
 */
export function canChangeKind(state: LifeState, personId: Id, to: RelationshipKind, content: ContentBundle): boolean {
  const rel = state.relationships[personId];
  const person = state.people[personId];
  if (!rel || !person) return false;
  const from = rel.kind;
  if (from === to) return true;
  if (isFamilyKind(from) || isFamilyKind(to)) return false;
  if (!person.alive) return false;

  if (isPartnerKind(to)) {
    if (rel.status !== 'active' || !bothAdults(state, person, content)) return false;
    const partner = currentPartner(state);
    if (partner && partner.personId !== personId) return false;
    if (to === 'partner') return !isPartnerKind(from) && mutualAttraction(state, person);
    if (to === 'fiance') return from === 'partner';
    return from === 'partner' || from === 'fiance';
  }
  if (to === 'ex') return isPartnerKind(from);
  // Anyone else (friend, acquaintance...): not straight from a current romance.
  return !isPartnerKind(from);
}

/** Whether the relationship may take this status: a current partner can't be estranged or forgotten. */
export function canSetStatus(state: LifeState, personId: Id, status: RelationshipStatus): boolean {
  const rel = state.relationships[personId];
  if (!rel) return false;
  return status === 'active' || !isCurrentPartner(state, rel);
}

function outcomesOf(def: EventDef): Outcome[] {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

const romanceCache = new WeakMap<EventDef, boolean>();

/**
 * A romance event: its category is marked romance, it casts a partner,
 * fiancé, spouse, ex, potential partner or admirer, or it can turn someone into one.
 * Romance events are for adults only.
 */
export function isRomanceEvent(def: EventDef, content: ContentBundle): boolean {
  let cached = romanceCache.get(def);
  if (cached === undefined) {
    cached =
      content.registries.categories.categories[def.category]?.romance === true ||
      Object.values(def.cast ?? {}).some(
        (spec) => spec.romantic === true || spec.admirer === true || (spec.kind !== undefined && isRomanticKind(spec.kind)),
      ) ||
      outcomesOf(def).some((o) => o.effects.some((e) => e.type === 'relationship' && e.kind !== undefined && isRomanticKind(e.kind)));
    romanceCache.set(def, cached);
  }
  return cached;
}

/**
 * The adults-only rule, checked by the engine whatever the content says: a
 * romance event happens only when you and everyone cast in it are adults.
 */
export function romanceAllowed(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): boolean {
  if (!isRomanceEvent(def, content)) return true;
  const { adultAge } = content.balance.relationships;
  if (state.character.age < adultAge) return false;
  return Object.values(cast).every((id) => {
    const person = state.people[id];
    return person !== undefined && ageOf(state, person) >= adultAge;
  });
}
