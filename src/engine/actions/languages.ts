import { z } from 'zod';
import { canSitExam, canStudyLanguage, examFee, sitExam, studyCost, studyLanguage } from '../languages';
import { fittingResults, queueResult } from './result';
import type { LifeActionRule } from './life';

/** Batch 10: the paid ways to study besides the adult class (an app, a tutor) and certificate exams. */
const studyInput = z.strictObject({ languageId: z.string().min(1), method: z.enum(['app', 'tutor']) });
const examInput = z.strictObject({ languageId: z.string().min(1), level: z.enum(['basic', 'conversational', 'fluent']) });
export const LANGUAGE_ACTION_IDS = ['study_language', 'sit_language_exam'] as const;
export const LANGUAGE_ACTIONS: Record<(typeof LANGUAGE_ACTION_IDS)[number], LifeActionRule> = {
  study_language: {
    parse: (params) => { const r = z.strictObject({ study: studyInput }).safeParse(params); return r.success ? r.data : null; },
    allowed: (state, p, content) => !!p.study && canStudyLanguage(state, p.study.languageId, p.study.method, content) && fittingResults(state, content.registries.languages[p.study.method].events, {}, content).length > 0,
    apply: (state, p, content) => {
      const { languageId, method } = p.study!;
      const cost = studyCost(state, method, content);
      studyLanguage(state, languageId, method, content);
      queueResult(state, fittingResults(state, content.registries.languages[method].events, {}, content), {});
      state.pending[0]!.money = { change: -cost, balance: state.finances.savings, debtChange: 0 };
    },
  },
  sit_language_exam: {
    parse: (params) => { const r = z.strictObject({ exam: examInput }).safeParse(params); return r.success ? r.data : null; },
    allowed: (state, p, content) => !!p.exam && canSitExam(state, p.exam.languageId, p.exam.level, content)
      && fittingResults(state, content.registries.languages.exam.passed, {}, content).length > 0 && fittingResults(state, content.registries.languages.exam.failed, {}, content).length > 0,
    apply: (state, p, content) => {
      const { languageId, level } = p.exam!;
      const fee = examFee(state, level, content);
      const passed = sitExam(state, languageId, level, content);
      queueResult(state, fittingResults(state, content.registries.languages.exam[passed ? 'passed' : 'failed'], {}, content), {});
      state.pending[0]!.money = { change: -fee, balance: state.finances.savings, debtChange: 0 };
    },
  },
};
