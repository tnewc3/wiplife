/**
 * The year pipeline (docs/technical.md, section M): the steps beginYear runs,
 * in this fixed order. The legal step (Stage 9) comes before school and work,
 * so a release from prison opens them again in the same year; while you're
 * in prison, the later steps do their reduced share (no school, no work, no
 * housing or living costs, no discoveries, prison events only). Steps for systems that don't exist yet are empty
 * functions in src/engine/systems, filled in by later stages.
 */
import type { ContentBundle } from '../content/schemas';
import { advanceAge } from './systems/aging';
import { runCareer } from './systems/career';
import { runEconomy } from './systems/economy';
import { runEducation } from './systems/education';
import { runHealth } from './systems/health';
import { runLegal } from './systems/legal';
import { runPacing } from './systems/pacing';
import { ageNpcs } from './systems/people';
import { runRelationships } from './systems/relationships';
import { runSelfDiscovery } from './systems/selfDiscovery';
import type { LifeState } from './types';

export interface PipelineStep {
  id: string;
  /** Changes the life in place (an Immer draft inside beginYear). */
  run: (state: LifeState, content: ContentBundle) => void;
}

export const YEAR_PIPELINE: readonly PipelineStep[] = [
  { id: 'aging', run: advanceAge },
  { id: 'npcs', run: ageNpcs },
  { id: 'legal', run: runLegal },
  { id: 'education', run: runEducation },
  { id: 'career', run: runCareer },
  { id: 'economy', run: runEconomy },
  { id: 'health', run: runHealth },
  { id: 'relationships', run: runRelationships },
  { id: 'selfDiscovery', run: runSelfDiscovery },
  { id: 'pacing', run: runPacing },
];

/** Runs each step in order. */
export function runPipeline(state: LifeState, content: ContentBundle, steps: readonly PipelineStep[] = YEAR_PIPELINE): void {
  for (const step of steps) step.run(state, content);
}
