/**
 * The world a business trades in (B2): the yearly economy, the supplier price
 * indices and the trend groups. Each is a pure function of the life's seed and
 * the year (a chain of values from the start of a window of years, drawn from
 * `createRng` with a derived string, the way the market is made), so it is the
 * same whenever it is asked, a history of past years can be shown, and a life
 * with no business draws nothing from its own random numbers. One world per
 * life: every business and every country in it sees the same economy.
 * Numbers: balance/business.yaml (economy, suppliers, trends).
 */
import type { ContentBundle, EconomyPhase } from '../../content/schemas';
import { ECONOMY_PHASES } from '../../content/schemas';
import { rollNormal, weightedPick } from '../random';
import { createRng } from '../rng';

/** Series are computed once per (seed, series, window) and kept: they cost a few random numbers and never change. */
const cache = new Map<string, readonly (number | EconomyPhase)[]>();

function remember<T extends number | EconomyPhase>(key: string, make: () => T[]): readonly T[] {
  const hit = cache.get(key);
  if (hit) return hit as readonly T[];
  if (cache.size > 4000) cache.clear();
  const made = make();
  cache.set(key, made);
  return made;
}

/** The economy's phase in a year: a Markov chain restarted from the start weights every `window` years. */
export function economyPhase(seed: string, year: number, content: ContentBundle): EconomyPhase {
  const e = content.balance.business.economy;
  const epoch = Math.floor(year / e.window);
  const series = remember<EconomyPhase>(`${seed}|economy|${epoch}|${e.window}`, () => {
    const rng = createRng(`${seed}:world:economy:${epoch}`);
    const out: EconomyPhase[] = [];
    let phase = weightedPick(rng, ECONOMY_PHASES.map((p) => [p, e.start[p]] as const));
    out.push(phase);
    for (let i = 1; i < e.window; i++) {
      const row = e.transitions[phase];
      phase = weightedPick(rng, ECONOMY_PHASES.map((p) => [p, row[p]] as const));
      out.push(phase);
    }
    return out;
  });
  return series[year - epoch * e.window] as EconomyPhase;
}

export interface EconomyView {
  phase: EconomyPhase;
  demand: number;
  drift: number;
  bank: number;
}

export function economyAt(seed: string, year: number, content: ContentBundle): EconomyView {
  const phase = economyPhase(seed, year, content);
  const p = content.balance.business.economy.phases[phase];
  return { phase, demand: p.demand, drift: p.drift, bank: p.bank };
}

/** A mean-reverting index around 1 that restarts from 1 every `window` years. */
function indexSeries(key: string, window: number, year: number, volatility: number, reversion: number, min: number, max: number, drift: (y: number) => number): number {
  const epoch = Math.floor(year / window);
  const series = remember<number>(`${key}|${epoch}|${window}|${volatility}|${reversion}`, () => {
    const rng = createRng(`${key}:world:${epoch}`);
    const out: number[] = [];
    let idx = 1;
    for (let i = 0; i < window; i++) {
      idx = Math.min(max, Math.max(min, idx + reversion * (1 - idx) + rollNormal(rng, { mean: 0, sd: volatility }) + drift(epoch * window + i)));
      out.push(idx);
    }
    return out;
  });
  return series[year - epoch * window] as number;
}

/** The price index of a supplier category in a year (1 is the usual price): unit costs follow it. */
export function supplierIndex(seed: string, category: string, year: number, content: ContentBundle): number {
  const s = content.balance.business.suppliers;
  const vol = content.registries.business.suppliers[category]?.volatility ?? 1;
  return indexSeries(`${seed}|supplier:${category}`, s.window, year, s.volatility * vol, s.reversion, s.min, s.max, (y) => economyAt(seed, y, content).drift);
}

/** The demand index of a trend group in a year (1 is neutral). */
export function trendIndex(seed: string, group: string, year: number, content: ContentBundle): number {
  const t = content.balance.business.trends;
  return indexSeries(`${seed}|trend:${group}`, t.window, year, t.volatility, t.reversion, t.min, t.max, () => 0);
}

/** How far a supplier category's price moved from last year to this (a share: 0.1 is ten percent up). */
export function supplierMove(seed: string, category: string, year: number, content: ContentBundle): number {
  return supplierIndex(seed, category, year, content) / supplierIndex(seed, category, year - 1, content) - 1;
}

/** Everything a year of trading reads from the world, for one life. */
export interface World {
  seed: string;
  year: number;
  content: ContentBundle;
  economy: EconomyView;
}

export function worldFor(seed: string, year: number, content: ContentBundle): World {
  return { seed, year, content, economy: economyAt(seed, year, content) };
}
