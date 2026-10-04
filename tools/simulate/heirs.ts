/**
 * Heir play and inheritance (E2b), simulated: the player model's will, the
 * chains of lives that continue as heirs for several generations, and what
 * the run measures about them: how often heirs are minors, what they
 * inherit, who takes minors in, that family wealth doesn't grow without
 * limit from one generation to the next, that family reputation reaches the
 * heir, and that an heir's memories of being raised come up in events. Like
 * the other player models, these chances describe the simulated player, not
 * the game, so they live here and not in the balance files.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { HEIR_MEMORY_MAP } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { continueAsHeir, heirCandidates } from '../../src/engine/estate/heir';
import { willCandidates } from '../../src/engine/estate/will';
import { netWorth } from '../../src/engine/finance';
import { chance, createRng, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { Id, LifeState, WillShare } from '../../src/engine/types';

/** What a simulated player does about a will, fixed for the life. */
export interface WillProfile {
  /** Writes a will at some point from the age below. */
  writesWill: boolean;
  /** The age it gets round to it. */
  age: number;
  /** Leaves a share to a cause. */
  generous: boolean;
  /** Splits evenly between those chosen, rather than leaving most to the first. */
  even: boolean;
}

export function rollWillProfile(rng: RngState): WillProfile {
  return { writesWill: chance(rng, 0.4), age: nextInt(rng, 35, 64), generous: chance(rng, 0.15), even: chance(rng, 0.5) };
}

/** The will the simulated player writes this year, if it is time: its spouse and children, sometimes a cause or someone else in the family. */
export function chooseWillActions(life: LifeState, content: ContentBundle, rng: RngState, profile: WillProfile): [LifeActionId, LifeActionParams][] {
  if (!profile.writesWill || life.will !== null || life.character.age < profile.age) return [];
  const family = willCandidates(life, content).filter((c) => c.kind === 'person' && ['spouse', 'child', 'stepchild', 'sibling', 'parent'].includes(c.relation));
  const room = content.balance.family.estate.maxShares - 1;
  const people = family.filter((c) => c.relation === 'spouse' || c.relation === 'child' || chance(rng, 0.2)).slice(0, room);
  const cause = profile.generous ? pick(rng, Object.keys(content.registries.estate.causes).sort()) : null;
  const named: { kind: 'person' | 'cause'; id: Id; weight: number }[] = [
    ...people.map((c, i) => ({ kind: 'person' as const, id: c.id, weight: profile.even || i > 0 ? 2 : 6 })),
    ...(cause ? [{ kind: 'cause' as const, id: cause, weight: 1 }] : []),
  ];
  if (named.length === 0) return [];
  const total = named.reduce((sum, n) => sum + n.weight, 0);
  const shares: WillShare[] = named.map((n) => ({ kind: n.kind, id: n.id, percent: Math.max(1, Math.floor((100 * n.weight) / total)) }));
  shares[0]!.percent += 100 - shares.reduce((sum, s) => sum + s.percent, 0);
  return shares[0]!.percent < 1 ? [] : [['write_will', { shares }]];
}

/** How often the simulated player continues as the youngest child (otherwise any child, at random). */
const YOUNGEST_CHILD_SHARE = 0.6;

export const HEIR_GUARDIANS = ['parent', 'stepparent', 'grandparent', 'relative', 'sibling', 'foster'] as const;
export type HeirGuardian = (typeof HEIR_GUARDIANS)[number];

/** What one heir started with and where they came from, kept small (the life itself isn't). */
export interface HeirRecord {
  /** The heir's generation (2 for the first heirs). */
  generation: number;
  parentNetWorth: number;
  netEstate: number;
  source: 'will' | 'default';
  minor: boolean;
  ageAtStart: number;
  /** What they inherited: cash (a grown heir's savings above the usual start), money in trust, and a home's equity. */
  cash: number;
  trust: number;
  homeEquity: number;
  /** Their share of the estate, in percent (0: left out). */
  sharePercent: number;
  guardian: HeirGuardian | null;
  familyReputation: number;
  startReputation: number;
  /** The memories of how they were raised that they begin with. */
  memories: string[];
}

/** One chain of lives: each generation's net worth at death. */
export interface ChainRecord {
  netWorth: number[];
}

/**
 * Turns each life that ended into the heir's starting life (when it has a
 * living child), picking among the children by the life's seed, and keeps a
 * small record. The dead lives aren't kept: ten thousand of them would be too
 * much to hold at once.
 */
