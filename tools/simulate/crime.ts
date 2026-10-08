/**
 * Crime careers, simulated and measured (E6a). The criminal player says yes to
 * every place in a crew it is offered, plays the crew's life through the
 * events (picking choices by personality, like the careful player) and, between
 * years, puts dirty money through the best business open to it and now and then
 * spends some. The law-abiding careful player never takes a place (it must
 * show none entered). The watcher compares each year's state before and after
 * `beginYear`, so nothing here touches the engine.
 *
 * Reported: how many lives enter a crew, how far they rise, what they earn
 * (dirty money by rank, what reaches savings, the cuts, what is lost and spent),
 * heat, investigations, arrests and prison, how they get out, laundering, the
 * events a crew life meets, and crime against a legal life: the crew lives'
 * wealth at death beside the lives of the same player that never entered one,
 * and whether high pay carries matching risk.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { frontsFor } from '../../src/engine/crime/money';
import { netWorth } from '../../src/engine/finance';
import { chance, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type CrimeAction = [LifeActionId, LifeActionParams];

/** Chances describing the simulated player (like the other bots'), not the game. */
const POLICY = {
  /** Yearly: launder when holding at least this much, keeping this share back; spend now and then. */
  launderAbove: 2_000,
  keep: 0.1,
  spend: 0.25,
  spendShare: 0.15,
  /** Heat above which the player holds off spending. */
  spendHeatBelow: 45,
};

export function chooseCrimeActions(life: LifeState, content: ContentBundle, rng: RngState): CrimeAction[] {
  const dirty = life.finances.dirty;
  const out: CrimeAction[] = [];
  if (dirty <= 0) return out;
  const fronts = frontsFor(life, content).filter((f) => f.left > 0);
  if (dirty >= POLICY.launderAbove && fronts.length > 0) {
    // The cheapest cut that will take it all, else the one with the most room; the amount stays within what the business will take this year.
    const amount = Math.floor(dirty * (1 - POLICY.keep));
    const fits = fronts.filter((f) => f.left >= amount).sort((a, b) => a.fee - b.fee);
    const front = fits[0] ?? [...fronts].sort((a, b) => b.left - a.left)[0]!;
    const deposit = Math.min(amount, front.left);
    const params = { frontId: front.id, amount: deposit };
    if (deposit >= content.balance.crime.dirty.laundering.minimum && isLifeActionAvailable(life, 'launder_money', params, content)) out.push(['launder_money', params]);
  }
  if (life.crime.heat < POLICY.spendHeatBelow && chance(rng, POLICY.spend)) {
    const amount = Math.floor(dirty * POLICY.spendShare);
    if (amount >= content.balance.crime.dirty.spend.minimum && isLifeActionAvailable(life, 'spend_dirty', { amount }, content)) out.push(['spend_dirty', { amount }]);
  }
  return out;
}

export interface CrimeReport {
  player: string;
  lives: number;
  /** Lives that reached 30 (the base for who "entered"). */
  reached30: number;
  entered: number;
  enteredAges: number[];
  byCrew: Record<string, number>;
  /** Lives by the highest rank reached (index 0 is rank 1). */
  peak: number[];
  leaders: number;
  crewYears: number;
  heatSum: number;
  heatMax: number;
  /** Dirty money earned in the years a crew life was at each rank, and the years. */
  rankEarned: number[];
  rankYears: number[];
  totals: { jobs: number; earned: number; cleaned: number; fees: number; lost: number; spent: number; arrests: number };
  investigations: number;
  investigatedLives: number;
  informants: number;
  arrestedLives: number;
  prisonLives: number;
  prisonYears: number;
  gotOut: number;
  how: Record<string, number>;
  rejoined: number;
  deposits: number;
  flagged: number;
  byTier: number[];
  /** Crime events fired, by id. */
  events: Record<string, number>;
  /** Wealth at death (net worth plus any dirty money held) of crew lives and of the same player's lives that never entered one. */
  crewWealth: number[];
  otherWealth: number[];
  /** Dirty money earned and whether arrested, for each crew life. */
  crewLives: { earned: number; arrested: boolean }[];
  /** Under 18 in a crew or holding dirty money: must be none. */
  underAge: number;
  invariantFailures: number;
}

export function emptyCrimeReport(player: string, content: ContentBundle): CrimeReport {
  const ranks = content.balance.crime.ranks.length;
  return {
    player,
    lives: 0,
    reached30: 0,
    entered: 0,
    enteredAges: [],
    byCrew: {},
    peak: Array.from({ length: ranks }, () => 0),
    leaders: 0,
    crewYears: 0,
    heatSum: 0,
    heatMax: 0,
    rankEarned: Array.from({ length: ranks }, () => 0),
    rankYears: Array.from({ length: ranks }, () => 0),
    totals: { jobs: 0, earned: 0, cleaned: 0, fees: 0, lost: 0, spent: 0, arrests: 0 },
    investigations: 0,
    investigatedLives: 0,
    informants: 0,
    arrestedLives: 0,
    prisonLives: 0,
    prisonYears: 0,
    gotOut: 0,
    how: {},
    rejoined: 0,
    deposits: 0,
    flagged: 0,
    byTier: [0, 0, 0],
    events: {},
    crewWealth: [],
    otherWealth: [],
    crewLives: [],
    underAge: 0,
    invariantFailures: 0,
  };
}

