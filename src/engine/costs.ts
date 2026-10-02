/**
 * One-time costs and rent-scaled money (C1, docs/expansion.md): what events
 * charge through the finance module, sized to the situation. A cost item
 * (balance/economy.yaml costs, such as a wedding) scales with your city's
 * cost of living, and your family may chip in by its wealth and how close
 * you are; savings pay first and the rest becomes personal debt (spend).
 */
import type { ContentBundle } from '../content/schemas';
import { spend, wholeDollars } from './finance';
import type { LifeState } from './types';

/** The cost item's full price in your city. Throws for an unknown item (the content build checks them). */
export function costPrice(state: LifeState, item: string, content: ContentBundle): number {
  const def = content.balance.economy.costs[item];
  if (!def) throw new Error(`Unknown cost item "${item}".`);
  return wholeDollars(def.amount * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
}

/**
 * What your family covers of this cost: the share for its wealth, times how
 * close you are to your closest living parent; nothing below the minimum
 * closeness, with no living parent, or for an item they don't help with.
 */
export function familyHelp(state: LifeState, item: string, content: ContentBundle): number {
  const def = content.balance.economy.costs[item];
  if (!def?.familyHelp) return 0;
  const help = content.balance.economy.familyHelp;
  let closeness = -1;
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    if ((rel.kind !== 'parent' && rel.kind !== 'stepparent') || rel.status !== 'active' || !state.people[id]?.alive) continue;
    closeness = Math.max(closeness, rel.affection);
  }
  if (closeness < help.minAffection) return 0;
  return wholeDollars(costPrice(state, item, content) * help.share[state.character.familyWealth] * (closeness / 100));
}

/** What the cost takes from you after family help. */
export function costToYou(state: LifeState, item: string, content: ContentBundle): number {
  return Math.max(0, costPrice(state, item, content) - familyHelp(state, item, content));
}

/** Pays the cost: savings first, the rest as personal debt. */
export function payCost(state: LifeState, item: string, content: ContentBundle): void {
  spend(state, costToYou(state, item, content), content);
}

/** Money worth `months` months of your current yearly housing cost (negative: a payment). */
export function rentMonthsAmount(state: LifeState, months: number): number {
  return wholeDollars((state.housing.annualCost / 12) * months);
}
