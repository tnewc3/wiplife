/**
 * Who can carry a pregnancy, and how likely one is (E2a). Whether someone
 * can carry follows from their gender category when they are created: women
 * can, men can't, and a nonbinary character chooses (random ones and the
 * people you meet roll a chance). It never changes afterwards. A natural
 * pregnancy needs a pair where exactly one can carry; every other way of
 * having a child (IVF, surrogacy, adoption) is a process in ./process.ts.
 * The numbers are in balance/family.yaml.
 */
import type { ContentBundle, GenderCategory } from '../../content/schemas';
import { curveAt } from '../curve';
import { ageOf, bothAdults } from '../relationships';
import { chance, type RngState } from '../rng';
import type { Id, LifeState } from '../types';

/** Rolls whether someone of this gender category can carry a pregnancy. Draws a number only for a nonbinary person. */
export function rollCanCarry(rng: RngState, category: GenderCategory, content: ContentBundle): boolean {
  if (category === 'woman') return true;
  if (category === 'man') return false;
  return chance(rng, content.balance.family.carrying.nonbinaryChance);
}

/** What follows from the gender category alone (a woman can, anyone else can't); used when no choice was made. */
export function defaultCanCarry(category: GenderCategory): boolean {
  return category === 'woman';
}

/** Who carries a pregnancy: you, or another person by id. */
export type Carrier = 'you' | Id;

/** Who would carry a natural pregnancy with this person: whichever of you two can, when exactly one can. */
export function naturalCarrier(state: LifeState, personId: Id): Carrier | null {
  const other = state.people[personId];
  if (!other) return null;
  const you = state.character.canCarry;
  if (you === other.canCarry) return null;
  return you ? 'you' : personId;
}

/** The carrier's age and, for you, Health; other people count as the balance's npcHealth. */
function carrierProfile(state: LifeState, carrier: Carrier, content: ContentBundle): { age: number; health: number } {
  if (carrier === 'you') return { age: state.character.age, health: state.character.stats.health };
  const person = state.people[carrier];
  return { age: person ? ageOf(state, person) : 99, health: content.balance.family.fertility.npcHealth };
}

/** The carrier's age this year. */
export function carrierAge(state: LifeState, carrier: Carrier, content: ContentBundle): number {
  return carrierProfile(state, carrier, content).age;
}

/**
 * How fertile a pair is (0–1): the carrier's age, the other parent's age
 * (`otherId`: the person you'd have the baby with; their age counts when you
 * carry, yours when they do) and the carrier's Health.
 */
export function fertilityFactor(state: LifeState, carrier: Carrier, otherId: Id | undefined, content: ContentBundle): number {
  const f = content.balance.family.fertility;
  const { age, health } = carrierProfile(state, carrier, content);
  let factor = curveAt(f.carrierAge, age) * curveAt(f.health, health);
  const otherPerson = otherId === undefined ? undefined : state.people[otherId];
  const otherAge = carrier === 'you' ? (otherPerson ? ageOf(state, otherPerson) : undefined) : state.character.age;
  if (otherAge !== undefined) factor *= curveAt(f.otherAge, otherAge);
  return factor;
}

/**
 * How fertile a pair is (0–1) from the carrier's age and the other parent's,
 * for someone other than you (E3: the people you know), whose Health counts
 * as the balance's npcHealth.
 */
export function carrierFactorFor(carrierAgeYears: number, otherAgeYears: number, content: ContentBundle): number {
  const f = content.balance.family.fertility;
  return curveAt(f.carrierAge, carrierAgeYears) * curveAt(f.health, f.npcHealth) * curveAt(f.otherAge, otherAgeYears);
}

/** A pregnancy or a process is already under way. */
export function familyBusy(state: LifeState): boolean {
  return state.family.pregnancy !== null || state.family.process !== null;
}

/**
 * Whether a natural pregnancy with this person is possible at all: you're in
 * the same adult situation as romance (both adults, they're alive and still
 * in your life), exactly one of you can carry, nothing is already under way.
 */
export function canConceiveWith(state: LifeState, personId: Id, content: ContentBundle): boolean {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person?.alive || !rel || rel.status === 'ended' || familyBusy(state)) return false;
  return bothAdults(state, person, content) && naturalCarrier(state, personId) !== null;
}

/** The chance (0–1) a year of trying with this person starts a pregnancy; planning around it adds the balance's bonus. */
export function tryChance(state: LifeState, personId: Id, plan: boolean, content: ContentBundle): number {
  if (!canConceiveWith(state, personId, content)) return 0;
  const carrier = naturalCarrier(state, personId)!;
  const f = content.balance.family.fertility;
  const factor = fertilityFactor(state, carrier, personId, content);
  if (factor <= 0) return 0;
  return Math.min(1, f.tryChance * factor + (plan ? f.planBonus : 0));
}

/** The chance (0–1) an intimate night with this person starts a pregnancy, by the protection you chose. 0 when no pregnancy is possible. */
export function conceiveChance(state: LifeState, personId: Id, protection: 'careful' | 'carefree', content: ContentBundle): number {
  if (!canConceiveWith(state, personId, content)) return 0;
  const carrier = naturalCarrier(state, personId)!;
  const base = content.balance.family.unplanned[protection === 'careful' ? 'careful' : 'carefree'];
  return Math.min(1, base * fertilityFactor(state, carrier, personId, content));
}
