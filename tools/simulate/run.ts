/**
 * Simulation runner: plays many random lives with random choices (and a
 * simple player model for relationship actions, and from Stage 6 for money
 * and home actions) and reports invariant failures, lifespans, events per
 * year, how often each event fired, marriage and divorce rates, and savings,
 * debt and net worth over lifetimes. Later stages add their own reports.
 */
import { ACTION_IDS, type ActionId, type ContentBundle, type Effect } from '../../src/content/schemas';
import {
  isActionAvailable,
  isLifeActionAvailable,
  LIFE_ACTION_IDS,
  performAction,
  type LifeActionId,
} from '../../src/engine/actions';
import { playAction, resolveAll } from '../../src/engine/autoplay';
import { netWorth, totalDebt } from '../../src/engine/finance';
import { checkInvariants } from '../../src/engine/invariants';
import { beginYear, createLife, endYear } from '../../src/engine/life';
import { isFamilyKind, isPartnerKind } from '../../src/engine/relationships';
import { createRng } from '../../src/engine/rng';
import type { LifeStage, LifeState } from '../../src/engine/types';
import { chooseActions, chooseMoneyActions, rollMoneyProfile } from './bot';

export interface SimulationOptions {
  lives: number;
  /** Seeds are `${seedPrefix}-${i}`. */
  seedPrefix: string;
  /** Stops collecting invariant failure messages past this many (they are still counted). */
  maxFailureMessages?: number;
}

export interface StageYears {
  years: number;
  events: number;
  /** Years with fewer events than the stage's minimum (not enough events fitted). */
  belowMin: number;
  /** Most events in any one year of this stage. */
  most: number;
}

export interface SimulationReport {
  lives: number;
  invariantFailures: number;
  failureMessages: string[];
  lifespan: { median: number; p10: number; p90: number; youngest: number; oldest: number; under18: number };
  eventsPerYear: Record<LifeStage, StageYears>;
  /** Years with more events than the cap (must be zero). */
  yearsOverCap: number;
  /** Per event: times fired, share of all events fired, and lives it fired in. */
  events: { id: string; fired: number; share: number; lives: number }[];
  totalEventsFired: number;
  deathsFromEvents: number;
  relationships: RelationshipReport;
  money: MoneyReport;
}

/** Median and spread of an amount across lives. */
export interface Spread {
  lives: number;
  p10: number;
  median: number;
  p90: number;
  /** Share of those lives with any debt. */
  inDebt: number;
}

export interface MoneyReport {
  /** Savings, debt and net worth at these ages (lives that reached them), and at death. */
  byAge: { age: number | 'death'; savings: Spread; debt: Spread; netWorth: Spread }[];
  /** Largest values seen in any life at any point (must stay far below the safe integer limit). */
  largest: { savings: number; debt: number; netWorth: number; netWorthSeed: string };
  /** Lives (that reached the independence age) in which each happened. */
  adults: number;
  outcomes: Record<'gig' | 'movedOut' | 'relocated' | 'owned' | 'evicted' | 'homeless' | 'foreclosed' | 'bankrupt' | 'collections' | 'debtPlan', number>;
  actionsTaken: Record<LifeActionId, number>;
  /** Years renting on gig income only, by city: how many, and how many of them couldn't cover their costs. */
  gigRenting: Record<string, { years: number; shortYears: number }>;
  /**
   * Repeatable money: for each event that can give money, the most times it
   * fired in one life times its largest gain. A runaway would show up here.
   */
  repeatableGains: { eventId: string; mostInOneLife: number; largestGain: number; mostMoney: number }[];
}

/** What one life did with money, watched step by step. */
class MoneyWatcher {
  readonly at = new Map<number, { savings: number; debt: number; netWorth: number }>();
  gig = false;
  movedOut = false;
  relocated = false;
  owned = false;
  homeless = false;
  collections = false;
  maxSavings = 0;
  maxDebt = 0;
  maxNetWorth = 0;

