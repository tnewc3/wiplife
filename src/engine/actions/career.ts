/**
 * Work actions on the Work/School tab (docs/design.md, sections I and L):
 * apply for a job (an interview, answered by a `hired` or `rejected` event
 * from registries/work.yaml), ask for a raise (a `raise` event with a stat
 * check), quit and retire. Applying and asking queue their result event in
 * the 'action' phase, like the actions on a person's page; quitting and
 * retiring take effect at once. The common checks (between years, input
 * validation, the input log) live in ./index.ts.
 */
import type { ContentBundle } from '../../content/schemas';
import { canAskRaise, canRetire, currentBoss, endJob, hireChance, jobApplyBlock, retire, startJob } from '../career';
import { chance } from '../rng';
import type { LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';
import { fittingResults, queueResult } from './result';

export const CAREER_ACTION_IDS = ['apply_job', 'ask_raise', 'quit_job', 'retire'] as const;
export type CareerActionId = (typeof CAREER_ACTION_IDS)[number];

const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

/** The raise events that fit now, with your boss cast as `boss`. */
function raiseResults(state: LifeState, content: ContentBundle) {
  const boss = currentBoss(state);
  return boss === null ? [] : fittingResults(state, content.registries.work.results.raise.events, { boss }, content);
}

export const CAREER_ACTIONS: Record<CareerActionId, LifeActionRule> = {
  apply_job: {
    parse: (params) => {
      if (typeof params !== 'object' || params === null || Object.keys(params).join(',') !== 'jobId') return null;
      const jobId = (params as { jobId: unknown }).jobId;
      return typeof jobId === 'string' && jobId.length > 0 ? { jobId } : null;
    },
    allowed: (state, p, content) => jobApplyBlock(state, p.jobId!, content) === null,
    // The employer decides (balance odds); the interview's story is the result event.
    apply: (state, p, content) => {
      const jobId = p.jobId!;
      const hired = chance(state.rng, hireChance(state, content.jobs[jobId]!, content));
      state.career.applied.push({ jobId, hired });
      if (hired) startJob(state, jobId, content);
      const boss = hired ? currentBoss(state) : null;
      const cast: Record<string, string> = boss ? { boss } : {};
      const options = fittingResults(state, content.registries.work.results[hired ? 'hired' : 'rejected'].events, cast, content);
      if (options.length > 0) queueResult(state, options, cast);
    },
  },
  ask_raise: {
    parse: none,
    allowed: (state, _p, content) => canAskRaise(state) && raiseResults(state, content).length > 0,
    apply: (state, _p, content) => {
      state.career.job!.raiseYear = state.currentYear;
      queueResult(state, raiseResults(state, content), { boss: currentBoss(state)! });
    },
  },
  quit_job: {
    parse: none,
    allowed: (state) => state.career.job !== null,
    apply: (state, _p, content) => endJob(state, 'quit', content),
  },
  retire: {
    parse: none,
    allowed: (state, _p, content) => canRetire(state, content),
    apply: (state, _p, content) => retire(state, content),
  },
};
