/**
 * Love actions (B1): "Find a date", a life action for single adults. Three
 * ways (a dating app, a set-up by a friend, a night out) each have a chance of
 * bringing someone new, which falls with every try in the same year. A try
 * that does bring someone casts them through the existing romantic casting
 * (a potential partner who is attracted to you, an adult, in your city) and
 * answers with an event; one that doesn't answers with a quiet one. Money
 * goes through the finance module and shows on the result.
 */
import { FIND_DATE_WAYS, type ContentBundle, type FindDateWay } from '../../content/schemas';
import { evaluate } from '../conditions';
import { castEvent, castCandidates, uncast } from '../events/casting';
import { scaledAmount } from '../country';
import { spend } from '../finance';
import { consistencyProblems } from '../presence';
import { currentPartner, romanceAllowed } from '../relationships';
import { chance, pick } from '../rng';
import type { LifeState } from '../types';
import type { LifeActionRule } from './life';
import { queueResult } from './result';

export const LOVE_ACTION_IDS = ['find_date'] as const;
export type LoveActionId = (typeof LOVE_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));

/** How many times "Find a date" is in this year's input log. */
export function findDateTries(state: LifeState): number {
  return state.inputLog.filter((e) => e.year === state.currentYear && e.kind === 'action' && (e.payload as { actionId?: unknown }).actionId === 'find_date').length;
}

/** The chance the next try by this way brings someone new, after the tries already made this year. */
export function findDateChance(way: FindDateWay, tries: number, content: ContentBundle): number {
  const b = content.balance.relationships.findDate;
  return b[way].chance * b.repeatFactor ** tries;
}

/** What a try by this way costs you now. */
export function findDateCost(state: LifeState, way: FindDateWay, content: ContentBundle): number {
  return scaledAmount(state, content.balance.relationships.findDate[way].cost, content);
}

/** True when you have a friend (an adult in your city) who could set you up. */
export function hasSetUpFriend(state: LifeState, content: ContentBundle): boolean {
  return castCandidates(state, { kind: 'friend', age: { min: content.balance.relationships.adultAge, max: 120 }, presence: 'city' }, content).length > 0;
}

/** Why you can't find a date by this way now, or null. */
export function findDateBlock(state: LifeState, way: FindDateWay, tries: number, content: ContentBundle): string | null {
  const { adultAge } = content.balance.relationships;
  if (state.character.age < adultAge) return `Dating starts at ${adultAge}.`;
  if (currentPartner(state) !== null) return 'You are already seeing someone.';
  if (state.character.identity.attractedTo.length === 0) return 'You are not attracted to anyone.';
  if (tries >= content.balance.relationships.findDate.yearlyMax) return 'You have tried enough this year.';
  if (way === 'friend' && !hasSetUpFriend(state, content)) return 'You need a friend nearby who could set you up.';
  if (state.finances.savings < findDateCost(state, way, content)) return 'You can’t afford that.';
  return null;
}

export const LOVE_ACTIONS: Record<LoveActionId, LifeActionRule> = {
  find_date: {
    parse: (params) => {
      const way = field(params, 'dateWay');
      return only(params, ['dateWay']) && typeof way === 'string' && (FIND_DATE_WAYS as readonly string[]).includes(way) ? { dateWay: way as FindDateWay } : null;
    },
    allowed: (state, p, content) => p.dateWay !== undefined && findDateBlock(state, p.dateWay, findDateTries(state), content) === null,
    apply: (state, p, content) => {
      const way = p.dateWay!;
      // The try is already in the input log: the ones before it set the odds.
      const before = findDateTries(state) - 1;
      const cost = findDateCost(state, way, content);
      const savings = state.finances.savings;
      const debt = state.finances.debts.reduce((sum, d) => sum + d.balance, 0);
      spend(state, cost, content);
      const registry = content.registries.love.findDate;
      let queued = false;
      if (chance(state.rng, findDateChance(way, before, content))) {
        const options = registry[way].map((id) => content.events[id]).filter((d) => d !== undefined && !d.retired);
        if (options.length > 0) {
          const def = pick(state.rng, options)!;
          const cast = castEvent(state, def, state.rng, content);
          if (cast && evaluate(def.requires, state, { cast: cast.cast, roles: 'strict', content }) && romanceAllowed(state, def, cast.cast, content) && consistencyProblems(state, def, cast.cast, content).length === 0) {
            queueResult(state, [[def, 1]], cast.cast);
            queued = true;
          } else if (cast) {
            uncast(state, cast.created);
          }
        }
      }
      if (!queued) {
        const nobody = registry.nobody.map((id) => content.events[id]).filter((d) => d !== undefined && !d.retired);
        queueResult(state, nobody.map((d) => [d!, d!.weight.base] as const), {});
      }
      const debtNow = state.finances.debts.reduce((sum, d) => sum + d.balance, 0);
      if (cost > 0) state.pending[0]!.money = { change: state.finances.savings - savings, balance: state.finances.savings, debtChange: debtNow - debt };
    },
  },
};

export interface FindDateOptionView {
  way: FindDateWay;
  /** What it costs now (0 when free), already scaled by where you live. */
  cost: number;
  /** Why it can't be done now, or null. */
  block: string | null;
}

export interface FindDateView {
  /** Show the card at all: an adult with no partner who is attracted to someone. */
  shown: boolean;
  /** Tries this year, and the most there can be. */
  tries: number;
  max: number;
  options: FindDateOption[];
}
type FindDateOption = FindDateOptionView;

/** What the "Find a date" card shows (B1). */
export function getFindDateView(state: LifeState, content: ContentBundle): FindDateView {
  const { adultAge } = content.balance.relationships;
  const tries = findDateTries(state);
  const shown = state.phase === 'yearStart' && state.character.age >= adultAge && currentPartner(state) === null && state.character.identity.attractedTo.length > 0;
  return {
    shown,
    tries,
    max: content.balance.relationships.findDate.yearlyMax,
    options: FIND_DATE_WAYS.map((way) => ({ way, cost: findDateCost(state, way, content), block: findDateBlock(state, way, tries, content) })),
  };
}
