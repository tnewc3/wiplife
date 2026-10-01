/**
 * Money, home, school and work management actions (docs/design.md, sections C and L): the
 * Money tab (lifestyle, paying off a debt, a debt plan), the Work/School tab (gig
 * work, from Stage 7 school: ./education.ts, and from Stage 8 jobs: ./career.ts) and More → Home (move out, move back home, relocate, buy, sell, a
 * roommate). Each takes effect at once, between years; costs that change
 * with them (rent, living costs) are charged by the next year's ledger, so
 * nothing is charged twice. The common checks (between years, input
 * validation, the input log) live in ./index.ts.
 */
import { LIFESTYLES, type ApplyProgram, type ContentBundle, type Lifestyle, type Tier } from '../../content/schemas';
import { canStartDebtPlan, isIndependent, payDebt, spend, startDebtPlan } from '../finance';
import { buyHome, moveInCost, moveTo, purchaseQuote, refreshHousingCost, sellHome, supportingParent } from '../housing';
import { afterMove } from '../career';
import { canGig } from '../systems/career';
import { writeFromGroup } from '../systems/history';
import type { LifeState } from '../types';
import { CAREER_ACTION_IDS, CAREER_ACTIONS } from './career';
import { EDUCATION_ACTION_IDS, EDUCATION_ACTIONS } from './education';

export const MONEY_ACTION_IDS = ['set_lifestyle', 'start_gig', 'stop_gig', 'pay_debt', 'debt_plan'] as const;
export const HOME_ACTION_IDS = ['rent_home', 'move_home', 'relocate', 'buy_home', 'sell_home', 'find_roommate', 'live_alone'] as const;
export const LIFE_ACTION_IDS = [...MONEY_ACTION_IDS, ...HOME_ACTION_IDS, ...EDUCATION_ACTION_IDS, ...CAREER_ACTION_IDS] as const;
export type LifeActionId = (typeof LIFE_ACTION_IDS)[number];

/** Parameters, after validation. */
export interface LifeActionParams {
  lifestyle?: Lifestyle;
  debtId?: string;
  cityId?: string;
  /** School applications (Stage 7). */
  program?: ApplyProgram;
  tier?: Tier;
  majorId?: string;
  tradeId?: string;
  gradProgramId?: string;
  /** Job applications (Stage 8). */
  jobId?: string;
}

export interface LifeActionRule {
  /** Validates the parameters; null when they are wrong. */
  parse: (params: unknown, content: ContentBundle) => LifeActionParams | null;
  /** True when the action can be taken now. */
  allowed: (state: LifeState, params: LifeActionParams, content: ContentBundle) => boolean;
  apply: (state: LifeState, params: LifeActionParams, content: ContentBundle) => void;
}

export function isLifeActionId(value: unknown): value is LifeActionId {
  return typeof value === 'string' && (LIFE_ACTION_IDS as readonly string[]).includes(value);
}

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;

/** No parameters: nothing, or an empty object. */
const none = (params: unknown): LifeActionParams | null =>
  params === undefined || (typeof params === 'object' && params !== null && Object.keys(params).length === 0) ? {} : null;

function cityName(state: LifeState, content: ContentBundle, cityId = state.character.cityId): string {
  return content.cities[cityId]?.name ?? cityId;
}

function history(state: LifeState, content: ContentBundle, key: keyof ContentBundle['text']['history']['home'], values: Record<string, string>): void {
  writeFromGroup(state, content.text.history.home[key], ['home', key], { values }, content);
}

const independent = (state: LifeState, content: ContentBundle) => isIndependent(state, content);

