/**
 * Using a drug (D1): taken from your own stock, light or heavy. Short term it moves Happiness, Stress and Health (less
 * with a weak batch or a high tolerance, and less with each repeat in a year); it raises dependence and tolerance; and it
 * can go wrong. A first try never does. A bad hour (a scare) is the warning sign an overdose needs before it can kill, and
 * an action never kills: a death comes only from the yearly step (./overdose.ts), after warning signs.
 * Story and consequences only. Numbers: balance/drugs.yaml (use, overdose).
 */
import type { ContentBundle, DrugDef, UseDose } from '../../content/schemas';
import { payMedical } from '../health';
import { clampInt } from '../random';
import { chance } from '../rng';
import { isIncarcerated } from '../legal';
import type { Id, LifeState } from '../types';
import { addDependence, addTolerance, syncAddiction, viceFactor } from './habit';
import { canUseAge, drugDef, ensureHabit, rollYear, totalUsesThisYear, usesThisYear } from './query';
import { dollarText, note, say, unitsText } from './text';
import { wholeDollars } from '../finance';
import { medicalPrice } from '../country';

export type UseBlock = 'age' | 'jail' | 'none' | 'stock' | 'limit' | 'drug';

export function useBlock(state: LifeState, drugId: Id, dose: UseDose, content: ContentBundle): UseBlock | null {
  const def = drugDef(content, drugId);
  if (!def) return 'drug';
  if (!canUseAge(state, content)) return 'age';
  if (isIncarcerated(state)) return 'jail';
  if (totalUsesThisYear(state) >= content.balance.drugs.use.perYear) return 'limit';
  const units = content.balance.drugs.use.doses[dose].units;
  const have = state.drugs.stock[drugId]?.units ?? 0;
  if (have <= 0) return 'none';
  if (have < units) return 'stock';
  return null;
}

/** The effect scale of a use: dose, batch quality, tolerance, and the diminishing return of repeats. Reads only. */
export function effectScale(state: LifeState, drugId: Id, dose: UseDose, quality: number, content: ContentBundle): number {
  const u = content.balance.drugs.use;
  const h = state.drugs.habits[drugId];
  const q = 1 + ((quality - 50) / 50) * u.quality;
  const t = 1 - ((h?.tolerance ?? 0) / 100) * u.blunt;
  const repeats = u.repeats ** usesThisYear(state, drugId);
  return u.doses[dose].effect * q * t * repeats;
}

/** The chance a use goes wrong: the drug's, times the dose, tolerance on a heavy dose, a bad batch, dependence and mixing. Reads only. */
export function badChance(state: LifeState, def: DrugDef, dose: UseDose, quality: number, content: ContentBundle): number {
  const b = content.balance.drugs;
  const h = state.drugs.habits[def.id];
  if (!h || h.total === 0) return 0; // a first try never goes wrong
  let p = def.overdose * b.use.doses[dose].risk;
  if (dose === 'heavy') p *= 1 + (h.tolerance / 100) * b.overdose.tolerance;
  if (quality < b.buy.badQuality + 10) p *= b.overdose.bad;
  p *= 1 + (h.dependence / 100) * b.overdose.dependence;
  const others = Object.entries(state.drugs.habits).some(([id, x]) => id !== def.id && x.year === state.currentYear && x.uses > 0);
  if (others) p *= b.use.mixing;
  return Math.min(0.5, p);
}

/** A warning sign: a bad hour or an ER visit. A death needs one first. */
export function addSign(state: LifeState, drugId: Id): void {
  state.drugs.signs = { count: state.drugs.signs.count + 1, last: state.currentYear, drug: drugId };
}

/** An ER visit: the bill (medical debt for what savings can't cover), Health and Stress. Returns the bill. */
export function erVisit(state: LifeState, content: ContentBundle, drugId: Id): number {
  const e = content.balance.drugs.overdose.er;
  const bill = wholeDollars(e.bill * medicalPrice(state, 'treatment', content));
  payMedical(state, bill, content);
  const s = state.character.stats;
  s.health = clampInt(s.health - e.health, 0, 100);
  s.stress = clampInt(s.stress + e.stress, 0, 100);
  state.drugs.totals.visits += 1;
  addSign(state, drugId);
  return bill;
}

export function scare(state: LifeState, content: ContentBundle, drugId: Id): void {
  const e = content.balance.drugs.overdose.scare;
  const s = state.character.stats;
  s.health = clampInt(s.health - e.health, 0, 100);
  s.stress = clampInt(s.stress + e.stress, 0, 100);
  state.drugs.totals.scares += 1;
  addSign(state, drugId);
}

/**
 * You use a drug from your stock (the caller has checked `useBlock`), or one that was offered to you (`offered`, a batch of that quality, nothing
 * taken from stock). What came of it is in `drugs.last` for the screen.
 */
export function useDrug(state: LifeState, drugId: Id, dose: UseDose, content: ContentBundle, offered?: { quality: number }): void {
  const def = drugDef(content, drugId)!;
  const b = content.balance.drugs;
  rollYear(state);
  const stock = state.drugs.stock[drugId];
  const units = b.use.doses[dose].units;
  const quality = offered?.quality ?? stock!.quality;
  const h = ensureHabit(state, drugId);
  const first = h.total === 0;
  const scale = effectScale(state, drugId, dose, quality, content);
  const p = badChance(state, def, dose, quality, content);

  if (stock && !offered) {
    stock.units -= units;
    if (stock.units <= 0) delete state.drugs.stock[drugId];
  }
  const stats = state.character.stats;
  stats.happiness = clampInt(stats.happiness + Math.round(def.effects.happiness * scale), 0, 100);
  stats.stress = clampInt(stats.stress + Math.round(def.effects.stress * scale), 0, 100);
  stats.health = clampInt(stats.health + Math.round(def.effects.health * b.use.doses[dose].effect), 0, 100);

  const gain = def.strength * viceFactor(state, content) * b.use.doses[dose].dependence * (first ? b.use.first : 1);
  const hooked = addDependence(state, drugId, gain, content);
  addTolerance(state, drugId, def.tolerance * b.use.doses[dose].dependence);
  if (h.quitYear > 0) h.quitYear = 0;
  h.clean = 0;
  h.recovered = false;
  h.uses += 1;
  h.year = state.currentYear;
  h.total += 1;
  h.last = state.currentYear;
  state.drugs.year.uses += 1;
  state.drugs.totals.uses += 1;

  const drug = def.noun;
  say(state, first ? 'firstTry' : 'used', { drug }, content);
  let kind: string = dose === 'heavy' ? 'heavy' : 'light';
  let text = note(dose === 'heavy' ? 'usedHeavy' : 'usedLight', { drug }, content);
  if (p > 0 && chance(state.rng, p)) {
    // Never death here, and never without a sign first: the first bad hour is the sign.
    const o = b.overdose.outcomes;
    const er = state.drugs.signs.count > 0 && chance(state.rng, o.er / (o.er + o.scare));
    if (er) {
      const bill = erVisit(state, content, drugId);
      say(state, 'er', { drug, amount: dollarText(state, bill, content) }, content);
      text = note('er', { drug }, content);
      kind = 'er';
    } else {
      scare(state, content, drugId);
      say(state, 'scare', { drug }, content);
      text = note('scare', { drug }, content);
      kind = 'scare';
    }
  }
  if (hooked) {
    state.drugs.totals.hooked += 1;
    say(state, 'hooked', { drug }, content);
  }
  syncAddiction(state, content);
  state.drugs.last = { action: 'use', kind, drugId, units, amount: 0, balance: state.finances.savings, note: `${text} (${unitsText(units, def)})` };
}