  observe(life: LifeState, ages: readonly number[]): void {
    const debt = totalDebt(life);
    const worth = netWorth(life);
    this.maxSavings = Math.max(this.maxSavings, life.finances.savings);
    this.maxDebt = Math.max(this.maxDebt, debt);
    this.maxNetWorth = Math.max(this.maxNetWorth, worth);
    if (life.career.gig) this.gig = true;
    const kind = life.housing.kind;
    if (kind === 'renting' || kind === 'owned') this.movedOut = true;
    if (kind === 'owned') this.owned = true;
    if (kind === 'homeless') this.homeless = true;
    if (life.character.cityId !== life.character.birthCityId) this.relocated = true;
    if (life.finances.debts.some((d) => d.kind === 'collections')) this.collections = true;
    if (life.phase === 'yearStart' && ages.includes(life.character.age)) {
      this.at.set(life.character.age, { savings: life.finances.savings, debt, netWorth: worth });
    }
  }
}

const MONEY_AGES = [18, 25, 35, 45, 65, 80];

function spread(values: number[], debts: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return { lives: values.length, p10: at(0.1), median: at(0.5), p90: at(0.9), inDebt: debts.filter((d) => d > 0).length };
}

/** The largest money gain each event's outcomes can give. */
function largestGains(content: ContentBundle): Map<string, number> {
  const gains = new Map<string, number>();
  for (const [id, def] of Object.entries(content.events)) {
    const outcomes = def.autoOutcome
      ? [def.autoOutcome]
      : (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
    let best = 0;
    for (const o of outcomes) {
      const total = (o.effects as Effect[]).reduce((sum, e) => sum + (e.type === 'money' && e.delta > 0 ? e.delta : 0), 0);
      best = Math.max(best, total);
    }
    if (best > 0) gains.set(id, best);
  }
  return gains;
}

export interface RelationshipReport {
  /** Lives that reached the adult age (the base for the shares below). */
  adults: number;
  everDated: number;
  everMarried: number;
  reached40: number;
  marriedBy40: number;
  marriages: number;
  divorces: number;
  /** Dating or engaged couples who split up. */
  breakups: number;
  /** Lives in which a spouse died during the marriage. */
  widowed: number;
  /** Median age at first marriage, over lives that married. */
  medianFirstMarriageAge: number | null;
  /** Lives that were married more than once. */
  remarried: number;
  actionsTaken: Record<ActionId, number>;
  /** People outside family still in your life at the end (not faded): median and most. */
  peopleAtEnd: { median: number; most: number };
}

/** What one life did in love, watched step by step. */
class RomanceWatcher {
  marriages = 0;
  divorces = 0;
  breakups = 0;
  dated = false;
  widowed = false;
  firstMarriageAge: number | null = null;
  private last: LifeState | null = null;

  observe(life: LifeState): void {
    const prev = this.last;
    this.last = life;
    if (!prev || prev.relationships === life.relationships) return;
    for (const [id, rel] of Object.entries(life.relationships)) {
      const before = prev.relationships[id];
      if (before && before.kind === 'spouse' && rel.kind === 'spouse' && prev.people[id]?.alive && !life.people[id]?.alive) this.widowed = true;
      if (before?.kind === rel.kind) continue;
      if (rel.kind === 'partner') this.dated = true;
      if (rel.kind === 'spouse') {
        this.marriages++;
        this.firstMarriageAge ??= life.character.age;
      }
      if (rel.kind === 'ex' && before?.kind === 'spouse') this.divorces++;
      if (rel.kind === 'ex' && before && isPartnerKind(before.kind) && before.kind !== 'spouse') this.breakups++;
    }
  }
}

const STAGES: LifeStage[] = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'];

export function runSimulation(content: ContentBundle, options: SimulationOptions): SimulationReport {
  const maxMessages = options.maxFailureMessages ?? 20;
  const failureMessages: string[] = [];
  let invariantFailures = 0;
  const ages: number[] = [];
  const perYear = Object.fromEntries(STAGES.map((s) => [s, { years: 0, events: 0, belowMin: 0, most: 0 }])) as Record<
    LifeStage,
    StageYears
  >;
  let yearsOverCap = 0;
  const fired = new Map<string, number>();
  const livesWith = new Map<string, number>();
  let deathsFromEvents = 0;
  const { budgets, cap } = content.balance.pacing;
  const { adultAge } = content.balance.relationships;
  const rel: RelationshipReport = {
    adults: 0,
    everDated: 0,
    everMarried: 0,
    reached40: 0,
    marriedBy40: 0,
    marriages: 0,
    divorces: 0,
    breakups: 0,
    widowed: 0,
    medianFirstMarriageAge: null,
    remarried: 0,
    actionsTaken: Object.fromEntries(ACTION_IDS.map((id) => [id, 0])) as Record<ActionId, number>,
    peopleAtEnd: { median: 0, most: 0 },
  };
  const firstMarriageAges: number[] = [];
  const peopleAtEnd: number[] = [];
  const { independenceAge } = content.balance.economy;
  const money: MoneyReport = {
    byAge: [],
    largest: { savings: 0, debt: 0, netWorth: 0, netWorthSeed: '' },
    adults: 0,
    outcomes: { gig: 0, movedOut: 0, relocated: 0, owned: 0, evicted: 0, homeless: 0, foreclosed: 0, bankrupt: 0, collections: 0, debtPlan: 0 },
    actionsTaken: Object.fromEntries(LIFE_ACTION_IDS.map((id) => [id, 0])) as Record<LifeActionId, number>,
    gigRenting: {},
    repeatableGains: [],
  };
  const atAge = new Map<number | 'death', { savings: number[]; debt: number[]; netWorth: number[] }>(
    [...MONEY_AGES, 'death' as const].map((a) => [a, { savings: [], debt: [], netWorth: [] }]),
  );
  const gains = largestGains(content);
  const mostFires = new Map<string, number>();

  for (let i = 0; i < options.lives; i++) {
    const seed = `${options.seedPrefix}-${i}`;
    const check = (life: LifeState) => {
      const failures = checkInvariants(life, content);
      invariantFailures += failures.length;
      for (const f of failures) if (failureMessages.length < maxMessages) failureMessages.push(`${seed} age ${life.character.age}: ${f}`);
    };
    const choices = createRng(`${seed}:choices`);
    const player = createRng(`${seed}:player`);
    const romance = new RomanceWatcher();
    const wallet = new MoneyWatcher();
    const profile = rollMoneyProfile(player);
    const seenThisLife = new Set<string>();
    const firesThisLife = new Map<string, number>();
    const watch = (l: LifeState) => {
      check(l);
      romance.observe(l);
      wallet.observe(l, MONEY_AGES);
      // A management action's result event, just queued.
      const queued = l.phase === 'action' && l.pending.length === 1 ? l.pending[0]! : null;
      if (queued && queued.resolvedChoiceId === undefined) {
        fired.set(queued.eventId, (fired.get(queued.eventId) ?? 0) + 1);
        seenThisLife.add(queued.eventId);
        firesThisLife.set(queued.eventId, (firesThisLife.get(queued.eventId) ?? 0) + 1);
      }
    };
    let life = createLife({ mode: 'random', seed, birthYear: 2026 }, content);
    watch(life);
    while (life.phase !== 'dead') {
      // Between years, the simulated player may act on money and home...
      for (const [actionId, params] of chooseMoneyActions(life, content, player, profile)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = performAction(life, actionId, params, content);
        watch(life);
        money.actionsTaken[actionId]++;
      }
      // ...and on relationships.
      for (const [actionId, personId] of chooseActions(life, content, player)) {
        if (!isActionAvailable(life, actionId, personId, content)) continue;
        life = playAction(life, content, actionId, personId, choices, watch);
        rel.actionsTaken[actionId]++;
      }
      life = beginYear(life, content);
      watch(life);
      const stage = perYear[life.character.lifeStage];
      const count = life.pending.length;
      stage.years++;
      stage.events += count;
      stage.most = Math.max(stage.most, count);
      if (count < budgets[life.character.lifeStage].min) stage.belowMin++;
      if (count > cap) yearsOverCap++;
      for (const p of life.pending) {
        fired.set(p.eventId, (fired.get(p.eventId) ?? 0) + 1);
        seenThisLife.add(p.eventId);
        firesThisLife.set(p.eventId, (firesThisLife.get(p.eventId) ?? 0) + 1);
      }
      const ledger = life.finances.lastLedger;
      if (life.housing.kind === 'renting' && life.career.gig && life.career.job === null && ledger?.year === life.currentYear) {
        const city = (money.gigRenting[life.character.cityId] ??= { years: 0, shortYears: 0 });
        city.years++;
        if (ledger.borrowed > 0) city.shortYears++;
      }
      life = resolveAll(life, content, choices, watch);
      const diedFromEvent = life.death !== null;
      life = endYear(life, content);
      watch(life);
      if (diedFromEvent) deathsFromEvents++;
    }
    for (const id of seenThisLife) livesWith.set(id, (livesWith.get(id) ?? 0) + 1);
    for (const [id, n] of firesThisLife) if (gains.has(id)) mostFires.set(id, Math.max(mostFires.get(id) ?? 0, n));
    ages.push(life.character.age);

    for (const [age, v] of wallet.at) {
      const bucket = atAge.get(age)!;
      bucket.savings.push(v.savings);
      bucket.debt.push(v.debt);
      bucket.netWorth.push(v.netWorth);
    }
    const end = atAge.get('death')!;
    end.savings.push(life.finances.savings);
    end.debt.push(totalDebt(life));
    end.netWorth.push(netWorth(life));
    money.largest.savings = Math.max(money.largest.savings, wallet.maxSavings);
    money.largest.debt = Math.max(money.largest.debt, wallet.maxDebt);
    if (wallet.maxNetWorth > money.largest.netWorth) money.largest = { ...money.largest, netWorth: wallet.maxNetWorth, netWorthSeed: seed };
    if (life.character.age >= independenceAge) {
      money.adults++;
      const o = money.outcomes;
      const tags = new Set(life.history.flatMap((e) => e.tags));
      if (wallet.gig) o.gig++;
      if (wallet.movedOut) o.movedOut++;
      if (wallet.relocated) o.relocated++;
      if (wallet.owned) o.owned++;
      if (tags.has('evicted')) o.evicted++;
      if (wallet.homeless) o.homeless++;
      if (tags.has('foreclosed')) o.foreclosed++;
      if (life.finances.bankruptcyYear !== undefined) o.bankrupt++;
      if (wallet.collections) o.collections++;
      if (life.finances.debtPlanYear !== undefined) o.debtPlan++;
    }

    const age = life.character.age;
    if (age >= adultAge) {
      rel.adults++;
      if (romance.dated || romance.marriages > 0) rel.everDated++;
      if (romance.marriages > 0) rel.everMarried++;
    }
    if (age >= 40) {
      rel.reached40++;
      if (romance.firstMarriageAge !== null && romance.firstMarriageAge <= 40) rel.marriedBy40++;
    }
    rel.marriages += romance.marriages;
    rel.divorces += romance.divorces;
    rel.breakups += romance.breakups;
    if (romance.widowed) rel.widowed++;
    if (romance.marriages > 1) rel.remarried++;
    if (romance.firstMarriageAge !== null) firstMarriageAges.push(romance.firstMarriageAge);
    peopleAtEnd.push(Object.values(life.relationships).filter((r) => !isFamilyKind(r.kind) && r.status !== 'ended').length);
  }
  firstMarriageAges.sort((a, b) => a - b);
  peopleAtEnd.sort((a, b) => a - b);
  rel.medianFirstMarriageAge = firstMarriageAges.length > 0 ? firstMarriageAges[Math.floor(firstMarriageAges.length / 2)]! : null;
  rel.peopleAtEnd = { median: peopleAtEnd[Math.floor(peopleAtEnd.length / 2)] ?? 0, most: peopleAtEnd.at(-1) ?? 0 };

  money.byAge = [...atAge.entries()].map(([age, v]) => ({
    age,
    savings: spread(v.savings, v.debt),
    debt: spread(v.debt, v.debt),
    netWorth: spread(v.netWorth, v.debt),
  }));
  money.repeatableGains = [...mostFires.entries()]
    .map(([eventId, mostInOneLife]) => {
      const largestGain = gains.get(eventId)!;
      return { eventId, mostInOneLife, largestGain, mostMoney: mostInOneLife * largestGain };
    })
    .sort((a, b) => b.mostMoney - a.mostMoney);

  ages.sort((a, b) => a - b);
  const at = (p: number) => ages[Math.min(ages.length - 1, Math.floor(ages.length * p))] ?? 0;
  const totalEventsFired = [...fired.values()].reduce((a, b) => a + b, 0);
  const events = Object.keys(content.events)
    .sort()
    .map((id) => ({
      id,
      fired: fired.get(id) ?? 0,
      share: totalEventsFired > 0 ? (fired.get(id) ?? 0) / totalEventsFired : 0,
      lives: livesWith.get(id) ?? 0,
    }));

  return {
    lives: options.lives,
    invariantFailures,
    failureMessages,
    lifespan: {
      median: at(0.5),
      p10: at(0.1),
      p90: at(0.9),
      youngest: ages[0] ?? 0,
      oldest: ages[ages.length - 1] ?? 0,
      under18: ages.filter((a) => a < 18).length,
    },
    eventsPerYear: perYear,
    yearsOverCap,
    events,
    totalEventsFired,
    deathsFromEvents,
    relationships: rel,
    money,
  };
}

const dollars = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');

/** A plain-text summary of a report. */
export function formatReport(report: SimulationReport, content: ContentBundle): string {
  const lines: string[] = [];
  const { lifespan } = report;
  lines.push(`Simulated ${report.lives} lives.`);
  lines.push(`Invariant failures: ${report.invariantFailures}`);
  for (const m of report.failureMessages) lines.push(`  - ${m}`);
  lines.push(
    `Lifespan: median ${lifespan.median}, 10th percentile ${lifespan.p10}, 90th ${lifespan.p90}, youngest ${lifespan.youngest}, ` +
      `oldest ${lifespan.oldest}; died before 18: ${lifespan.under18} (${pct(lifespan.under18, report.lives)}); ` +
      `killed by an event: ${report.deathsFromEvents}`,
  );
  lines.push('Events per year (budget range; average; most; years below the minimum):');
  for (const [stage, y] of Object.entries(report.eventsPerYear)) {
    const b = content.balance.pacing.budgets[stage as LifeStage];
    lines.push(
      `  ${stage.padEnd(10)} ${b.min}–${b.max}; avg ${(y.years ? y.events / y.years : 0).toFixed(2)}; most ${y.most}; below min ${pct(y.belowMin, y.years)}`,
    );
  }
  lines.push(`Years over the cap of ${content.balance.pacing.cap}: ${report.yearsOverCap}`);
  const r = report.relationships;
  lines.push(`Relationships (${r.adults} lives reached ${content.balance.relationships.adultAge}):`);
  lines.push(`  ever dated ${pct(r.everDated, r.adults)}; ever married ${pct(r.everMarried, r.adults)}; married by 40: ${pct(r.marriedBy40, r.reached40)} of ${r.reached40} lives that reached 40`);
  lines.push(
    `  marriages ${r.marriages}; divorces ${r.divorces} (${pct(r.divorces, r.marriages)} of marriages); married more than once ${pct(r.remarried, r.everMarried)} of married lives; ` +
      `widowed ${pct(r.widowed, r.everMarried)} of married lives; breakups before marriage ${r.breakups}`,
  );
  lines.push(`  median age at first marriage: ${r.medianFirstMarriageAge ?? '—'}`);
  lines.push(`  actions taken: ${ACTION_IDS.map((id) => `${id} ${r.actionsTaken[id]}`).join(', ')}`);
  lines.push(`  people outside family still in your life at the end: median ${r.peopleAtEnd.median}, most ${r.peopleAtEnd.most}`);
  const m = report.money;
  lines.push(`Money (${m.adults} lives reached ${content.balance.economy.independenceAge}):`);
  lines.push('  age      savings p10 / median / p90          debt p10 / median / p90     net worth p10 / median / p90   in debt');
  for (const row of m.byAge) {
    const three = (s: Spread) => `${dollars(s.p10)} / ${dollars(s.median)} / ${dollars(s.p90)}`;
    lines.push(
      `  ${String(row.age).padEnd(6)} ${three(row.savings).padEnd(33)} ${three(row.debt).padEnd(27)} ${three(row.netWorth).padEnd(30)} ${pct(row.debt.inDebt, row.debt.lives)} of ${row.debt.lives}`,
    );
  }
  lines.push(
    `  largest ever: savings ${dollars(m.largest.savings)}, debt ${dollars(m.largest.debt)}, net worth ${dollars(m.largest.netWorth)} (${m.largest.netWorthSeed}); ` +
      `safe integer limit ${dollars(Number.MAX_SAFE_INTEGER)}`,
  );
  const o = m.outcomes;
  lines.push(
    `  gig work ${pct(o.gig, m.adults)}; moved out ${pct(o.movedOut, m.adults)}; relocated ${pct(o.relocated, m.adults)}; owned a home ${pct(o.owned, m.adults)}; ` +
      `debt in collections ${pct(o.collections, m.adults)}; debt plan ${pct(o.debtPlan, m.adults)}; bankrupt ${pct(o.bankrupt, m.adults)}; ` +
      `evicted ${pct(o.evicted, m.adults)}; homeless ${pct(o.homeless, m.adults)}; foreclosed ${pct(o.foreclosed, m.adults)}`,
  );
  lines.push(`  actions taken: ${LIFE_ACTION_IDS.map((id) => `${id} ${m.actionsTaken[id]}`).join(', ')}`);
  lines.push(
    `  gig-only renters who couldn't cover their costs, by city: ${Object.entries(m.gigRenting)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([city, y]) => `${city} ${pct(y.shortYears, y.years)} of ${y.years} years`)
      .join('; ')}`,
  );
  lines.push(
    `  repeatable money (most times one life got it × largest gain): ${m.repeatableGains
      .slice(0, 5)
      .map((g) => `${g.eventId} ${g.mostInOneLife} × ${dollars(g.largestGain)} = ${dollars(g.mostMoney)}`)
      .join('; ')}`,
  );
  lines.push(`Events fired: ${report.totalEventsFired}`);
  lines.push('  event'.padEnd(30) + 'fired'.padStart(8) + 'share'.padStart(8) + 'lives'.padStart(9));
  for (const e of [...report.events].sort((a, b) => b.fired - a.fired)) {
    lines.push(
      `  ${e.id.padEnd(28)}${String(e.fired).padStart(8)}${pct(e.fired, report.totalEventsFired).padStart(8)}${pct(e.lives, report.lives).padStart(9)}`,
    );
  }
  return lines.join('\n');
}