export const LIFE_ACTIONS: Record<LifeActionId, LifeActionRule> = {
  set_lifestyle: {
    parse: (params) => {
      const lifestyle = field(params, 'lifestyle');
      return (LIFESTYLES as readonly unknown[]).includes(lifestyle) ? { lifestyle: lifestyle as Lifestyle } : null;
    },
    allowed: (state, p, content) => independent(state, content) && p.lifestyle !== state.finances.lifestyle,
    apply: (state, p) => {
      state.finances.lifestyle = p.lifestyle!;
    },
  },
  start_gig: {
    parse: none,
    allowed: (state, _p, content) => !state.career.gig && canGig(state, content),
    apply: (state, _p, content) => {
      state.career.gig = true;
      state.career.retired = false;
      writeFromGroup(state, content.text.history.money.startedGig, ['money', 'startedGig'], {}, content);
    },
  },
  stop_gig: {
    parse: none,
    allowed: (state) => state.career.gig,
    apply: (state) => {
      state.career.gig = false;
    },
  },
  pay_debt: {
    parse: (params) => {
      const debtId = field(params, 'debtId');
      return typeof debtId === 'string' && debtId.length > 0 ? { debtId } : null;
    },
    allowed: (state, p, content) =>
      independent(state, content) && state.finances.savings > 0 && state.finances.debts.some((d) => d.id === p.debtId),
    // As much as savings allow, up to the whole balance.
    apply: (state, p, content) => void payDebt(state, p.debtId!, state.finances.savings, content),
  },
  debt_plan: {
    parse: none,
    allowed: (state, _p, content) => canStartDebtPlan(state, content),
    apply: (state, _p, content) => startDebtPlan(state, content),
  },

  rent_home: {
    parse: none,
    allowed: (state, _p, content) =>
      independent(state, content) &&
      (state.housing.kind === 'with_parents' || state.housing.kind === 'homeless') &&
      state.finances.savings >= moveInCost(state, state.character.cityId, content),
    apply: (state, _p, content) => {
      const from = state.housing.kind;
      spend(state, moveInCost(state, state.character.cityId, content), content);
      moveTo(state, 'renting', state.character.cityId, content);
      if (from === 'with_parents') history(state, content, 'movedOut', { city: cityName(state, content) });
    },
  },
  move_home: {
    parse: none,
    allowed: (state, _p, content) =>
      independent(state, content) &&
      (state.housing.kind === 'renting' || state.housing.kind === 'homeless') &&
      supportingParent(state) !== null,
    // Your family helps you move; it costs you nothing.
    apply: (state, _p, content) => {
      const from = state.character.cityId;
      moveTo(state, 'with_parents', supportingParent(state)!.cityId, content);
      history(state, content, 'movedHome', { city: cityName(state, content) });
      afterMove(state, from, content);
    },
  },
  relocate: {
    parse: (params, content) => {
      const cityId = field(params, 'cityId');
      return typeof cityId === 'string' && content.cities[cityId] && !content.cities[cityId].retired ? { cityId } : null;
    },
    allowed: (state, p, content) =>
      independent(state, content) &&
      ['with_parents', 'renting', 'homeless'].includes(state.housing.kind) &&
      p.cityId !== state.character.cityId &&
      state.finances.savings >= moveInCost(state, p.cityId!, content),
    apply: (state, p, content) => {
      const from = cityName(state, content);
      spend(state, moveInCost(state, p.cityId!, content), content);
      const fromCity = state.character.cityId;
      moveTo(state, 'renting', p.cityId!, content);
      history(state, content, 'relocated', { city: cityName(state, content), from });
      afterMove(state, fromCity, content);
    },
  },
  buy_home: {
    parse: none,
    allowed: (state, _p, content) =>
      independent(state, content) &&
      state.housing.kind !== 'owned' &&
      state.housing.kind !== 'incarcerated' &&
      purchaseQuote(state, content).blocked === null,
    apply: (state, _p, content) => {
      buyHome(state, content);
      history(state, content, 'boughtHome', { city: cityName(state, content) });
    },
  },
  sell_home: {
    parse: none,
    allowed: (state) => state.housing.kind === 'owned',
    apply: (state, _p, content) => {
      sellHome(state, content);
      history(state, content, 'soldHome', { city: cityName(state, content) });
    },
  },
  find_roommate: {
    parse: none,
    allowed: (state) => state.housing.kind === 'renting' && state.housing.roommate !== true && state.housing.partnerId === undefined,
    apply: (state, _p, content) => {
      state.housing.roommate = true;
      refreshHousingCost(state, content);
    },
  },
  live_alone: {
    parse: none,
    allowed: (state) => state.housing.kind === 'renting' && state.housing.roommate === true,
    apply: (state, _p, content) => {
      delete state.housing.roommate;
      refreshHousingCost(state, content);
    },
  },
  ...EDUCATION_ACTIONS,
  ...CAREER_ACTIONS,
};

/** True when the action can be taken now with these (validated) parameters. */
export function isLifeActionAvailable(state: LifeState, actionId: LifeActionId, params: LifeActionParams, content: ContentBundle): boolean {
  return state.phase === 'yearStart' && LIFE_ACTIONS[actionId].allowed(state, params, content);
}
