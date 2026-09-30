/**
 * Simulation runner, version 1: plays many random lives with random choices
 * and reports invariant failures, lifespans, events per year and how often
 * each event fired. Later stages add their own reports.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { resolveAll } from '../../src/engine/autoplay';
import { checkInvariants } from '../../src/engine/invariants';
import { beginYear, createLife, endYear } from '../../src/engine/life';
import { createRng } from '../../src/engine/rng';
import type { LifeStage, LifeState } from '../../src/engine/types';

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

  for (let i = 0; i < options.lives; i++) {
    const seed = `${options.seedPrefix}-${i}`;
    const check = (life: LifeState) => {
      const failures = checkInvariants(life, content);
      invariantFailures += failures.length;
      for (const f of failures) if (failureMessages.length < maxMessages) failureMessages.push(`${seed} age ${life.character.age}: ${f}`);
    };
    const choices = createRng(`${seed}:choices`);
    let life = createLife({ mode: 'random', seed, birthYear: 2026 }, content);
    check(life);
    const seenThisLife = new Set<string>();
    while (life.phase !== 'dead') {
      life = beginYear(life, content);
      check(life);
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
      life = resolveAll(life, content, choices, check);
      const diedFromEvent = life.death !== null;
      life = endYear(life, content);
      check(life);
      if (diedFromEvent) deathsFromEvents++;
    }
    for (const id of seenThisLife) livesWith.set(id, (livesWith.get(id) ?? 0) + 1);
    ages.push(life.character.age);
  }

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
  lines.push(`Events fired: ${report.totalEventsFired}`);
  lines.push('  event'.padEnd(30) + 'fired'.padStart(8) + 'share'.padStart(8) + 'lives'.padStart(9));
  for (const e of [...report.events].sort((a, b) => b.fired - a.fired)) {
    lines.push(
      `  ${e.id.padEnd(28)}${String(e.fired).padStart(8)}${pct(e.fired, report.totalEventsFired).padStart(8)}${pct(e.lives, report.lives).padStart(9)}`,
    );
  }
  return lines.join('\n');
}
