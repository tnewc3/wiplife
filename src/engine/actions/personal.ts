/**
 * Personal actions (Stage 9): seeing a doctor (More → Health) and editing
 * who you are (the Profile sheet). Seeing a doctor queues a result event
 * (registries/health.yaml), moving to 'action' like a job application;
 * an identity edit takes effect at once. The common checks (between years,
 * input validation, the input log) live in ./index.ts.
 */
import { DOCTOR_RESULTS, type ContentBundle } from '../../content/schemas';
import { editIdentity, identityEditChanges, parseIdentityEdit } from '../discovery';
import { canSeeDoctor, seeDoctor } from '../health';
import type { LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';
import { fittingResults, queueResult } from './result';

export const PERSONAL_ACTION_IDS = ['see_doctor', 'edit_identity'] as const;
export type PersonalActionId = (typeof PERSONAL_ACTION_IDS)[number];

const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

/** Every doctor result has an event that fits now (so the visit always answers). */
function doctorAnswers(state: LifeState, content: ContentBundle): boolean {
  return DOCTOR_RESULTS.every((r) => fittingResults(state, content.registries.health.doctor[r].events, {}, content).length > 0);
}

export const PERSONAL_ACTIONS: Record<PersonalActionId, LifeActionRule> = {
  see_doctor: {
    parse: none,
    allowed: (state, _p, content) => canSeeDoctor(state) && doctorAnswers(state, content),
    apply: (state, _p, content) => {
      const result = seeDoctor(state, content);
      const options = fittingResults(state, content.registries.health.doctor[result].events, {}, content);
      if (options.length > 0) queueResult(state, options, {});
    },
  },
  edit_identity: {
    parse: (params) => {
      const edit = parseIdentityEdit(params);
      return edit ? { identity: edit } : null;
    },
    allowed: (state, p) => p.identity !== undefined && identityEditChanges(state, p.identity),
    apply: (state, p, content) => editIdentity(state, p.identity!, content),
  },
};
