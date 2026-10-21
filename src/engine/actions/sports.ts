/**
 * Sports actions (E6c, the Sports screen): move to another position, set the
 * year's training focus, ask your agent for a trade or a new deal, and leave
 * your sport by a route. Starting a career and crossing over reuse the Fame
 * actions (a sport is a fame path). Each takes effect at once, between years;
 * the common checks (between years, input validation, the input log) live in
 * ./index.ts.
 */
import { SPORT_FOCUSES, SPORT_RETIRE_ROUTES, TIERS, TRAINING_MODES, type SportFocus, type SportRetireRoute, type Tier, type TrainingMode } from '../../content/schemas';
import { leaveSchoolTeam } from '../teen/activities';
import { movePosition } from '../sports/effects';
import { inSports, mySport, sportPath } from '../sports/query';
import { retireSports, routeBlock } from '../sports/retire';
import { acceptBlock, acceptOffer, declineOffers, endScholarship } from '../sports/scholarship';
import { optionFor, resolveTryout, startTryout, tryoutBlock } from '../sports/tryout';
import { trainBlock, train } from '../sports/training';
import type { LifeState } from '../types';
import type { LifeActionRule } from './life';
import { fittingResults, queueResult } from './result';

export const SPORTS_ACTION_IDS = ['set_position', 'set_focus', 'ask_trade', 'ask_contract', 'cancel_ask', 'retire_sports', 'try_out', 'train', 'accept_scholarship', 'decline_scholarship', 'leave_team', 'leave_club'] as const;
export type SportsActionId = (typeof SPORTS_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const inSportsState = (state: LifeState): boolean => state.sports.sport !== null && state.fame.active;
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
  // Batch 5: you choose a team to try out for; the scrimmage is an event whose choice is how you play it.
  try_out: {
    parse: (params) => {
      const pathId = field(params, 'pathId');
      const teamKey = field(params, 'teamKey');
      return only(params, ['pathId', 'teamKey']) && typeof pathId === 'string' && typeof teamKey === 'string' && teamKey.length > 0 && teamKey.length <= 60 ? { pathId, teamKey } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && p.teamKey !== undefined && tryoutBlock(state, p.pathId, p.teamKey, content) === null,
    apply: (state, p, content) => {
      if (!startTryout(state, p.pathId!, p.teamKey!, content)) return;
      const level = optionFor(state, sportPath(content, p.pathId!)!, p.teamKey!, content)?.level ?? 'youth';
      const options = fittingResults(state, content.registries.sports.tryouts[level], {}, content);
      // No scrimmage to play: the day goes as a steady one.
      if (options.length === 0) resolveTryout(state, 'steady', content, state.rng);
      else queueResult(state, options, {});
    },
  },
  train: {
    parse: (params) => {
      const skillId = field(params, 'skillId');
      const trainMode = field(params, 'trainMode');
      return only(params, ['skillId', 'trainMode']) && typeof skillId === 'string' && skillId.length > 0 && skillId.length <= 40 && typeof trainMode === 'string' && (TRAINING_MODES as readonly string[]).includes(trainMode)
        ? { skillId, trainMode: trainMode as TrainingMode }
        : null;
    },
    allowed: (state, p, content) => p.skillId !== undefined && p.trainMode !== undefined && trainBlock(state, p.skillId, p.trainMode, content) === null,
    apply: (state, p, content) => void train(state, p.skillId!, p.trainMode!, content),
  },
  accept_scholarship: {
    parse: (params) => {
      const tier = field(params, 'tier');
      return only(params, ['tier']) && typeof tier === 'string' && (TIERS as readonly string[]).includes(tier) ? { tier: tier as Tier } : null;
    },
    allowed: (state, p) => inSportsState(state) && p.tier !== undefined && acceptBlock(state, p.tier) === null,
    apply: (state, p, content) => void acceptOffer(state, p.tier!, content),
  },
  decline_scholarship: {
    parse: none,
    allowed: (state) => state.sports.offers.length > 0,
    apply: (state) => declineOffers(state),
  },
  leave_team: {
    parse: none,
    allowed: (state, _p, content) => inSports(state, content) && !state.sports.pro && state.sports.team !== null,
    apply: (state, _p, content) => {
      const def = mySport(state, content)!;
      state.sports.team = null;
      state.sports.teamless = true;
      leaveSchoolTeam(state, def.id, content);
      endScholarship(state, content);
    },
  },
  leave_club: {
    parse: none,
    allowed: (state) => state.sports.club !== null,
    apply: (state) => {
      state.sports.club = null;
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
