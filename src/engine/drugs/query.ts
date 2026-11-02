/**
 * Drugs (D1): small read-only helpers every part of the engine shares: the empty state, who may use, buy or deal, what you
 * hold, what a unit costs here and what the law would call it. Numbers: balance/drugs.yaml; the drugs: src/content/drugs.
 * Story and consequences only: nothing here says how to make, hide or use anything.
 */
import type { ContentBundle, DrugDef, DrugSource } from '../../content/schemas';
import { wholeDollars } from '../finance';
import { countryOf } from '../country';
import { isIncarcerated } from '../legal';
import { nextInt, type RngState } from '../rng';
import type { DrugHabit, DrugsState, Id, LifeState } from '../types';

export const emptyDrugs = (): DrugsState => ({
  last: null,
  stock: {},
  habits: {},
  dealers: [],
  signs: { count: 0, last: 0 },
  synced: 0,
  dealing: null,
  ops: [],
  nextOp: 1,
  year: { year: 0, uses: 0, bought: 0, spent: 0 },
  totals: { uses: 0, bought: 0, spent: 0, ripoffs: 0, robbed: 0, arrests: 0, scares: 0, visits: 0, hooked: 0, quits: 0, recoveries: 0, relapses: 0, sold: 0, earned: 0, produced: 0, raids: 0, overdoseDeaths: 0 },
});

export const emptyHabit = (): DrugHabit => ({
  dependence: 0,
  tolerance: 0,
  peak: 0,
  year: 0,
  uses: 0,
  total: 0,
  last: 0,
  clean: 0,
  quitYear: 0,
  recovered: false,
  relapses: 0,
});

/** Drug ids in a fixed order (so rolls never depend on file order). */
export function drugIds(content: ContentBundle): Id[] {
  return Object.keys(content.drugs)
    .filter((id) => !content.drugs[id]!.retired)
    .sort();
}

export function drugDef(content: ContentBundle, id: Id | undefined): DrugDef | undefined {
  const def = id === undefined ? undefined : content.drugs[id];
  return def && !def.retired ? def : undefined;
}

export function habitOf(state: LifeState, id: Id): DrugHabit | undefined {
  return state.drugs.habits[id];
}

/** The habit record for a drug, made when you first need it. */
export function ensureHabit(state: LifeState, id: Id): DrugHabit {
  return (state.drugs.habits[id] ??= emptyHabit());
}

/** Uses of a drug this year. */
export function usesThisYear(state: LifeState, id: Id): number {
  const h = state.drugs.habits[id];
  return h && h.year === state.currentYear ? h.uses : 0;
}

export function totalUsesThisYear(state: LifeState): number {
  const y = state.drugs.year;
  return y.year === state.currentYear ? y.uses : 0;
}

export function boughtThisYear(state: LifeState): number {
  const y = state.drugs.year;
  return y.year === state.currentYear ? y.bought : 0;
}

/** Rolls the year's counters over. */
export function rollYear(state: LifeState): void {
  const d = state.drugs;
  if (d.year.year !== state.currentYear) d.year = { year: state.currentYear, uses: 0, bought: 0, spent: 0 };
  for (const h of Object.values(d.habits)) if (h.year !== state.currentYear) { h.year = state.currentYear; h.uses = 0; }
}

/** Old enough to be offered or to take a drug at all. */
export function canUseAge(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.drugs.ages.use;
}

/** Old enough to buy, deal, make and buy for resale (adults only). */
export function isAdult(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.drugs.ages.adult;
}

/** The dealers you know who are alive and still in your life. */
export function liveDealers(state: LifeState): Id[] {
  return state.drugs.dealers.filter((id) => {
    const p = state.people[id];
    const r = state.relationships[id];
    return p !== undefined && p.alive && r !== undefined && r.status !== 'ended';
  });
}

/** Total units of a drug you hold. */
export function unitsOf(state: LifeState, id: Id): number {
  return state.drugs.stock[id]?.units ?? 0;
}

/** All units you hold of every drug. */
export function totalUnits(state: LifeState): number {
  return Object.values(state.drugs.stock).reduce((n, s) => n + s.units, 0);
}

/** How much you depend on a drug now (0–100). */
export function dependenceOn(state: LifeState, id: Id): number {
  return state.drugs.habits[id]?.dependence ?? 0;
}

/** The greatest dependence on any drug. */
export function maxDependence(state: LifeState): number {
  let m = 0;
  for (const h of Object.values(state.drugs.habits)) m = Math.max(m, h.dependence);
  return m;
}

/** Whether you are addicted to something now (dependence at or above the threshold). */
export function isAddicted(state: LifeState, content: ContentBundle): boolean {
  return maxDependence(state) >= content.balance.drugs.threshold;
}

/** The drugs you depend on at the threshold or above, worst first. */
export function addictedTo(state: LifeState, content: ContentBundle): Id[] {
  const t = content.balance.drugs.threshold;
  return Object.entries(state.drugs.habits)
    .filter(([, h]) => h.dependence >= t)
    .sort((a, b) => b[1].dependence - a[1].dependence || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
}

/** The drugs you have used, newest use first. */
export function usedDrugs(state: LifeState): Id[] {
  return Object.entries(state.drugs.habits)
    .filter(([, h]) => h.total > 0)
    .sort((a, b) => b[1].last - a[1].last || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
}

/** The price range of a drug where you live (US dollars): its own range for your city, else the base range scaled by cost of living. */
export function priceRange(state: LifeState, def: DrugDef, content: ContentBundle): { min: number; max: number } {
  const city = content.cities[state.character.cityId];
  const own = def.cities?.[state.character.cityId];
  if (own) return own;
  const k = 1 + ((city?.costOfLiving ?? 1) - 1) * content.balance.drugs.cityPrice;
  return { min: Math.max(1, Math.round(def.price.min * k)), max: Math.max(1, Math.round(def.price.max * k)) };
}

/** The price level of your country (prices are written at US levels). */
function countryLevel(state: LifeState, content: ContentBundle): number {
  return countryOf(state, content).priceLevel;
}

/** A unit's price from a source at a quality: a point in the range by quality, times the source's mark-up, in your country's money. Reads only. */
export function unitPrice(state: LifeState, def: DrugDef, source: DrugSource, quality: number, content: ContentBundle): number {
  const r = priceRange(state, def, content);
  const base = r.min + ((r.max - r.min) * Math.min(100, Math.max(0, quality))) / 100;
  return Math.max(1, wholeDollars(base * content.balance.drugs.sources[source].price * countryLevel(state, content)));
}

/** A price with the random variation a deal has (one draw), whole dollars. */
export function rollPrice(state: LifeState, def: DrugDef, source: DrugSource, quality: number, rng: RngState, content: ContentBundle): number {
  const base = unitPrice(state, def, source, quality, content);
  return Math.max(1, wholeDollars(base * (0.9 + nextInt(rng, 0, 20) / 100)));
}

/** Why you can't deal, make or buy for resale now, or null. */
export type TradeBlock = 'age' | 'jail';

export function tradeBlock(state: LifeState, content: ContentBundle): TradeBlock | null {
  if (!isAdult(state, content)) return 'age';
  if (isIncarcerated(state)) return 'jail';
  return null;
}

/** Whether you hold any stock. */
export function holdsAny(state: LifeState): boolean {
  return totalUnits(state) > 0;
}

/** The units held that could be found: all that is not hidden, and the hidden at the share that a search misses. */
export function visibleUnits(state: LifeState): number {
  return Object.values(state.drugs.stock).reduce((n, s) => n + (s.hidden ? 0 : s.units), 0);
}
