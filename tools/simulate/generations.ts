/**
 * Heirs, three generations deep (E2b): continues each life that ends with a
 * living child as one of them, plays the heir with the same player model, and
 * does it again, collecting what the run measures about inheritance
 * (./heirs.ts). Each generation is a full simulation of its own
 * (runSimulation with the heirs as its starting lives), so its invariants,
 * replay check and event counts are the usual ones.
 */
import type { ContentBundle } from '../../src/content/schemas';
import type { LifeState } from '../../src/engine/types';
import { buildHeirReport, HeirCollector, type ChainRecord, type GenerationSummary, type HeirReport } from './heirs';
import { runSimulation, type SimulatedPlayer, type SimulationOptions, type SimulationReport } from './run';

/** One life in this many is rebuilt from its input log in a run (src/engine/replay.ts); the heirs' snapshots are kept for those. */
const REPLAY_EVERY = 100;

/** The categories of events that only heirs see. */
const HEIR_CATEGORIES = new Set(['estate', 'guardianship', 'legacy']);

/** What a first-generation run needs: pass its `onLife` to the collector, and read the result back through `continueAsHeirs`. */
export function startChains(content: ContentBundle): { collector: HeirCollector; chains: ChainRecord[]; onLife: (life: LifeState) => void } {
  const chains: ChainRecord[] = [];
  const collector = new HeirCollector(content, 1, chains, null, REPLAY_EVERY);
  return { collector, chains, onLife: (life) => collector.record(life) };
}

export interface HeirRun {
  report: HeirReport;
  /** The heirs' own generations' full reports (generation 2 onward). */
  reports: SimulationReport[];
}

/**
 * Plays `generations - 1` more generations from the first run's heirs. `first`
 * is the first generation's report (for its counts) and `firstCollector` the
 * collector its `onLife` fed.
 */
export function continueAsHeirs(
  content: ContentBundle,
  generations: number,
  first: { report: SimulationReport; collector: HeirCollector; chains: ChainRecord[] },
  options: { seedPrefix: string; player: SimulatedPlayer },
): HeirRun {
  const summaries: GenerationSummary[] = [
    {
      generation: 1,
      lives: first.collector.lives,
      withHeirs: first.collector.withHeirs,
      withoutHeirs: first.collector.withoutHeirs,
      withMinorChild: first.collector.withMinorChild,
      wills: first.collector.wills,
      invariantFailures: first.report.invariantFailures,
      heirEvents: {},
    },
  ];
  const records = [...first.collector.records];
  const reports: SimulationReport[] = [];
  const memoryTags = new Set(Object.values(content.registries.heir.memories).flat());
  let heirsWithEvent = 0;
  let memoryEventsFired = 0;

  let collector = first.collector;
  for (let generation = 2; generation <= generations; generation++) {
    const starts = collector.starts;
    if (starts.length === 0) break;
    const startRecords = collector.records;
    const next = new HeirCollector(content, generation, first.chains, collector.chains, REPLAY_EVERY);
    const heirEvents: Record<string, number> = {};
    let k = 0;
    const simulationOptions: SimulationOptions = {
      lives: starts.length,
      seedPrefix: `${options.seedPrefix}-g${generation}`,
      player: options.player,
      starts,
      onLife: (dead) => {
        const record = startRecords[k++]!;
        // Events about the estate, the guardian and the family's name, and the memory events of being raised.
        let sawMemory = false;
        for (const [id, log] of Object.entries(dead.eventLog)) {
          const def = content.events[id];
          if (def && HEIR_CATEGORIES.has(def.category)) heirEvents[id] = (heirEvents[id] ?? 0) + 1;
          if (memoryTags.has(id)) {
            sawMemory = true;
            memoryEventsFired += log.count;
          }
        }
        if (sawMemory && record.memories.length > 0) heirsWithEvent++;
        next.record(dead);
      },
    };
    const report = runSimulation(content, simulationOptions);
    reports.push(report);
    summaries.push({
      generation,
      lives: next.lives,
      withHeirs: next.withHeirs,
      withoutHeirs: next.withoutHeirs,
      withMinorChild: next.withMinorChild,
      wills: next.wills,
      invariantFailures: report.invariantFailures,
      heirEvents,
    });
    records.push(...next.records);
    collector = next;
  }
  // The last generation's heirs are never played; keep their records out of the report only if no one played them.
  const played = new Set<number>(summaries.map((s) => s.generation));
  const reportRecords = records.filter((r) => played.has(r.generation));
  return { report: buildHeirReport(summaries, reportRecords, first.chains, { heirsWithEvent, eventsFired: memoryEventsFired }), reports };
}
