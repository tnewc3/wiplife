/**
 * Simulation runner: plays many random lives with random choices (and, from
 * Stage 5, a simple player model for relationship actions) and reports
 * invariant failures, lifespans, events per year, how often each event fired,
 * and marriage and divorce rates. Later stages add their own reports.
 */
import { ACTION_IDS, type ActionId, type ContentBundle } from '../../src/content/schemas';
import { isActionAvailable } from '../../src/engine/actions';
import { playAction, resolveAll } from '../../src/engine/autoplay';
import { checkInvariants } from '../../src/engine/invariants';
import { beginYear, createLife, endYear } from '../../src/engine/life';
import { isFamilyKind, isPartnerKind } from '../../src/engine/relationships';
import { createRng } from '../../src/engine/rng';
import type { LifeStage, LifeState } from '../../src/engine/types';
import { chooseActions } from './bot';

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
    const seenThisLife = new Set<string>();
    const watch = (l: LifeState) => {
      check(l);
      romance.observe(l);
      // A management action's result event, just queued.
      const queued = l.phase === 'action' && l.pending.length === 1 ? l.pending[0]! : null;
      if (queued && queued.resolvedChoiceId === undefined) {
        fired.set(queued.eventId, (fired.get(queued.eventId) ?? 0) + 1);
        seenThisLife.add(queued.eventId);
      }
    };
    let life = createLife({ mode: 'random', seed, birthYear: 2026 }, content);
    watch(life);
    while (life.phase !== 'dead') {
      // Between years, the simulated player may act on relationships.
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
      }
      life = resolveAll(life, content, choices, watch);
      const diedFromEvent = life.death !== null;
      life = endYear(life, content);
      watch(life);
      if (diedFromEvent) deathsFromEvents++;
    }
    for (const id of seenThisLife) livesWith.set(id, (livesWith.get(id) ?? 0) + 1);
    ages.push(life.character.age);

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
  };
}

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
  lines.push(`Events fired: ${report.totalEventsFired}`);
  lines.push('  event'.padEnd(30) + 'fired'.padStart(8) + 'share'.padStart(8) + 'lives'.padStart(9));
  for (const e of [...report.events].sort((a, b) => b.fired - a.fired)) {
    lines.push(
      `  ${e.id.padEnd(28)}${String(e.fired).padStart(8)}${pct(e.fired, report.totalEventsFired).padStart(8)}${pct(e.lives, report.lives).padStart(9)}`,
    );
  }
  return lines.join('\n');
}
