/**
 * The content coverage report (tools/coverage.ts, Stage 10): its checks,
 * judged against `coverage` in src/content/balance/targets.yaml, and its text.
 */
import type { ContentBundle } from '../../src/content/schemas';
import type { LifeStage } from '../../src/engine/types';
import { LIFE_STAGE_IDS } from '../../src/content/schemas';
import { consistencyTargets } from '../simulate/run';
import type { DynamicCoverage, EligibleSpread } from './dynamic';
import type { StaticCoverage } from './static';

export interface CoverageCheck {
  label: string;
  value: string;
  goal: string;
  met: boolean;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** The checks that fail the report (and CI). Dynamic checks need a simulated run. */
export function coverageChecks(s: StaticCoverage, d: DynamicCoverage | null, content: ContentBundle): CoverageCheck[] {
  const t = content.balance.targets.coverage;
  const list = (xs: string[]) => (xs.length === 0 ? 'none' : xs.join(', '));
  const checks: CoverageCheck[] = [
    { label: 'events', value: String(s.events), goal: `at least ${t.minEvents}`, met: s.events >= t.minEvents },
    {
      label: 'legendary events',
      value: String(s.legendary.length),
      goal: `${t.legendary.min}–${t.legendary.max}`,
      met: s.legendary.length >= t.legendary.min && s.legendary.length <= t.legendary.max,
    },
    {
      label: 'memory tags written but never read',
      value: list(s.memoriesNeverRead.map((m) => m.tag)),
      goal: 'none',
      met: s.memoriesNeverRead.length === 0,
    },
    { label: 'memory tags read but never written', value: list(s.memoriesNeverWritten), goal: 'none', met: s.memoriesNeverWritten.length === 0 },
    {
      label: 'flags set but never checked',
      value: list(s.flagsNeverChecked.map((f) => f.flag)),
      goal: 'none',
      met: s.flagsNeverChecked.length === 0,
    },
    { label: 'flags checked but never set', value: list(s.flagsNeverSet), goal: 'none', met: s.flagsNeverSet.length === 0 },
    { label: 'events no chain can reach', value: list(s.unreachable), goal: 'none', met: s.unreachable.length === 0 },
  ];
  if (d) {
    const sim = d.simulation;
    const over = sim.events.filter((e) => content.events[e.id]?.rarity !== 'legendary' && e.share > t.maxEventShare);
    checks.push(
      {
        label: `years with at least ${t.minEligible} eligible events (outside prison)`,
        value: `${pct(d.coveredYears)} of ${d.years}`,
        goal: `at least ${pct(t.minCoveredYears)}`,
        met: d.coveredYears >= t.minCoveredYears,
      },
      {
        label: 'events (not legendary) above the share of all events fired',
        value: over.length === 0 ? 'none' : over.map((e) => `${e.id} ${pct(e.share)}`).join(', '),
        goal: `none above ${pct(t.maxEventShare)}`,
        met: over.length === 0,
      },
      { label: 'invariant failures', value: String(sim.invariantFailures), goal: '0', met: sim.invariantFailures === 0 },
      // C1: consistency violations, lifetime Happiness, repeats.
      ...consistencyTargets(sim, content).map((r) => ({ label: r.label, value: r.value, goal: r.goal, met: r.met })),
    );
  }
  return checks;
}

/** Consecutive numbers as ranges: [3, 4, 5, 9] → "3–5, 9". */
export function ranges(numbers: number[]): string {
  const out: string[] = [];
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    out.push(i === j ? String(sorted[i]) : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** Ages (with enough simulated years to judge) where fewer than half the years are well covered. */
export function dryAges(d: DynamicCoverage): number[] {
  const enough = Math.max(5, Math.ceil(d.lives * 0.05));
  return d.byAge.filter((a) => a.years >= enough && a.covered < 0.5).map((a) => a.age);
}

const STAGE_LABELS: Record<LifeStage, string> = {
  early: 'early (0–4)',
  child: 'child (5–12)',
  teen: 'teen (13–17)',
  youngAdult: 'young adult',
  adult: 'adult',
  senior: 'senior',
};

function spreadCells(s: EligibleSpread): string {
  return `${String(s.years).padStart(7)}${String(s.median).padStart(8)}${String(s.p10).padStart(6)}${pct(s.covered).padStart(10)}`;
}

export function formatCoverage(s: StaticCoverage, d: DynamicCoverage | null, content: ContentBundle): string {
  const t = content.balance.targets.coverage;
  const lines: string[] = [];
  lines.push(`Content coverage: ${s.events} events (${s.followUps} only as follow-ups or results), version ${content.contentVersion}`);
  lines.push(`  rarity: ${Object.entries(s.byRarity).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`  legendary: ${s.legendary.join(', ') || 'none'}`);
  lines.push(`  tone: ${Object.entries(s.byTone).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`  category: ${Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push('  by life stage (events that can happen in it; on their own; by tone, on their own):');
  for (const stage of LIFE_STAGE_IDS) {
    const st = s.byStage[stage];
    const tones = Object.entries(s.stageTone[stage]).map(([k, v]) => `${k} ${v}`).join(', ');
    lines.push(`    ${STAGE_LABELS[stage].padEnd(14)}${String(st.events).padStart(5)}${String(st.onTheirOwn).padStart(5)}   ${tones}`);
  }
  const childhood = new Set(
    Object.values(content.events)
      .filter((def) => !def.retired && def.lifeStages.some((x) => x === 'early' || x === 'child'))
      .map((def) => def.id),
  ).size;
  const launch: [string, number, number][] = [
    ['childhood', childhood, t.launch.childhood],
    ['teen', s.byStage.teen.events, t.launch.teen],
    ['youngAdult', s.byStage.youngAdult.events, t.launch.youngAdult],
    ['adult', s.byStage.adult.events, t.launch.adult],
    ['senior', s.byStage.senior.events, t.launch.senior],
  ];
  lines.push(`  launch targets (design section G; reported, not enforced): ${launch.map(([k, v, goal]) => `${k} ${v}/${goal}${v >= goal ? '' : ' (short)'}`).join(', ')}`);
  if (s.unusedRegistry.memories.length > 0 || s.unusedRegistry.flags.length > 0) {
    lines.push(`  registered but unused: memories ${s.unusedRegistry.memories.join(', ') || 'none'}; flags ${s.unusedRegistry.flags.join(', ') || 'none'}`);
  }

  if (d) {
    lines.push('');
    lines.push(`Simulated: ${d.lives} lives (careful player), ${d.years} years outside prison, ${d.prisonYears} in prison`);
    lines.push(`  eligible events per year (could happen: requirements, cooldowns and one-time rules; roles not cast):`);
    lines.push(`    ${''.padEnd(48)}${'years'.padStart(7)}${'median'.padStart(8)}${'p10'.padStart(6)}${`≥${d.minEligible}`.padStart(10)}`);
    for (const stage of LIFE_STAGE_IDS) lines.push(`    ${STAGE_LABELS[stage].padEnd(48)}${spreadCells(d.byStage[stage])}`);
    for (const sit of d.situations) if (sit.years > 0) lines.push(`    ${sit.label.padEnd(48)}${spreadCells(sit)}`);
    const dry = dryAges(d);
    lines.push(`  dry spots: ages where fewer than half the years have ${d.minEligible}+ eligible events: ${dry.length > 0 ? ranges(dry) : 'none'}`);
    const drySituations = d.situations.filter((x) => x.years > 0 && x.covered < 0.5).map((x) => x.label);
    lines.push(`  dry situations: ${drySituations.length > 0 ? drySituations.join('; ') : 'none'}`);
    const r = d.repetition;
    lines.push(
      `  repetition: ${r.firesPerLife.toFixed(1)} events fired per life, ${r.uniquePerLife.toFixed(1)} different; ${pct(r.repeatShare)} of fires repeat an event the life already had`,
    );
    lines.push('  most repeated within a life (events in 5%+ of lives; lives, average times per life, most):');
    for (const row of r.mostRepeated) lines.push(`    ${row.id.padEnd(32)}${String(row.lives).padStart(6)}${row.perLife.toFixed(1).padStart(7)}${String(row.most).padStart(5)}`);
    const fired = new Map(d.simulation.events.map((e) => [e.id, e]));
    const top = [...d.simulation.events].sort((a, b) => b.share - a.share).slice(0, 10);
    lines.push(`  largest shares of all events fired: ${top.map((e) => `${e.id} ${pct(e.share)}`).join(', ')}`);
    const never = Object.values(content.events)
      .filter((def) => !def.retired && (fired.get(def.id)?.fired ?? 0) === 0)
      .map((def) => (def.rarity === 'legendary' ? `${def.id} (legendary)` : def.id))
      .sort();
    lines.push(`  never fired in these lives: ${never.length > 0 ? never.join(', ') : 'none'}`);
  }

  lines.push('');
  lines.push('Checks (src/content/balance/targets.yaml, coverage):');
  for (const c of coverageChecks(s, d, content)) lines.push(`  ${c.met ? 'MET    ' : 'NOT MET'} ${c.label}: ${c.value} (target ${c.goal})`);
  return lines.join('\n');
}
