/**
 * The law (year pipeline step 3, Stage 9), as each year begins:
 *
 * - In prison: once your last year inside is over you're released (to
 *   family, a rental or the street, then parole) and a release event is
 *   queued; until then the year inside pulls on your stats.
 * - On probation: once its last year is over it ends; until then, now and
 *   then (more often for risk-takers), a probation event is queued.
 *
 * The rules live in ../legal.ts; numbers in balance/legal.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { endProbation, isIncarcerated, onProbation, queueLegalEvent, release } from '../legal';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { applyStatEffects } from './economy';

/** Step 3: release, prison life, and probation. */
export function runLegal(state: LifeState, content: ContentBundle): void {
  const b = content.balance.legal;
  const legal = state.legal;
  if (isIncarcerated(state)) {
    if (state.currentYear > (legal.incarceratedUntil ?? state.currentYear - 1)) release(state, content);
    else applyStatEffects(state, b.prison.effects);
    return;
  }
  if (legal.probationUntil !== undefined && legal.probationUntil < state.currentYear) {
    endProbation(state, content);
    return;
  }
  if (onProbation(state) && chance(state.rng, curveAt(b.probation.eventChance, state.character.personality.riskTaking))) {
    queueLegalEvent(state, 'probation', state.currentYear, content);
  }
}