export class HeirCollector {
  /** The heirs' starting lives, in the order the lives ended. */
  readonly starts: LifeState[] = [];
  readonly records: HeirRecord[] = [];
  /** Which chain each start belongs to, in the same order as `starts`. */
  readonly chains: number[] = [];
  /** Lives that ended with at least one living child, and without; wills left. */
  withHeirs = 0;
  withoutHeirs = 0;
  /** Lives that ended with a child under 18 living. */
  withMinorChild = 0;
  wills = 0;
  lives = 0;
  private nextChain = 0;

  /**
   * `generation` is the generation of the lives being recorded. `chainsIn`:
   * for later generations, the chain of each life played (the previous
   * collector's `chains`). `replayEvery`: the snapshot an heir's input log
   * starts with is kept only for every nth life (the lives the run replays).
   */
  constructor(
    private readonly content: ContentBundle,
    private readonly generation: number,
    private readonly chainRecords: ChainRecord[],
    private readonly chainsIn: readonly number[] | null,
    private readonly replayEvery: number,
  ) {}

  /** Called with each life that ended, in order. */
  record(dead: LifeState): void {
    const index = this.lives++;
    const chain = this.chainsIn ? this.chainsIn[index]! : this.nextChain++;
    (this.chainRecords[chain] ??= { netWorth: [] }).netWorth[this.generation - 1] = netWorth(dead);
    if (dead.will !== null) this.wills++;
    const candidates = heirCandidates(dead);
    if (candidates.length === 0) {
      this.withoutHeirs++;
      return;
    }
    this.withHeirs++;
    const independence = this.content.balance.economy.independenceAge;
    if (candidates.some((id) => dead.currentYear - dead.people[id]!.birthYear < independence)) this.withMinorChild++;
    // A player usually picks the youngest child (the longest life ahead), and sometimes any of them.
    const rng = createRng(`${dead.seed}:heir`);
    const youngest = [...candidates].sort((a, b) => dead.people[b]!.birthYear - dead.people[a]!.birthYear)[0]!;
    const heirId = chance(rng, YOUNGEST_CHILD_SHARE) ? youngest : pick(rng, candidates);
    const heir = continueAsHeir(dead, heirId, this.content);
    const estate = dead.estate!;
    const line = estate.lines.find((l) => l.kind === 'person' && l.id === heirId);
    const minor = heir.character.age < this.content.balance.economy.independenceAge;
    const adultStart = this.content.balance.family.heir.adultSavings[heir.character.familyWealth];
    const parent = Object.values(heir.relationships).find((r) => r.kind === 'parent' && heir.people[r.personId]?.deathYear === heir.currentYear && !heir.people[r.personId]!.alive);
    const guardianKind = heir.housing.guardianId === undefined ? null : heir.relationships[heir.housing.guardianId]?.kind;
    this.records.push({
      generation: this.generation + 1,
      parentNetWorth: netWorth(dead),
      netEstate: estate.netEstate,
      source: estate.source,
      minor,
      ageAtStart: heir.character.age,
      cash: minor ? 0 : Math.max(0, heir.finances.savings - adultStart),
      trust: heir.finances.trust?.balance ?? 0,
      homeEquity: heir.housing.homeValue !== undefined ? heir.housing.homeValue - (heir.finances.debts.find((d) => d.id === heir.housing.mortgageDebtId)?.balance ?? 0) : 0,
      sharePercent: line?.percent ?? 0,
      guardian: heir.housing.foster ? 'foster' : (guardianKind as HeirGuardian | null | undefined) ?? null,
      familyReputation: heir.lineage.reputation,
      startReputation: heir.character.hidden.reputation,
      memories: parent?.memories.map((m) => m.tag) ?? [],
    });
    // The snapshot an heir's input log starts with (for replay) is kept only for the lives the run replays.
    if (this.starts.length % this.replayEvery !== 0) heir.inputLog[0] = { ...heir.inputLog[0]!, payload: { ...heir.inputLog[0]!.payload, snapshot: {} } };
    this.starts.push(heir);
    this.chains.push(chain);
  }
}

/** One generation of the run, as it was played. */
export interface GenerationSummary {
  generation: number;
  lives: number;
  withHeirs: number;
  withoutHeirs: number;
  /** Lives that ended with a child under 18 living. */
  withMinorChild: number;
  wills: number;
  invariantFailures: number;
  /** Events fired in the heirs' lives (by event id), for the estate, guardianship and legacy categories. */
  heirEvents: Record<string, number>;
}

