/**
 * School actions on the Work/School tab (docs/design.md, section I): apply
 * to college, trade school or grad school; choose (or change) a major; drop
 * out; go back to a program you left; take the GED; turn down a place. Each
 * takes effect at once, between years; school itself (and its tuition)
 * starts as the next year begins. The common checks (between years, input
 * validation, the input log) live in ./index.ts.
 */
import { APPLY_PROGRAMS, TIERS, type ApplyProgram, type ContentBundle, type Tier } from '../../content/schemas';
import {
  admissionChance,
  admit,
  applyBlock,
  canChangeMajor,
  canLeaveSchool,
  canReturn,
  canTakeGed,
  leaveSchool,
  majorChangeAddsYear,
  modelChance,
  optionKey,
  returnToSchool,
  schoolHistory,
  schoolName,
  type ApplyTarget,
} from '../education';
import { spend } from '../finance';
import { chance } from '../rng';
import type { LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const EDUCATION_ACTION_IDS = ['apply_school', 'choose_major', 'drop_out', 'return_to_school', 'take_ged', 'decline_admission'] as const;
export type EducationActionId = (typeof EDUCATION_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;

const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

/** The application target the parameters describe, or null. */
export function targetOf(p: LifeActionParams): ApplyTarget | null {
  if (p.program === 'college' && p.tier && p.majorId) return { program: 'college', tier: p.tier, majorId: p.majorId };
  if (p.program === 'trade' && p.tradeId) return { program: 'trade', tradeId: p.tradeId };
  if (p.program === 'grad' && p.gradProgramId) return { program: 'grad', gradProgramId: p.gradProgramId };
  return null;
}

/** Parses apply_school parameters: exactly the fields the program needs. */
function parseApplication(params: unknown): LifeActionParams | null {
  if (typeof params !== 'object' || params === null) return null;
  const program = field(params, 'program');
  if (!(APPLY_PROGRAMS as readonly unknown[]).includes(program)) return null;
  const keys = Object.keys(params).sort().join(',');
  switch (program as ApplyProgram) {
    case 'college': {
      const tier = field(params, 'tier');
      const majorId = str(field(params, 'majorId'));
      if (keys !== 'majorId,program,tier' || !(TIERS as readonly unknown[]).includes(tier) || !majorId) return null;
      return { program: 'college', tier: tier as Tier, majorId };
    }
    case 'trade': {
      const tradeId = str(field(params, 'tradeId'));
      return keys === 'program,tradeId' && tradeId ? { program: 'trade', tradeId } : null;
    }
    case 'grad': {
      const gradProgramId = str(field(params, 'gradProgramId'));
      return keys === 'gradProgramId,program' && gradProgramId ? { program: 'grad', gradProgramId } : null;
    }
  }
}

function decide(state: LifeState, option: string, accepted: boolean): void {
  state.education.applied.push({ option, accepted });
}

export const EDUCATION_ACTIONS: Record<EducationActionId, LifeActionRule> = {
  apply_school: {
    parse: parseApplication,
    allowed: (state, p, content) => {
      const target = targetOf(p);
      return target !== null && applyBlock(state, target, content) === null;
    },
    // The application fee, then the school decides. A yes replaces any place you held.
    apply: (state, p, content) => {
      const target = targetOf(p)!;
      spend(state, content.balance.education.admission.fee, content);
      const accepted = chance(state.rng, admissionChance(state, target, content));
      decide(state, optionKey(target), accepted);
      const school = schoolName(state, target, content);
      if (accepted) {
        admit(state, target, content);
        schoolHistory(state, 'admitted', { school }, content);
      } else {
        schoolHistory(state, 'rejected', { school }, content);
      }
    },
  },
  choose_major: {
    parse: (params) => {
      const majorId = str(field(params, 'majorId'));
      return majorId && Object.keys(params as object).length === 1 ? { majorId } : null;
    },
    allowed: (state, p, content) => canChangeMajor(state, p.majorId!, content),
    // Past the first years, a change of major adds a year.
    apply: (state, p, content) => {
      const cur = state.education.current!;
      if (majorChangeAddsYear(state, content)) cur.lengthYears += 1;
      cur.majorId = p.majorId!;
      decide(state, 'major', true);
      schoolHistory(state, 'changedMajor', { subject: content.majors[p.majorId!]!.subject }, content);
    },
  },
  drop_out: {
    parse: none,
    allowed: (state, _p, content) => canLeaveSchool(state, content),
    apply: (state, _p, content) => leaveSchool(state, 'droppedOut', content),
  },
  return_to_school: {
    parse: none,
    allowed: (state, _p, content) => canReturn(state, content),
    apply: (state) => returnToSchool(state),
  },
  take_ged: {
    parse: none,
    allowed: (state, _p, content) => canTakeGed(state, content),
    // The fee, then the exam. Passing is your high school equivalency.
    apply: (state, _p, content) => {
      const ged = content.balance.education.ged;
      spend(state, ged.fee, content);
      const passed = chance(state.rng, modelChance(state, ged.pass, undefined, content));
      decide(state, 'ged', passed);
      if (passed) {
        state.education.credentials.push({ type: 'ged', year: state.currentYear });
        if (state.education.left?.program === 'high') state.education.left = null;
        schoolHistory(state, 'passedGed', {}, content);
      } else {
        schoolHistory(state, 'failedGed', {}, content);
      }
    },
  },
  decline_admission: {
    parse: none,
    allowed: (state) => state.education.admission !== null,
    apply: (state, _p, content: ContentBundle) => {
      const admission = state.education.admission!;
      state.education.admission = null;
      schoolHistory(state, 'declined', { school: schoolName(state, admission, content) }, content);
    },
  },
};
