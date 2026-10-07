/**
 * Teen actions (T1, More → Teen years): choose this year's focus, try to join
 * or leave a crowd, get a permit, take driving lessons and the license test,
 * take or quit a teen job, try out for or leave a team or club, ask a parent to
 * loosen a rule and break one. Each takes effect at once, between years; the
 * common checks (between years, input validation, the input log) live in ./index.ts.
 * A rule broken between years that gets you caught queues its event for the
 * year that begins next.
 */
import { FOCUS_IDS, RULE_DOMAINS, type ContentBundle, type RuleDomainId, type TeenFocusId } from '../../content/schemas';
import { activityBlock, joinActivity, leaveActivity, inActivity } from '../teen/activities';
import { joinBlock, joinClique, leaveBlock, leaveClique, queueTeenEvent } from '../teen/cliques';
import { chooseFocus, focusBlock } from '../teen/focus';
import { endTeenJob, hireJob, jobBlock } from '../teen/jobs';
import { addLesson, lessonBlock, permitBlock, takePermit, takeTest, testBlock } from '../teen/license';
import { negotiate, negotiateBlock, breakRule } from '../teen/rules';
import { inTeenYears, ruleOf } from '../teen/query';
import type { LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const TEEN_ACTION_IDS = [
  'choose_focus',
  'join_clique',
  'leave_clique',
  'get_permit',
  'driving_lesson',
  'take_license_test',
  'take_teen_job',
  'quit_teen_job',
  'join_activity',
  'leave_activity',
  'negotiate_rule',
  'break_rule',
] as const;
export type TeenActionId = (typeof TEEN_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;
const text = (params: unknown, key: string): string | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined;
};
const only = (params: unknown, keys: readonly string[]): boolean =>
  typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

const ruleDomain = (params: unknown): RuleDomainId | undefined => {
  const v = field(params, 'ruleId');
  return (RULE_DOMAINS as readonly unknown[]).includes(v) ? (v as RuleDomainId) : undefined;
};

export const TEEN_ACTIONS: Record<TeenActionId, LifeActionRule> = {
  choose_focus: {
    parse: (params) => {
      const focus = field(params, 'focus');
      return only(params, ['focus']) && (FOCUS_IDS as readonly unknown[]).includes(focus) ? { focus: focus as TeenFocusId } : null;
    },
    allowed: (state, _p, content) => focusBlock(state, content) === null,
    apply: (state, p) => chooseFocus(state, p.focus!),
  },
  join_clique: {
    parse: (params) => {
      const cliqueId = text(params, 'cliqueId');
      return only(params, ['cliqueId']) && cliqueId !== undefined ? { cliqueId } : null;
    },
    allowed: (state, p, content) => p.cliqueId !== undefined && joinBlock(state, p.cliqueId, content) === null,
    apply: (state, p, content) => void joinClique(state, p.cliqueId!, content),
  },
  leave_clique: {
    parse: none,
    allowed: (state) => leaveBlock(state) === null,
    apply: (state, _p, content) => void leaveClique(state, content),
  },
  get_permit: {
    parse: none,
    allowed: (state, _p, content) => permitBlock(state, content) === null,
    apply: (state, _p, content) => takePermit(state, content),
  },
  driving_lesson: {
    parse: none,
    allowed: (state, _p, content) => lessonBlock(state, content) === null,
    apply: (state, _p, content) => addLesson(state, content, true),
  },
  take_license_test: {
    parse: none,
    allowed: (state, _p, content) => testBlock(state, content) === null,
    apply: (state, _p, content) => void takeTest(state, content),
  },
  take_teen_job: {
    parse: (params) => {
      const teenJobId = text(params, 'teenJobId');
      return only(params, ['teenJobId']) && teenJobId !== undefined ? { teenJobId } : null;
    },
    allowed: (state, p, content) => p.teenJobId !== undefined && jobBlock(state, p.teenJobId, content) === null,
    apply: (state, p, content) => void hireJob(state, p.teenJobId!, content),
  },
  quit_teen_job: {
    parse: none,
    allowed: (state) => state.teen.job !== null,
    apply: (state, _p, content) => void endTeenJob(state, content),
  },
  join_activity: {
    parse: (params) => {
      const activityId = text(params, 'activityId');
      return only(params, ['activityId']) && activityId !== undefined ? { activityId } : null;
    },
    allowed: (state, p, content) => p.activityId !== undefined && activityBlock(state, p.activityId, content) === null,
    apply: (state, p, content) => void joinActivity(state, p.activityId!, content),
  },
  leave_activity: {
    parse: (params) => {
      const activityId = text(params, 'activityId');
      return only(params, ['activityId']) && activityId !== undefined ? { activityId } : null;
    },
    allowed: (state, p) => p.activityId !== undefined && inActivity(state, p.activityId),
    apply: (state, p, content) => void leaveActivity(state, p.activityId!, content),
  },
  negotiate_rule: {
    parse: (params) => {
      const ruleId = ruleDomain(params);
      return only(params, ['ruleId']) && ruleId !== undefined ? { ruleId } : null;
    },
    allowed: (state, p, content) => p.ruleId !== undefined && negotiateBlock(state, p.ruleId as RuleDomainId, content) === null,
    apply: (state, p, content) => void negotiate(state, p.ruleId as RuleDomainId, content),
  },
  break_rule: {
    parse: (params) => {
      const ruleId = ruleDomain(params);
      return only(params, ['ruleId']) && ruleId !== undefined ? { ruleId } : null;
    },
    allowed: (state, p, content) => inTeenYears(state, content) && state.housing.kind !== 'incarcerated' && p.ruleId !== undefined && ruleOf(state, p.ruleId as RuleDomainId) !== undefined,
    apply: (state, p, content) => {
      const result = breakRule(state, p.ruleId as RuleDomainId, content);
      if (result?.caught && result.parentId !== undefined) queueTeenEvent(state, 'caught', { parent: result.parentId }, content, 'next');
    },
  },
};

export type { ContentBundle, LifeState };
