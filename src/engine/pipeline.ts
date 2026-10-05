/**
 * The year pipeline (docs/technical.md, section M): the steps beginYear runs,
 * in this fixed order. The legal step (Stage 9) comes before school and work,
 * so a release from prison opens them again in the same year; while you're
 * in prison, the later steps do their reduced share (no school, no work, no
 * housing or living costs, no discoveries, prison events only). The family
 * step (E2a) comes right after NPCs age, so a newborn or a child's death counts
 * in the same year's ledger and events. The heritage step (E2b) follows it: an
 * heir's trust is released and a minor's guardian is looked after before the
 * ledger runs. Steps for systems that don't exist yet are empty
 * functions in src/engine/systems, filled in by later stages. The lives step
 * (E3) comes last before pacing: the people you know have their year, and the
 * requests it queues are picked up the same year.
 */
import type { ContentBundle } from '../content/schemas';
import { runHeritage } from './estate/heritage';
import { runLives } from './lives/step';
import { runFamily } from './family/step';
import { runMoods } from './interactions/mood';
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
  { id: 'family', run: runFamily },
  { id: 'heritage', run: runHeritage },
  { id: 'legal', run: runLegal },
  { id: 'education', run: runEducation },
  { id: 'career', run: runCareer },
  { id: 'economy', run: runEconomy },
  { id: 'health', run: runHealth },
  { id: 'relationships', run: runRelationships },
  { id: 'moods', run: runMoods },
  { id: 'selfDiscovery', run: runSelfDiscovery },
  { id: 'lives', run: runLives },
  { id: 'pacing', run: runPacing },
];

/** Runs each step in order. */
export function runPipeline(state: LifeState, content: ContentBundle, steps: readonly PipelineStep[] = YEAR_PIPELINE): void {
  for (const step of steps) step.run(state, content);
}
