/**
 * G1 mini-games in activities: the casino (blackjack, slots) and crime (lockpick) options of the Activities tab. The
 * activity's own odds are the ones the mini-game moves, through the shared model in ./odds.ts.
 */
import type { ContentBundle, OutcomeTier, PastimeDef } from '../../content/schemas';
import type { RngState } from '../rng';
import type { LifeState } from '../types';
import { autoSession, replaySession, sessionAccuracy, sessionTier, type Session } from './blackjack';
import { parsePlay, skillOf, type PlayRecord, type Performance, performanceOf } from './odds';
import { settlePlay } from './play';

/** Is this play fit for the activity? None is always fine (Auto plays); a played game must be its game, and a hand must be one the cards and moves allow. */
export function playFits(def: PastimeDef, play: PlayRecord | undefined, content: ContentBundle): boolean {
  if (play === undefined) return true;
  if (def.minigame === undefined || play.game !== def.minigame || parsePlay(play) === null) return false;
  if (play.game !== 'blackjack') return true;
  if (play.auto || play.detail === undefined || play.detail.length < 1) return true;
  const [seed, ...moves] = play.detail as [number, ...number[]];
  const session = replaySession(seed, content.balance.minigames.games.blackjack.params.hands!, moves);
  return session !== null && sessionAccuracy(session) === play.accuracy;
}

export interface Visit {
  record: PlayRecord;
  session: Session;
  tier: OutcomeTier;
}

/** A visit to the blackjack table: a played one is checked against its seed and moves; Auto's is drawn from your skill. Always advances the generator by Auto's draw, so a replay stays in step. */
export function blackjackVisit(state: LifeState, play: PlayRecord | undefined, content: ContentBundle): Visit {
  const rng: RngState = state.rng;
  const auto = autoSession(rng, skillOf(state, 'blackjack', content), content);
  if (play !== undefined && !play.auto && play.detail !== undefined) {
    const [seed, ...moves] = play.detail as [number, ...number[]];
    const session = replaySession(seed, content.balance.minigames.games.blackjack.params.hands!, moves) ?? auto.session;
    return { record: play, session, tier: sessionTier(session.returned, content) };
  }
  const record: PlayRecord = { game: 'blackjack', auto: true, accuracy: sessionAccuracy(auto.session), detail: [auto.seed, ...auto.session.moves] };
  return { record, session: auto.session, tier: sessionTier(auto.session.returned, content) };
}

/** The performance of a mini-game played for a roll activity: how well you played (or Auto's draw) tilts the activity's tier weights. */
export function activityPerformance(state: LifeState, def: PastimeDef, play: PlayRecord | undefined, content: ContentBundle): { record: PlayRecord; performance: Performance } | null {
  if (def.minigame === undefined || def.minigame === 'blackjack') return null;
  const s = settlePlay(state, def.minigame, play, content);
  return { record: s.record, performance: s.performance };
}

export { performanceOf };
