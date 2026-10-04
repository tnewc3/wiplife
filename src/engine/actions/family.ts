/**
 * Family actions (E2a, More → Family): starting an adoption, an IVF cycle or
 * a surrogacy. Each is available when you're eligible (age, record, money,
 * housing; see src/engine/family/process.ts) and queues a result event
 * (registries/family.yaml) where you decide: the fees and the process itself
 * start from that event's choice, so backing out costs nothing. The common
 * checks live in ./index.ts.
 */
import type { ContentBundle, FamilyProcessKind } from '../../content/schemas';
import { canStartProcess } from '../family/process';
import { currentPartner } from '../relationships';
import type { Id, LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';
import { fittingResults, queueResult } from './result';

export const FAMILY_ACTION_IDS = ['start_adoption', 'start_ivf', 'start_surrogacy'] as const;
export type FamilyActionId = (typeof FAMILY_ACTION_IDS)[number];

/** Which process each action starts. */
export const ACTION_PROCESS: Record<FamilyActionId, FamilyProcessKind> = {
  start_adoption: 'adoption',
  start_ivf: 'ivf',
  start_surrogacy: 'surrogacy',
};

const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

/** The roles the start events cast: your current partner, if you have one. */
function startCast(state: LifeState): Record<string, Id> {
  const partner = currentPartner(state);
  return partner ? { other: partner.personId } : {};
}

function startEvents(state: LifeState, kind: FamilyProcessKind, content: ContentBundle) {
  return fittingResults(state, content.registries.family[kind].start, startCast(state), content);
}

const rule = (kind: FamilyProcessKind): LifeActionRule => ({
  parse: none,
  allowed: (state, _p, content) => canStartProcess(state, kind, content) && startEvents(state, kind, content).length > 0,
  apply: (state, _p, content) => {
    const options = startEvents(state, kind, content);
    if (options.length > 0) queueResult(state, options, startCast(state));
  },
});

export const FAMILY_ACTIONS: Record<FamilyActionId, LifeActionRule> = {
  start_adoption: rule('adoption'),
  start_ivf: rule('ivf'),
  start_surrogacy: rule('surrogacy'),
};
