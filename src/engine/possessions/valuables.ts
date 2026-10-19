/**
 * Valuables (Batch 2a, extending E5; this reverses E5's "no valuables"
 * decision at the playtester's request): jewelry, designer goods, art and
 * boats. A Luxury activity that buys one pays its price through the finance
 * module and the item is worth that price at first. Each year its value moves
 * by its class's drift (jewelry and art hold or grow, designer goods and boats
 * lose value) plus a seeded swing; upkeep and insurance are shares of the
 * value; a theft is an event (registries/possessions.yaml) that pays out when
 * the item is insured. Selling brings a share of the value. Numbers come from
 * src/content/balance/possessions.yaml (valuables). Valuables pass through the
 * estate like any possession (./../estate/possessions.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import { earn, isIndependent, wholeDollars } from '../finance';
import { nextFloat } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState, Possession } from '../types';
import { nextPossessionId, possessionById, possessionNoun, valuableDef, valuableOf, valuablesOf } from './query';

const vb = (content: ContentBundle) => content.balance.possessions.valuables;

/** The numbers for a valuable's class. */
export function classNumbers(p: Possession, content: ContentBundle) {
  return vb(content).classes[valuableDef(content, p).class];
}

/** Why you can't take on another valuable now, or null. */
export function valuableBlock(state: LifeState, defId: Id, content: ContentBundle): 'unknown' | 'limit' | 'age' | null {
  const def = content.valuables[defId];
  if (!def || def.retired) return 'unknown';
  if (!isIndependent(state, content)) return 'age';
  if (valuablesOf(state).length >= content.balance.possessions.limits.valuables) return 'limit';
  return null;
}

/** A valuable becomes yours, worth what you paid (the caller has taken the payment). Returns it. */
export function addValuable(state: LifeState, defId: Id, price: number, content: ContentBundle): Possession {
  const p: Possession = {
    id: nextPossessionId(state),
    kind: 'valuable',
    defId,
    acquired: state.currentYear,
    value: wholeDollars(Math.max(0, price)),
    condition: 100,
    valuable: { insured: true },
  };
  state.possessions.items.push(p);
  writeFromGroup(state, content.text.possessions.history.valuableBought, ['possessions', 'valuableBought', `valuable:${defId}`], { values: { valuable: possessionNoun(p, content) } }, content);
  return p;
}

/** What a sale would bring now. */
export function valuableSaleValue(p: Possession, content: ContentBundle): number {
  return wholeDollars(p.value * classNumbers(p, content).sellShare);
}

/** Sells a valuable (the caller has checked you own it): the sale goes to savings. */
export function sellValuable(state: LifeState, id: Id, content: ContentBundle): void {
  const p = possessionById(state, id);
  if (!p || p.kind !== 'valuable') return;
  const noun = possessionNoun(p, content);
  earn(state, valuableSaleValue(p, content));
  state.possessions.items = state.possessions.items.filter((q) => q.id !== p.id);
  writeFromGroup(state, content.text.possessions.history.valuableSold, ['possessions', 'valuableSold'], { values: { valuable: noun } }, content);
}

/** Insurance on or off for every valuable you own. */
export function setValuableInsurance(state: LifeState, insured: boolean): void {
  for (const p of valuablesOf(state)) valuableOf(p).insured = insured;
}

/** What this year's upkeep of one valuable comes to. */
export function valuableUpkeep(p: Possession, content: ContentBundle): number {
  return wholeDollars(p.value * classNumbers(p, content).upkeep);
}

/** This year's premium for one insured valuable. */
export function valuablePremium(p: Possession, content: ContentBundle): number {
  return valuableOf(p).insured ? wholeDollars(p.value * classNumbers(p, content).insurance) : 0;
}

/** The yearly upkeep and insurance of every valuable you own (stored away, and free, while you are in prison). */
export function valuableCosts(state: LifeState, content: ContentBundle): { upkeep: number; insurance: number } {
  if (state.housing.kind === 'incarcerated') return { upkeep: 0, insurance: 0 };
  let upkeep = 0;
  let insurance = 0;
  for (const p of valuablesOf(state)) {
    upkeep += valuableUpkeep(p, content);
    insurance += valuablePremium(p, content);
  }
  return { upkeep, insurance };
}

/** The year's move in value: the class's drift plus a seeded swing of up to its volatility either way. */
export function driftValuable(state: LifeState, p: Possession, content: ContentBundle): void {
  const c = classNumbers(p, content);
  const swing = (nextFloat(state.rng) * 2 - 1) * c.volatility;
  p.value = Math.max(0, wholeDollars(p.value * (1 + c.drift + swing)));
}

/** The yearly chance a valuable is stolen. */
export function theftChance(p: Possession, content: ContentBundle): number {
  return classNumbers(p, content).theft;
}

/** A valuable is stolen: the insurer pays out a share of its value when it is insured. Returns what was paid out. */
export function stealValuable(state: LifeState, p: Possession, content: ContentBundle): number {
  const payout = valuableOf(p).insured ? wholeDollars(p.value * vb(content).payout) : 0;
  earn(state, payout);
  state.possessions.items = state.possessions.items.filter((q) => q.id !== p.id);
  return payout;
}