export interface HeirReport {
  generations: GenerationSummary[];
  heirs: number;
  minors: { count: number; share: number; medianAge: number };
  /** What each heir inherited in all (cash, trust and home equity), and as a share of what the parent left. */
  inheritance: { n: number; leftOut: number; nothing: number; median: number; mean: number; p90: number; largest: number; medianOfParent: number };
  /** Who took minors in. */
  guardians: Record<HeirGuardian, number>;
  /** Estates by how they were settled: by a will or by the default shares. */
  estates: { will: number; default: number };
  /** Net worth at death, by generation, over the chains that reach a third generation (the same families all the way along). */
  wealth: { chains: number; medians: number[]; ratio: number; p90Ratio: number };
  /** Family reputation reaches the heir. */
  reputation: { n: number; correlation: number; lowMean: number; highMean: number; lowBelow: number; highFrom: number };
  /** Heirs raised with a notable memory, and those who saw an event about it. */
  memories: { heirs: number; withMemory: number; withEvent: number; eventsFired: number };
}

/** Family reputations below and from these are compared (the line's reputation is 50 when nothing has happened to it). */
const REPUTATION_LOW = 45;
const REPUTATION_HIGH = 55;

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const quantile = (values: number[], p: number) => {
  const s = sorted(values);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};
const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Builds the report from the generations' collectors and summaries. */
export function buildHeirReport(
  generations: GenerationSummary[],
  records: HeirRecord[],
  chains: ChainRecord[],
  memory: { heirsWithEvent: number; eventsFired: number },
): HeirReport {
  const minors = records.filter((r) => r.minor);
  const totals = records.map((r) => r.cash + r.trust + r.homeEquity);
  const guardians = Object.fromEntries(HEIR_GUARDIANS.map((g) => [g, 0])) as Record<HeirGuardian, number>;
  for (const r of records) if (r.guardian) guardians[r.guardian]++;
  const withParentWealth = records.filter((r) => r.parentNetWorth > 0 && r.netEstate > 0);
  const generationsReached = Math.max(0, ...chains.map((c) => c.netWorth.length));
  const complete = chains.filter((c) => c.netWorth.length >= Math.min(3, generationsReached) && generationsReached >= 3);
  const medians = [0, 1, 2].map((g) => quantile(complete.map((c) => c.netWorth[g]!), 0.5));
  // The tail is compared as distributions (a family that began with almost nothing would make a per-family ratio meaningless).
  const p90 = [0, 2].map((g) => quantile(complete.map((c) => c.netWorth[g]!), 0.9));
  const low = records.filter((r) => r.familyReputation < REPUTATION_LOW);
  const high = records.filter((r) => r.familyReputation >= REPUTATION_HIGH);
  const withMemory = records.filter((r) => r.memories.some((m) => (Object.values(HEIR_MEMORY_MAP) as string[]).includes(m)));
  return {
    generations,
    heirs: records.length,
    minors: { count: minors.length, share: records.length > 0 ? minors.length / records.length : 0, medianAge: quantile(records.map((r) => r.ageAtStart), 0.5) },
    inheritance: {
      n: records.length,
      leftOut: records.filter((r) => r.source === 'will' && r.sharePercent === 0).length,
      nothing: totals.filter((t) => t === 0).length,
      median: quantile(totals, 0.5),
      mean: Math.round(mean(totals)),
      p90: quantile(totals, 0.9),
      largest: Math.max(0, ...totals),
      medianOfParent: quantile(withParentWealth.map((r) => (r.cash + r.trust + r.homeEquity) / r.netEstate), 0.5),
    },
    guardians,
    estates: { will: records.filter((r) => r.source === 'will').length, default: records.filter((r) => r.source === 'default').length },
    wealth: { chains: complete.length, medians, ratio: medians[0]! > 0 ? medians[2]! / medians[0]! : 0, p90Ratio: p90[0]! > 0 ? p90[1]! / p90[0]! : 0 },
    reputation: {
      n: records.length,
      correlation: correlation(records.map((r) => r.familyReputation), records.map((r) => r.startReputation)),
      lowMean: mean(low.map((r) => r.startReputation)),
      highMean: mean(high.map((r) => r.startReputation)),
      lowBelow: REPUTATION_LOW,
      highFrom: REPUTATION_HIGH,
    },
    memories: { heirs: records.length, withMemory: withMemory.length, withEvent: memory.heirsWithEvent, eventsFired: memory.eventsFired },
  };
}

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number, of: number) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : 'n/a');

