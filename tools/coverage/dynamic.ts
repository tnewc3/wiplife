/**
 * The simulated half of the content coverage report (tools/coverage.ts,
 * Stage 10): plays lives with the simulation's careful player and, each year,
 * counts the events that could have happened (eligible: requirements,
 * cooldowns and one-time rules allow them; cast roles aren't tried). From
 * those counts come the well-covered share of years, dry spots by age and by
 * situation, and from each finished life how often events repeat in it.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { LIFE_STAGE_IDS } from '../../src/content/schemas';
import { eventIndex, eventWeight } from '../../src/engine/events/selection';
import type { LifeStage, LifeState } from '../../src/engine/types';
import { runSimulation, type SimulationReport } from '../simulate/run';

export interface EligibleSpread {
  years: number;
  median: number;
  p10: number;
  /** Share of these years with at least the target number of eligible events. */
  covered: number;
}

export interface DynamicCoverage {
  lives: number;
  /** Simulated years outside prison (prison has its own small set of events). */
  years: number;
  prisonYears: number;
  minEligible: number;
  /** Share of the years outside prison with at least minEligible eligible events. */
  coveredYears: number;
  byStage: Record<LifeStage, EligibleSpread>;
  byAge: (EligibleSpread & { age: number })[];
  /** Situations a life can be in, and how much content fits them. */
  situations: (EligibleSpread & { id: string; label: string })[];
  repetition: {
    /** Per life, on average: events fired, and different events among them. */
    firesPerLife: number;
    uniquePerLife: number;
    /** Share of all fires that repeat an event the life had already seen. */
    repeatShare: number;
    /** The events that come back most within one life. */
    mostRepeated: { id: string; lives: number; perLife: number; most: number }[];
  };
  /** The simulation report of the same lives (event shares, invariant failures). */
  simulation: SimulationReport;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function spread(values: number[], min: number): EligibleSpread {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    years: sorted.length,
    median: quantile(sorted, 0.5),
    p10: quantile(sorted, 0.1),
    covered: sorted.length > 0 ? sorted.filter((v) => v >= min).length / sorted.length : 0,
  };
}

/**
 * The events that could happen this year: those in the life stage's pool with
 * a weight above zero, plus this year's picks from that pool (picking one puts
 * it on cooldown, so it reads as ineligible afterwards).
 */
export function eligibleEvents(life: LifeState, content: ContentBundle): Set<string> {
  const eligible = new Set<string>();
  const pool = eventIndex(content).get(life.character.lifeStage) ?? [];
  for (const def of pool) if (eventWeight(life, def, content) > 0) eligible.add(def.id);
  for (const p of life.pending) {
    const def = content.events[p.eventId];
    if (def && !def.followUpOnly && def.lifeStages.includes(life.character.lifeStage)) eligible.add(def.id);
  }
  return eligible;
}

/** The situations the report breaks years down by. A year can be in several. */
const SITUATIONS: { id: string; label: string; test: (life: LifeState, content: ContentBundle) => boolean }[] = [
  { id: 'student', label: 'in college, trade or grad school', test: (l) => ['college', 'trade', 'grad'].includes(l.education.current?.program ?? '') },
  { id: 'working', label: 'working a job', test: (l) => l.career.job !== null },
  {
    id: 'out_of_work',
    label: 'adult, out of work (no job, school or retirement)',
    test: (l, c) => l.character.age >= c.balance.economy.independenceAge && l.career.job === null && !l.career.retired && l.education.current === null,
  },
  { id: 'retired', label: 'retired', test: (l) => l.career.retired },
  { id: 'homeless', label: 'homeless', test: (l) => l.housing.kind === 'homeless' },
  { id: 'with_parents_adult', label: 'adult, living with parents', test: (l, c) => l.character.age >= c.balance.economy.independenceAge && l.housing.kind === 'with_parents' },
  { id: 'probation', label: 'on probation', test: (l) => (l.legal.probationUntil ?? -1) >= l.currentYear },
  {
    id: 'single_adult',
    label: 'adult, single',
    test: (l, c) =>
      l.character.age >= c.balance.relationships.adultAge &&
      !Object.values(l.relationships).some((r) => ['partner', 'fiance', 'spouse'].includes(r.kind) && r.status === 'active' && l.people[r.personId]?.alive),
  },
  { id: 'married', label: 'married', test: (l) => Object.values(l.relationships).some((r) => r.kind === 'spouse' && r.status === 'active' && l.people[r.personId]?.alive) },
  { id: 'in_debt', label: 'in debt', test: (l) => l.finances.debts.some((d) => d.kind !== 'mortgage' && d.balance > 0) },
];

export function collectCoverage(content: ContentBundle, options: { lives: number; seedPrefix: string }): DynamicCoverage {
  const min = content.balance.targets.coverage.minEligible;
  const all: number[] = [];
  const byStage = new Map<LifeStage, number[]>(LIFE_STAGE_IDS.map((s) => [s, []]));
  const byAge = new Map<number, number[]>();
  const bySituation = new Map<string, number[]>(SITUATIONS.map((s) => [s.id, []]));
  let prisonYears = 0;
  let fires = 0;
  let unique = 0;
  let lives = 0;
  const perEvent = new Map<string, { lives: number; fires: number; most: number }>();

  const simulation = runSimulation(content, {
    lives: options.lives,
    seedPrefix: options.seedPrefix,
    player: 'careful',
    onYear: (life) => {
      if (life.housing.kind === 'incarcerated') {
        prisonYears++;
        return;
      }
      const n = eligibleEvents(life, content).size;
      all.push(n);
      byStage.get(life.character.lifeStage)!.push(n);
      const ages = byAge.get(life.character.age) ?? [];
      ages.push(n);
      byAge.set(life.character.age, ages);
      for (const s of SITUATIONS) if (s.test(life, content)) bySituation.get(s.id)!.push(n);
    },
    onLife: (life) => {
      lives++;
      for (const [id, log] of Object.entries(life.eventLog)) {
        fires += log.count;
        unique++;
        const row = perEvent.get(id) ?? { lives: 0, fires: 0, most: 0 };
        row.lives++;
        row.fires += log.count;
        row.most = Math.max(row.most, log.count);
        perEvent.set(id, row);
      }
    },
  });

  return {
    lives,
    years: all.length,
    prisonYears,
    minEligible: min,
    coveredYears: spread(all, min).covered,
    byStage: Object.fromEntries(LIFE_STAGE_IDS.map((s) => [s, spread(byStage.get(s)!, min)])) as Record<LifeStage, EligibleSpread>,
    byAge: [...byAge.entries()].sort(([a], [b]) => a - b).map(([age, values]) => ({ age, ...spread(values, min) })),
    situations: SITUATIONS.map((s) => ({ id: s.id, label: s.label, ...spread(bySituation.get(s.id)!, min) })),
    repetition: {
      firesPerLife: lives > 0 ? fires / lives : 0,
      uniquePerLife: lives > 0 ? unique / lives : 0,
      repeatShare: fires > 0 ? (fires - unique) / fires : 0,
      mostRepeated: [...perEvent.entries()]
        .map(([id, r]) => ({ id, lives: r.lives, perLife: r.fires / r.lives, most: r.most }))
        .filter((r) => r.lives >= Math.max(1, Math.ceil(lives * 0.05)))
        .sort((a, b) => b.perLife - a.perLife || (a.id < b.id ? -1 : 1))
        .slice(0, 15),
    },
    simulation,
  };
}
