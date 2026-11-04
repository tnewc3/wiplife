/**
 * G1 mini-games: settling a play. Every mini-game starts from a choice or an activity that already has odds; this turns
 * what the player did (a play record), or Auto's draw from their stats, into a performance. The life's generator is
 * always advanced the same way (Auto's draw is made whether or not a played result replaces it), so a replay of the input
 * log, which holds the record, stays in step with the life that made it. See ./odds.ts for the model.
 */
import type { ChoiceDef, ContentBundle, MiniGameId } from '../../content/schemas';
import { evaluate } from '../conditions';
import type { Id, LifeState } from '../types';
import { autoAccuracy, performanceOf, skillOf, type Performance, type PlayRecord } from './odds';

/** The mini-game a choice is played as now, or null: the first of its options whose condition holds. */
export function choiceGame(state: LifeState, choice: ChoiceDef | undefined, cast: Record<string, Id>, content: ContentBundle): MiniGameId | null {
  if (!choice?.check || !choice.minigame) return null;
  for (const option of choice.minigame) if (evaluate(option.when, state, { cast, roles: 'strict', content })) return option.game;
  return null;
}

export interface Settled {
  record: PlayRecord;
  performance: Performance;
}

/** The result of a play: the record that was given (a played game or an earlier Auto, as the log kept it), or Auto's own draw from your skill. Advances the life's generator by Auto's draw either way. The caller has checked the record is for this game. */
export function settlePlay(state: LifeState, game: MiniGameId, play: PlayRecord | undefined, content: ContentBundle): Settled {
  const drawn = autoAccuracy(state.rng, skillOf(state, game, content), content);
  const record: PlayRecord = play ?? { game, auto: true, accuracy: drawn };
  return { record, performance: performanceOf(record.accuracy, content) };
}
