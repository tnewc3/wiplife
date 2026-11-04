import type { Difficulty } from '../../engine/minigames/odds';

/** What a game hands back when it ends: an accuracy from 0 to 100, and its own record (taps, cards) for the input log. */
export interface GameResult {
  accuracy: number;
  detail?: number[];
}

/** What the host gives every game. `slow` is reduced motion (or a player who asked): games run slower and skip flourishes. */
export interface GameProps {
  difficulty: Difficulty;
  slow: boolean;
  /** Called once when the game ends; the host shows the result and hands it on. */
  onDone: (result: GameResult) => void;
}
