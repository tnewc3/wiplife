/**
 * School-year actions on the Work/School tab (Batch 3): study harder (on all
 * subjects or one), slack off, get a tutor, cheat on a test, skip class, and
 * the choice at the end of compulsory school. Each takes effect at once,
 * between years, on the school year under way; the common checks (between
 * years, input validation, the input log) live in ./index.ts. Asking a
 * teacher for help is an interaction with the teacher (E1), not an action here.
 */
import { SCHOOL_PATHS, type SchoolPath } from '../../content/schemas';
import { choosePath, pathBlock } from '../school/choice';
import { cheatOnTest, getTutor, schoolActionBlock, skipClass, slackOff, studyHarder } from '../school/rules';
import type { LifeActionParams, LifeActionRule } from './life';

export const SCHOOL_ACTION_IDS = ['study_harder', 'slack_off', 'get_tutor', 'cheat_on_test', 'skip_class', 'choose_path'] as const;
export type SchoolActionId = (typeof SCHOOL_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;
const only = (params: unknown, keys: readonly string[]): boolean =>
  typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;
const text = (params: unknown, key: string): string | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined;
};

export const SCHOOL_ACTIONS: Record<SchoolActionId, LifeActionRule> = {
  study_harder: {
    // A subject may be named: the one to work on.
    parse: (params) => {
      if (params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0)) return {};
      const subject = text(params, 'subject');
      return only(params, ['subject']) && subject !== undefined ? { subject } : null;
    },
    allowed: (state, p, content) => schoolActionBlock(state, 'study', content, p.subject) === null,
    apply: (state, p, content) => studyHarder(state, p.subject, content),
  },
  slack_off: {
    parse: none,
    allowed: (state, _p, content) => schoolActionBlock(state, 'slack', content) === null,
    apply: (state, _p, content) => slackOff(state, content),
  },
  get_tutor: {
    parse: none,
    allowed: (state, _p, content) => schoolActionBlock(state, 'tutor', content) === null,
    apply: (state, _p, content) => getTutor(state, content),
  },
  cheat_on_test: {
    parse: none,
    allowed: (state, _p, content) => schoolActionBlock(state, 'cheat', content) === null,
    apply: (state, _p, content) => cheatOnTest(state, content),
  },
  skip_class: {
    parse: none,
    allowed: (state, _p, content) => schoolActionBlock(state, 'skip', content) === null,
    apply: (state, _p, content) => skipClass(state, content),
  },
  choose_path: {
    parse: (params) => {
      const path = field(params, 'path');
      const tradeId = text(params, 'tradeId');
      if (!only(params, ['path', 'tradeId']) || !(SCHOOL_PATHS as readonly unknown[]).includes(path)) return null;
      return { path: path as SchoolPath, ...(tradeId !== undefined ? { tradeId } : {}) };
    },
    allowed: (state, p, content) => p.path !== undefined && pathBlock(state, p.path, p.tradeId, content) === null,
    apply: (state, p, content) => choosePath(state, p.path!, p.tradeId, content),
  },
};
