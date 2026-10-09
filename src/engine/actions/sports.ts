/**
 * Sports actions (E6c, the Sports screen): move to another position, set the
 * year's training focus, ask your agent for a trade or a new deal, and leave
 * your sport by a route. Starting a career and crossing over reuse the Fame
 * actions (a sport is a fame path). Each takes effect at once, between years;
 * the common checks (between years, input validation, the input log) live in
 * ./index.ts.
 */
import { SPORT_FOCUSES, SPORT_RETIRE_ROUTES, type SportFocus, type SportRetireRoute } from '../../content/schemas';
import { movePosition } from '../sports/effects';
import { inSports, mySport } from '../sports/query';
import { retireSports, routeBlock } from '../sports/retire';
import type { LifeActionRule } from './life';

export const SPORTS_ACTION_IDS = ['set_position', 'set_focus', 'ask_trade', 'ask_contract', 'cancel_ask', 'retire_sports'] as const;
export type SportsActionId = (typeof SPORTS_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const none = (params: unknown) => (params === undefined || only(params, []) ? {} : null);

export const SPORTS_ACTIONS: Record<SportsActionId, LifeActionRule> = {
  set_position: {
    parse: (params) => {
      const positionId = field(params, 'positionId');
      return only(params, ['positionId']) && typeof positionId === 'string' && positionId.length > 0 && positionId.length <= 60 ? { positionId } : null;
    },
    allowed: (state, p, content) => {
      const def = inSports(state, content) ? mySport(state, content) : undefined;
      return def !== undefined && p.positionId !== undefined && p.positionId !== state.sports.position && def.sport.positions.some((x) => x.id === p.positionId);
    },
    apply: (state, p, content) => void movePosition(state, p.positionId!, content),
  },
  set_focus: {
    parse: (params) => {
      const sportFocus = field(params, 'sportFocus');
      return only(params, ['sportFocus']) && typeof sportFocus === 'string' && (SPORT_FOCUSES as readonly string[]).includes(sportFocus) ? { sportFocus: sportFocus as SportFocus } : null;
    },
    allowed: (state, p, content) => inSports(state, content) && p.sportFocus !== undefined && p.sportFocus !== state.sports.focus,
    apply: (state, p) => {
      state.sports.focus = p.sportFocus!;
    },
  },
  ask_trade: {
    parse: none,
    allowed: (state, _p, content) => inSports(state, content) && state.sports.pro && state.sports.contract !== null && state.fame.agent !== null && state.sports.ask === null,
    apply: (state) => {
      state.sports.ask = 'trade';
    },
  },
  ask_contract: {
    parse: none,
    allowed: (state, _p, content) => inSports(state, content) && state.sports.pro && state.sports.contract !== null && state.fame.agent !== null && state.sports.ask === null,
    apply: (state) => {
      state.sports.ask = 'contract';
    },
  },
  cancel_ask: {
    parse: none,
    allowed: (state) => state.sports.ask !== null,
    apply: (state) => {
      state.sports.ask = null;
    },
  },
  retire_sports: {
    parse: (params) => {
      const routeKey = field(params, 'routeKey');
      return only(params, ['routeKey']) && typeof routeKey === 'string' && (SPORT_RETIRE_ROUTES as readonly string[]).includes(routeKey) ? { routeKey: routeKey as SportRetireRoute } : null;
    },
    allowed: (state, p, content) => inSports(state, content) && p.routeKey !== undefined && routeBlock(state, p.routeKey, content) === null,
    apply: (state, p, content) => void retireSports(state, p.routeKey!, 'retired', content, state.rng),
  },
};
