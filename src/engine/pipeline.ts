import { runTravel } from './travel/travel';
import { runMigration } from './migration/step';
import { runLanguages } from './languages';
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
 * requests it queues are picked up the same year. The web step (E4) follows it:
 * ties between the people you know change, and what they know spreads. The
 * mental health step (M1) follows the health step: who has noticed you struggling.
 * The later-life step (L1) follows the lives step: your children's babies become grandchildren,
 * care near the end and a warning of a death coming are rolled, and history calls for amends.
 * The belonging step (W2) follows it, before the web: standing in the groups you belong to, the people there, faith and values drifting,
 * and the year's offers (an invitation, a role, a decision about drifting away).
 * The teen step (T1) follows education, so the grade points a focus, a crowd,
 * a team or a teen job gives count toward the year that has begun; the teen
 * job's pay joins the ledger's income. The possessions step (E5) follows the ledger, which has charged the year's upkeep and insurance:
 * pets and vehicles age, accidents and deaths are queued as events.
 * The looks step (P1) comes after the travel step and before pacing: whoever joined your life since the last year gets a look (it draws nothing from the life's random stream).
 * The hub step (C2) follows the social step and comes before the fame step: skills grow and fade, the roles you have add up to a load
 * that costs Stress and burnout, and the band's players improve; performance enhancers are taken and tested before the season.
 * The social step (Batch 8) comes right before it, so a year of posting counts as a year of work and your reach is fame when the fame step runs.
 * The fame step (E6b) follows the crime step and runs before the ledger: the year's
 * releases come out, fame rises or fades, and the year's pay is set aside for the ledger.
 * The business step (W3) follows the fame step and runs before the ledger: each business's year (demand, revenue, costs, staff, profit),
 * the share paid to you as income for the ledger and any money you must put in to cover a loss, and failure when the money runs out.
 * The crime step (E6a) follows the legal step: heat fades, a crew's year passes,
 * the police may open an investigation or make an arrest, and the year's jobs
 * and trouble are queued as events.
 */
import type { ContentBundle } from '../content/schemas';
import { runCrime } from './crime/step';
import { runFame } from './fame/step';
import { runSocial } from './social/step';
import { runHub } from './hub/step';
import { runHeritage } from './estate/heritage';
import { runLives } from './lives/step';
import { runLooks } from './looks/step';
import { runLater } from './later/step';
import { runBelonging } from './belonging/step';
import { runBusiness } from './business/step';
import { runPossessions } from './possessions/step';
import { runTeen } from './teen/step';
import { runWeb } from './web/step';
import { runFamily } from './family/step';
import { runMoods } from './interactions/mood';
import { runMental } from './mental/step';
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
  { id: 'crime', run: runCrime },
  { id: 'social', run: runSocial },
  { id: 'hub', run: runHub },
  { id: 'fame', run: runFame },
  { id: 'business', run: runBusiness },
  { id: 'education', run: runEducation },
  { id: 'languages', run: runLanguages },
  { id: 'migration', run: runMigration },
  { id: 'teen', run: runTeen },
  { id: 'career', run: runCareer },
  { id: 'economy', run: runEconomy },
  { id: 'possessions', run: runPossessions },
  { id: 'health', run: runHealth },
  { id: 'mental', run: runMental },
  { id: 'relationships', run: runRelationships },
  { id: 'moods', run: runMoods },
  { id: 'selfDiscovery', run: runSelfDiscovery },
  { id: 'lives', run: runLives },
  { id: 'later', run: runLater },
  { id: 'belonging', run: runBelonging },
  { id: 'web', run: runWeb },
  { id: 'travel', run: runTravel },
  { id: 'looks', run: runLooks },
  { id: 'pacing', run: runPacing },
];

/** Runs each step in order. */
export function runPipeline(state: LifeState, content: ContentBundle, steps: readonly PipelineStep[] = YEAR_PIPELINE): void {
  for (const step of steps) step.run(state, content);
}
