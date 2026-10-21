/**
 * Work actions on the Work tab (Batch 3): work harder, slack off, socialize
 * with your coworkers, go to the office party, report a coworker. Each takes
 * effect at once, between years; the common checks (between years, input
 * validation, the input log) live in ./index.ts. The rules are in ../work/actions.ts.
 */
import { officeParty, reportCoworker, slackAtWork, socializeAtWork, workActionBlock, workHarder } from '../work/actions';
import type { LifeActionParams, LifeActionRule } from './life';

export const WORK_ACTION_IDS = ['work_harder', 'slack_at_work', 'socialize_at_work', 'office_party', 'report_coworker'] as const;
export type WorkActionId = (typeof WORK_ACTION_IDS)[number];

const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

export const WORK_ACTIONS: Record<WorkActionId, LifeActionRule> = {
  work_harder: {
    parse: none,
    allowed: (state, _p, content) => workActionBlock(state, 'hard', content) === null,
    apply: (state, _p, content) => workHarder(state, content),
  },
  slack_at_work: {
    parse: none,
    allowed: (state, _p, content) => workActionBlock(state, 'slack', content) === null,
    apply: (state, _p, content) => slackAtWork(state, content),
  },
  socialize_at_work: {
    parse: none,
    allowed: (state, _p, content) => workActionBlock(state, 'socialize', content) === null,
    apply: (state, _p, content) => socializeAtWork(state, content),
  },
  office_party: {
    parse: none,
    allowed: (state, _p, content) => workActionBlock(state, 'party', content) === null,
    apply: (state, _p, content) => void officeParty(state, content),
  },
  report_coworker: {
    parse: (params) => {
      const id = typeof params === 'object' && params !== null ? (params as Record<string, unknown>).coworkerId : undefined;
      const keys = typeof params === 'object' && params !== null ? Object.keys(params) : [];
      return typeof id === 'string' && id.length > 0 && keys.length === 1 ? { coworkerId: id } : null;
    },
    allowed: (state, p, content) => workActionBlock(state, 'report', content, p.coworkerId) === null,
    apply: (state, p, content) => reportCoworker(state, p.coworkerId!, content),
  },
};
