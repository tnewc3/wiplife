/**
 * The sports effects events can have (E6c): form and rating, the result of a
 * playoff series, signing the draft's deal or turning it down, extending or
 * playing out a contract, a trade, resting or playing through an injury, a
 * suspension, retiring by a route and moving to another position. The engine
 * ignores what doesn't fit (no career, no deal on offer) and never breaks a
 * rule: nothing here involves anyone under 18 in a pro deal.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { declineDraft, extend, signCampDeal, signDraftDeal, tradePlayer } from './contract';
import { easeInjury, treatInjury } from './injury';
import { applySeries } from './playoffs';
import { inSports, mySport, positionOf, thisSeason } from './query';
import { retireSports, takeRoute } from './retire';
import { acceptOffer, declineOffers } from './scholarship';
import { anotherTeam } from './team';
import { campOpen, resolveTryout } from './tryout';
import { sportsHistory } from './text';

type SportsEffect = Extract<Effect, { type: 'sports' }>;

/** Changes position (a pro keeps their craft less a little; the move is your choice). */
export function movePosition(state: LifeState, positionId: Id, content: ContentBundle): boolean {
  const def = mySport(state, content);
  const path = def ? state.fame.paths[def.id] : undefined;
  if (!def || !path || state.sports.position === positionId || !positionOf(def.sport, positionId)) return false;
  state.sports.position = positionId;
  path.craft = clampInt(path.craft - content.balance.sports.performance.switchCraft, 0, 100);
  return true;
}

/** A camp, an open tryout or a call signs you with a team that has room (a player the draft passed by, or a pro without a deal). */
export function campSign(state: LifeState, content: ContentBundle, rng: RngState): boolean {
  const def = mySport(state, content);
  if (!def || !campOpen(state, def, content)) return false;
  return signCampDeal(state, anotherTeam(def.sport, null, state.character.cityId, content, rng).id, content, rng);
}

export function applySportsEffect(state: LifeState, effect: SportsEffect, _cast: Record<string, Id>, content: ContentBundle, rng: RngState, eventId?: string): void {
  // A tryout is also the way into a sport: it needs no career yet.
  if (effect.action === 'tryout') {
    resolveTryout(state, effect.approach!, content, rng);
    return;
  }
  const justEnded = state.sports.retired?.year === state.currentYear && state.sports.retired.route === null;
  if (!inSports(state, content) && !(effect.action === 'retire' && justEnded)) return;
  const s = state.sports;
  const def = mySport(state, content);
  if (!def) return;
  const delta = effect.delta ?? 0;
  switch (effect.action) {
    case 'form':
      s.form = clampInt(s.form + delta, -10, 10);
      return;
    case 'rating': {
      const season = thisSeason(state);
      if (season) season.rating = clampInt(season.rating + delta, 0, 100);
      return;
    }
    case 'series':
      applySeries(state, effect.result!, content, rng, eventId);
      return;
    case 'sign':
      signDraftDeal(state, content, rng, effect.kind);
      return;
    case 'decline':
      declineDraft(state);
      return;
    case 'extend':
      extend(state, effect.terms!, content, rng);
      return;
    case 'playout':
      s.playOut = true;
      return;
    case 'trade':
      if (s.contract && tradePlayer(state, content, rng)) s.ask = null;
      return;
    case 'ask':
      s.ask = effect.what === 'trade' ? 'trade' : 'contract';
      return;
    case 'refuse':
      s.ask = null;
      return;
    case 'injury':
      if (effect.what === 'pain') {
        s.pain = true;
      } else {
        s.pain = false;
        s.rest = true;
        treatInjury(state, def.sport, content);
        easeInjury(state, def.sport, effect.what === 'surgery' ? 25 : 10, content);
      }
      return;
    case 'suspend':
      s.suspended = state.currentYear + 1;
      s.totals.suspensions += 1;
      return;
    case 'retire':
      if (s.retired && s.retired.year === state.currentYear && s.retired.route === null) takeRoute(state, effect.route!, content);
      else retireSports(state, effect.route!, 'retired', content, rng);
      return;
    case 'position':
      movePosition(state, effect.position!, content);
      return;
    case 'role': {
      const order = ['reserve', 'rotation', 'starter'] as const;
      s.role = order[clampInt(order.indexOf(s.role) + Math.sign(delta), 0, 2)]!;
      return;
    }
    case 'number':
      s.number = effect.value!;
      return;
    case 'captain':
      if (effect.on && !s.captain && s.team) {
        s.captain = true;
        sportsHistory(state, 'captain', content);
      } else if (!effect.on) {
        s.captain = false;
      }
      return;
    case 'scholarship':
      if (effect.tier) acceptOffer(state, effect.tier, content);
      else declineOffers(state);
      return;
    case 'combine':
      s.combine = clampInt(s.combine + delta, -30, 30);
      return;
    case 'camp':
      campSign(state, content, rng);
      return;
  }
}

