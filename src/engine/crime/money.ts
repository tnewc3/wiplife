/**
 * Dirty money (E6a): cash from crime that isn't in your savings. Jobs pay it,
 * hush money and bribes come out of it, and an arrest, a raid or a theft can
 * take it. It can't be spent freely: spending it draws attention (heat), and
 * the only way into savings is laundering it through a cash business, for a
 * fee and a risk. It is never part of net worth or the yearly ledger. Numbers:
 * balance/crime.yaml (dirty, jobs).
 */
import type { ContentBundle, FrontDef, JobSize } from '../../content/schemas';
import { earn, isIndependent, wholeDollars } from '../finance';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import { chance, nextFloat, nextInt, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState } from '../types';
import { inCrew } from './query';

/** Your city's pay level (1 is the national average): payouts and costs follow it. */
export function payLevel(state: LifeState, content: ContentBundle): number {
  return content.cities[state.character.cityId]?.salaryMultiplier ?? 1;
}

/** Raises or lowers the heat on you (0–100). Returns the change made. */
export function addHeat(state: LifeState, delta: number): number {
  const before = state.crime.heat;
  state.crime.heat = clampInt(before + delta, 0, 100);
  return state.crime.heat - before;
}

/** What a job of this size pays you now: its base, your rank's multiplier, your city's pay level, and a little variation. Draws from `rng`. */
export function jobPayout(state: LifeState, size: JobSize, content: ContentBundle, rng: RngState): number {
  const b = content.balance.crime;
  const rank = b.ranks[Math.max(1, state.crime.rank) - 1]!;
  const swing = 1 + b.jobs.variation * (nextFloat(rng) * 2 - 1);
  return wholeDollars(b.jobs.sizes[size].payout * rank.payout * payLevel(state, content) * swing);
}

/** The yearly cut a higher rank takes from the crew's business (dirty money; 0 below the ranks that have one). Draws from `rng`. */
export function crewCut(state: LifeState, content: ContentBundle, rng: RngState): number {
  const b = content.balance.crime;
  const cut = b.ranks[Math.max(1, state.crime.rank) - 1]!.cut;
  if (!cut || !state.crime.crew) return 0;
  const swing = 1 + b.jobs.variation * (nextFloat(rng) * 2 - 1);
  addHeat(state, cut.heat);
  return wholeDollars(cut.amount * payLevel(state, content) * swing);
}

/** What paying out of your dirty money costs for a size (hush money, a bribe). */
export function dirtyCost(state: LifeState, size: JobSize, content: ContentBundle): number {
  return wholeDollars(content.balance.crime.jobs.costs[size] * payLevel(state, content));
}

export function addDirty(state: LifeState, amount: number): void {
  const n = wholeDollars(Math.max(0, amount));
  state.finances.dirty += n;
  state.crime.totals.earned += n;
}

/** Takes up to `amount` from your dirty money; returns what was taken. */
export function takeDirty(state: LifeState, amount: number): number {
  const n = Math.min(state.finances.dirty, wholeDollars(Math.max(0, amount)));
  state.finances.dirty -= n;
  return n;
}

/** Dirty money gone to a seizure, a raid, a theft or a flagged deposit. */
export function loseDirty(state: LifeState, amount: number): number {
  const n = takeDirty(state, amount);
  state.crime.totals.lost += n;
  return n;
}

/** Why you can't spend dirty money now, or null. */
export type SpendBlock = 'age' | 'away' | 'none' | 'amount';

export function spendBlock(state: LifeState, amount: number, content: ContentBundle): SpendBlock | null {
  if (!isIndependent(state, content)) return 'age';
  if (isIncarcerated(state)) return 'away';
  if (state.finances.dirty <= 0) return 'none';
  const min = content.balance.crime.dirty.spend.minimum;
  if (!Number.isInteger(amount) || amount < Math.min(min, state.finances.dirty) || amount > state.finances.dirty) return 'amount';
  return null;
}

/** Heat that spending this much at once adds (at your city's pay level). */
export function spendHeat(state: LifeState, amount: number, content: ContentBundle): number {
  const s = content.balance.crime.dirty.spend;
  return Math.min(s.max, Math.round(((amount / payLevel(state, content)) / 1000) * s.perThousand));
}

/** Spends dirty money on a good time: it makes you happier, and it gets noticed. Returns the heat added. */
export function spendDirty(state: LifeState, amount: number, content: ContentBundle): number {
  const s = content.balance.crime.dirty.spend;
  const taken = takeDirty(state, amount);
  state.crime.totals.spent += taken;
  const heat = addHeat(state, spendHeat(state, taken, content));
  const lift = Math.min(s.happinessMax, Math.round((taken / 1000) * s.happiness));
  state.character.stats.happiness = clampInt(state.character.stats.happiness + lift, 0, 100);
  return heat;
}

/** One business you can launder through now, with what it takes and how risky it is for this amount. */
export interface FrontOption {
  id: Id;
  name: string;
  blurb: string;
  tier: number;
  fee: number;
  /** The most it takes in a year, and what is left of that this year. */
  capacity: number;
  left: number;
}

function usedThisYear(state: LifeState, frontId: Id): number {
  const l = state.crime.laundered;
  return l.year === state.currentYear ? (l.byFront[frontId] ?? 0) : 0;
}