/** Watches one life. */
export class CrimeWatcher {
  private everIn = false;
  private everInvestigated = false;
  private everPrison = false;
  private lastEarned = 0;
  private informantSeen: string | undefined;

  constructor(
    private readonly r: CrimeReport,
    private readonly content: ContentBundle,
  ) {}

  /** The year that has just begun (`before` is the state before `beginYear`, `after` the state after). */
  observe(before: LifeState, after: LifeState): void {
    const { r } = this;
    const adultAge = this.content.balance.relationships.adultAge;
    const k = after.crime;
    if (after.character.age < adultAge && (k.crew !== null || after.finances.dirty > 0 || k.past.length > 0)) r.underAge++;
    if (k.crew && !this.everIn) {
      this.everIn = true;
      r.entered++;
      r.enteredAges.push(after.character.age);
      r.byCrew[k.crew.defId] = (r.byCrew[k.crew.defId] ?? 0) + 1;
    }
    // Earned dirty money in the year just lived, by the rank held through it.
    const earned = k.totals.earned - this.lastEarned;
    this.lastEarned = k.totals.earned;
    const rank = before.crime.rank;
    if (rank > 0) {
      r.rankEarned[rank - 1]! += earned;
      r.rankYears[rank - 1]!++;
      r.crewYears++;
      r.heatSum += before.crime.heat;
      r.heatMax = Math.max(r.heatMax, before.crime.heat);
    }
    if (k.investigation && !before.crime.investigation) {
      r.investigations++;
      this.everInvestigated = true;
    }
    if (k.crew?.informant !== undefined && k.crew.informant !== this.informantSeen) {
      r.informants++;
      this.informantSeen = k.crew.informant;
    }
    if ((this.everIn || k.past.length > 0) && after.housing.kind === 'incarcerated') {
      r.prisonYears++;
      this.everPrison = true;
    }
    for (const p of after.pending) {
      const def = this.content.events[p.eventId];
      if (def && def.category.startsWith('crime')) r.events[p.eventId] = (r.events[p.eventId] ?? 0) + 1;
    }
  }

  /** A launder action taken: what it did. */
  laundered(before: LifeState, after: LifeState, frontId: string): void {
    const { r } = this;
    r.deposits++;
    const tier = this.content.fronts[frontId]!.tier;
    r.byTier[tier - 1]!++;
    if (after.finances.savings === before.finances.savings) r.flagged++;
  }