export function formatHeirs(r: HeirReport): string[] {
  const lines: string[] = [];
  const total = r.generations[0]?.lives ?? 0;
  lines.push(`Heirs and inheritance (E2b): ${r.generations.length} generation${r.generations.length === 1 ? '' : 's'} played from ${total} first lives`);
  for (const g of r.generations) {
    lines.push(
      `  generation ${g.generation}: ${g.lives} lives; ${g.withHeirs} ended with a living child (${pct(g.withHeirs, g.lives)}), ${g.withoutHeirs} without (${g.withMinorChild} left a child under 18); ${g.wills} left a will (${pct(g.wills, g.lives)}); ${g.invariantFailures} invariant failures`,
    );
  }
  lines.push(`  heirs: ${r.heirs}; under 18: ${r.minors.count} (${pct(r.minors.count, r.heirs)}); median age at the start ${r.minors.medianAge}`);
  const g = r.guardians;
  lines.push(`  minors taken in by: a surviving parent ${g.parent}, a stepparent ${g.stepparent}, a grandparent ${g.grandparent}, a relative ${g.relative}, an older sibling ${g.sibling}; foster care ${g.foster}`);
  lines.push(`  estates: ${r.estates.will} by a will, ${r.estates.default} by the default shares; ${r.inheritance.leftOut} heirs left out of a will`);
  const i = r.inheritance;
  lines.push(`  inherited (cash, trust and home equity): median ${dollars(i.median)}, mean ${dollars(i.mean)}, 90th percentile ${dollars(i.p90)}, largest ${dollars(i.largest)}; nothing for ${i.nothing} of ${i.n} heirs; the median heir got ${(100 * i.medianOfParent).toFixed(0)}% of the estate`);
  const w = r.wealth;
  lines.push(`  family wealth (net worth at death, ${w.chains} families that lived three generations): ${w.medians.map((m, k) => `generation ${k + 1} ${dollars(m)}`).join(', ')}; generation 3 is ${w.ratio.toFixed(2)}× generation 1 (90th percentile wealth ${w.p90Ratio.toFixed(2)}×)`);
  const p = r.reputation;
  lines.push(`  family reputation → the heir's own at the start: correlation ${p.correlation.toFixed(2)} over ${p.n} heirs; below ${p.lowBelow}: ${p.lowMean.toFixed(1)}, from ${p.highFrom}: ${p.highMean.toFixed(1)}`);
  const m = r.memories;
  lines.push(`  memories of being raised: ${m.withMemory} of ${m.heirs} heirs began with one; ${m.withEvent} of them saw a memory event (${m.eventsFired} fired)`);
  const events = Object.entries(r.generations.reduce<Record<string, number>>((acc, gen) => {
    for (const [id, n] of Object.entries(gen.heirEvents)) acc[id] = (acc[id] ?? 0) + n;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  lines.push(`  events for heirs fired: ${events.map(([id, n]) => `${id} ${n}`).join(', ') || 'none'}`);
  return lines;
}

export interface HeirTarget {
  label: string;
  value: string;
  goal: string;
  met: boolean;
}

/** E2b: judged on the careful player. */
export function heirTargets(r: HeirReport, content: ContentBundle): HeirTarget[] {
  const t = content.balance.targets.heirs;
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const inRange = (v: number, x: { min: number; max: number }) => v >= x.min && v <= x.max;
  const failures = r.generations.reduce((sum, g) => sum + g.invariantFailures, 0);
  const memoryShare = r.memories.withMemory > 0 ? r.memories.withEvent / r.memories.withMemory : 0;
  return [
    { label: 'invariant failures across every generation', value: String(failures), goal: '0', met: failures === 0 },
    { label: 'generations played', value: String(r.generations.length), goal: `at least ${t.generations}`, met: r.generations.length >= t.generations },
    { label: 'heirs who are under 18', value: pct1(r.minors.share), goal: `${pct1(t.minors.min)}–${pct1(t.minors.max)}`, met: inRange(r.minors.share, t.minors) },
    {
      label: 'family wealth: generation 3 net worth at death ÷ generation 1 (medians, same families)',
      value: r.wealth.ratio.toFixed(2),
      goal: `${t.familyWealth.min}–${t.familyWealth.max}`,
      met: r.wealth.chains > 0 && inRange(r.wealth.ratio, t.familyWealth),
    },
    { label: 'family wealth: 90th percentile net worth, generation 3 ÷ generation 1', value: r.wealth.p90Ratio.toFixed(2), goal: `at most ${t.maxP90Growth}`, met: r.wealth.p90Ratio <= t.maxP90Growth },
    { label: 'family reputation reaches the heir (correlation with their own reputation)', value: r.reputation.correlation.toFixed(2), goal: `at least ${t.reputationCorrelation}`, met: r.reputation.correlation >= t.reputationCorrelation },
    { label: 'heirs raised with a memory who see an event about it', value: pct1(memoryShare), goal: `at least ${pct1(t.memoryEvents)}`, met: memoryShare >= t.memoryEvents },
    { label: 'minor heirs taken in by someone (a guardian or foster care)', value: `${Object.values(r.guardians).reduce((a, b) => a + b, 0)} of ${r.minors.count}`, goal: 'all', met: Object.values(r.guardians).reduce((a, b) => a + b, 0) === r.minors.count },
  ];
}