/** Businesses open to you: any tier your rank allows (a tier with rank 0 is open to anyone holding dirty money). */
export function frontsFor(state: LifeState, content: ContentBundle): FrontOption[] {
  const tiers = content.balance.crime.dirty.laundering.tiers;
  const rank = inCrew(state) ? state.crime.rank : 0;
  const best = state.crime.peak;
  return Object.values(content.fronts)
    .filter((f) => !f.retired)
    .sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1))
    .flatMap((f: FrontDef) => {
      const t = tiers[f.tier - 1]!;
      // A former member keeps the contacts they made (the best rank they held), at a step down.
      if (Math.max(rank, inCrew(state) ? 0 : Math.max(0, best - 1)) < t.rank) return [];
      const capacity = wholeDollars(t.capacity * payLevel(state, content));
      return [{ id: f.id, name: f.name, blurb: f.blurb, tier: f.tier, fee: t.fee, capacity, left: Math.max(0, capacity - usedThisYear(state, f.id)) }];
    });
}

/** The chance a deposit of this size at this business is flagged. */
export function launderRisk(state: LifeState, frontId: Id, amount: number, content: ContentBundle): number {
  const l = content.balance.crime.dirty.laundering;
  const front = content.fronts[frontId];
  if (!front) return 1;
  const t = l.tiers[front.tier - 1]!;
  const capacity = t.capacity * payLevel(state, content);
  const over = Math.max(0, usedThisYear(state, frontId) + amount - capacity);
  const overShare = amount > 0 ? Math.min(1, over / amount) : 0;
  const risk = t.risk * (1 + (state.crime.heat * l.heatRisk) / 100) * (1 + overShare * (l.over - 1));
  return Math.min(0.9, risk);
}

export type LaunderBlock = 'age' | 'away' | 'none' | 'amount' | 'front';

export function launderBlock(state: LifeState, frontId: Id, amount: number, content: ContentBundle): LaunderBlock | null {
  if (!isIndependent(state, content)) return 'age';
  if (isIncarcerated(state)) return 'away';
  if (state.finances.dirty <= 0) return 'none';
  if (!frontsFor(state, content).some((f) => f.id === frontId)) return 'front';
  const min = content.balance.crime.dirty.laundering.minimum;
  if (!Number.isInteger(amount) || amount < Math.min(min, state.finances.dirty) || amount > state.finances.dirty) return 'amount';
  return null;
}

export interface LaunderResult {
  flagged: boolean;
  /** Dirty money put through, the fee kept, what reached your savings, and what was lost. */
  amount: number;
  fee: number;
  net: number;
  lost: number;
}

/**
 * Puts dirty money through a business. It takes its fee and the rest becomes
 * savings; or the deposit is flagged: part of it is lost, heat rises, an
 * investigation may open, and an event follows next year. The caller has
 * checked `launderBlock`.
 */
export function launder(state: LifeState, frontId: Id, amount: number, content: ContentBundle): LaunderResult {
  const l = content.balance.crime.dirty.laundering;
  const front = content.fronts[frontId]!;
  const t = l.tiers[front.tier - 1]!;
  const risk = launderRisk(state, frontId, amount, content);
  const crime = state.crime;
  if (crime.laundered.year !== state.currentYear) crime.laundered = { year: state.currentYear, byFront: {} };
  crime.laundered.byFront[frontId] = (crime.laundered.byFront[frontId] ?? 0) + amount;
  if (chance(state.rng, risk)) {
    const lost = loseDirty(state, wholeDollars(amount * l.lost));
    addHeat(state, l.flaggedHeat);
    if (chance(state.rng, l.investigates)) openInvestigation(state, content);
    writeFromGroup(state, content.text.crime.history.flagged, ['crime', 'flagged'], { values: { front: front.name } }, content);
    return { flagged: true, amount, fee: 0, lost, net: 0 };
  }
  const fee = wholeDollars(amount * t.fee);
  const net = amount - fee;
  takeDirty(state, amount);
  earn(state, net);
  crime.totals.cleaned += net;
  crime.totals.fees += fee;
  return { flagged: false, amount, fee, net, lost: 0 };
}

/** The investigation into you ends (it goes cold, lapses, or an event closes it); a member who was informing stops. Returns whether one was open. */
export function closeInvestigation(state: LifeState, content: ContentBundle): boolean {
  if (!state.crime.investigation) return false;
  delete state.crime.investigation;
  if (state.crime.crew) delete state.crime.crew.informant;
  writeFromGroup(state, content.text.crime.history.investigationCold, ['crime', 'investigation'], { values: {} }, content);
  return true;
}

/** An investigation into you opens (or an open one is refreshed) for the years the police balance gives. */
export function openInvestigation(state: LifeState, content: ContentBundle): boolean {
  const years = content.balance.crime.police.openYears;
  const crime = state.crime;
  const until = state.currentYear + nextInt(state.rng, years.min, years.max) - 1;
  const fresh = crime.investigation === undefined;
  crime.investigation = { since: crime.investigation?.since ?? state.currentYear, until: Math.max(crime.investigation?.until ?? 0, until) };
  if (fresh) writeFromGroup(state, content.text.crime.history.investigationOpened, ['crime', 'investigation'], { values: {} }, content);
  return fresh;
}