  finish(life: LifeState): void {
    const { r } = this;
    const k = life.crime;
    r.lives++;
    if (life.character.age >= 30) r.reached30++;
    const wealth = netWorth(life) + life.finances.dirty;
    if (this.everIn || k.past.length > 0) {
      r.crewWealth.push(wealth);
      r.crewLives.push({ earned: k.totals.earned, arrested: k.totals.arrests > 0 });
      r.peak[Math.max(0, Math.min(r.peak.length, Math.max(k.peak, ...k.past.map((p) => p.topRank), 1)) - 1)]!++;
      if (Math.max(k.peak, ...k.past.map((p) => p.topRank), 0) >= this.content.balance.crime.ranks.length) r.leaders++;
      if (k.totals.arrests > 0) r.arrestedLives++;
      if (this.everInvestigated) r.investigatedLives++;
      if (this.everPrison) r.prisonLives++;
      if (k.past.length > 0) r.gotOut++;
      for (const p of k.past) r.how[p.how] = (r.how[p.how] ?? 0) + 1;
      if (k.past.length > 1 || (k.past.length >= 1 && k.crew !== null)) r.rejoined++;
      r.totals.jobs += k.totals.jobs;
      r.totals.earned += k.totals.earned;
      r.totals.cleaned += k.totals.cleaned;
      r.totals.fees += k.totals.fees;
      r.totals.lost += k.totals.lost;
      r.totals.spent += k.totals.spent;
      r.totals.arrests += k.totals.arrests;
    } else if (life.character.age >= 30) {
      r.otherWealth.push(wealth);
    }
  }
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const per = (n: number, d: number, digits = 1) => (d === 0 ? '0' : (n / d).toFixed(digits));

export function formatCrime(r: CrimeReport, content: ContentBundle): string[] {
  const lines: string[] = ['', `Crime careers (E6a) — ${r.player} player:`];
  const ranks = content.balance.crime.ranks.length;
  lines.push(`  lives ${r.lives}; reached 30: ${r.reached30}; entered a crew: ${r.entered} (${pct(r.entered, r.reached30)} of those reaching 30)`);
  if (r.entered === 0) return lines;
  lines.push(`  median age on entering ${median(r.enteredAges)}; crews: ${Object.entries(r.byCrew).map(([id, n]) => `${content.crews[id]!.name} ${n}`).join(', ')}`);
  lines.push(`  highest rank reached: ${r.peak.map((n, i) => `rank ${i + 1}: ${pct(n, r.entered)}`).join(', ')}; ran a crew: ${pct(r.leaders, r.entered)}`);
  lines.push(`  years in a crew ${r.crewYears} (${per(r.crewYears, r.entered)} a life); mean heat ${per(r.heatSum, r.crewYears)}, highest ${r.heatMax}`);
  lines.push('  dirty money earned a year, by rank: ' + r.rankEarned.map((e, i) => `rank ${i + 1} ${dollars(e / Math.max(1, r.rankYears[i]!))} (${r.rankYears[i]} yrs)`).join(', '));
  const t = r.totals;
  lines.push(`  per crew life: ${per(t.jobs, r.entered)} jobs; earned ${dollars(t.earned / r.entered)}; cleaned into savings ${dollars(t.cleaned / r.entered)} (cuts ${dollars(t.fees / r.entered)}); lost ${dollars(t.lost / r.entered)}; spent ${dollars(t.spent / r.entered)}`);
  lines.push(`  laundering: ${r.deposits} deposits (tier 1 ${r.byTier[0]}, tier 2 ${r.byTier[1]}, tier 3 ${r.byTier[2]}); flagged ${pct(r.flagged, r.deposits)}`);
  lines.push(`  the law: investigated ${pct(r.investigatedLives, r.entered)} (${r.investigations} investigations, ${r.informants} informants); arrested ${pct(r.arrestedLives, r.entered)} (${t.arrests} arrests); prison ${pct(r.prisonLives, r.entered)} (${r.prisonYears} years inside)`);
  lines.push(`  getting out: ${pct(r.gotOut, r.entered)} got out (${Object.entries(r.how).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); ${r.rejoined} went back`);
  lines.push(`  wealth at death (net worth plus dirty money): median of crew lives ${dollars(median(r.crewWealth))}, of the same player's lives with no crew ${dollars(median(r.otherWealth))}`);
  const top = [...r.crewLives].sort((a, b) => b.earned - a.earned).slice(0, Math.max(1, Math.ceil(r.crewLives.length / 4)));
  lines.push(`  the top quarter by dirty money earned (${top.length} lives, from ${dollars(top.at(-1)?.earned ?? 0)}): ${pct(top.filter((l) => l.arrested).length, top.length)} arrested`);
  lines.push(`  crime events: ${Object.values(r.events).reduce((a, b) => a + b, 0)} in ${Object.keys(r.events).length} kinds; under 18 in a crew or holding dirty money: ${r.underAge}; ranks ${ranks}`);
  return lines;
}

/** The E6a targets (balance/targets.yaml, crime): the careful player must never enter a crew; the criminal player is judged on the rest. */
export function crimeTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.crime;
  const r = report.crime;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('lives under 18 in a crew or holding dirty money', r.underAge, t.underAge, (n) => n.toFixed(0));
  if (report.player === 'careful') {
    range('law-abiding lives that entered a crew', r.entered, t.carefulEntered, (n) => n.toFixed(0));
    return out;
  }
  if (report.player !== 'criminal') return out;
  range('lives that reach 30 and entered a crew', share(r.entered, r.reached30), t.entered);
  range('crew lives that reached the third rank', share(r.peak.slice(2).reduce((a, b) => a + b, 0), r.entered), t.reachedRank3);
  range('crew lives that ran a crew', share(r.leaders, r.entered), t.leaders);
  range('crew lives arrested at least once', share(r.arrestedLives, r.entered), t.arrested);
  range('crew lives that went to prison', share(r.prisonLives, r.entered), t.prison);
  range('crew lives that got out', share(r.gotOut, r.entered), t.gotOut);
  range('mean heat on a crew member', share(r.heatSum, r.crewYears), t.meanHeat, (n) => n.toFixed(1));
  range('median wealth at death: crew lives as a multiple of the same player’s lives with no crew', share(median(r.crewWealth), Math.max(1, median(r.otherWealth))), t.netWorthRatio, (n) => n.toFixed(2));
  const top = [...r.crewLives].sort((a, b) => b.earned - a.earned).slice(0, Math.max(1, Math.ceil(r.crewLives.length / 4)));
  range('arrested at least once, of crew lives in the top quarter by dirty money earned', share(top.filter((l) => l.arrested).length, top.length), t.richArrested);
  range('deposits flagged', share(r.flagged, r.deposits), t.flaggedShare);
  return out;
}
