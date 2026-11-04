/**
 * G1 blackjack: the rules of a visit to the table, shared by Auto and a played game. Cards come from a stream seeded by
 * a number (an infinite deck: every rank is as likely each draw), so a hand can always be played again from its seed and
 * the moves made (1 hit, 0 stand), which is how the input log keeps it and how a replay reproduces it. The dealer stands
 * on every 17; a natural pays 3 to 2; there are no splits or doubles. Pure: no randomness but the seed.
 */
import type { ContentBundle } from '../../content/schemas';
import { createRng, nextInt, type RngState } from '../rng';

export interface HandView {
  /** Card ranks, 1 (ace) to 13 (king). */
  cards: number[];
  total: number;
  soft: boolean;
}

const cardValue = (rank: number): number => (rank === 1 ? 11 : Math.min(10, rank));

export function valueOf(cards: readonly number[]): HandView {
  let total = cards.reduce((s, c) => s + cardValue(c), 0);
  let aces = cards.filter((c) => c === 1).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { cards: [...cards], total, soft: aces > 0 };
}

const isNatural = (cards: readonly number[]): boolean => cards.length === 2 && valueOf(cards).total === 21;

/** What the book says to do with this hand against the dealer's up card: true to hit. */
export function bookHit(player: HandView, up: number): boolean {
  const u = cardValue(up);
  if (player.soft) return player.total <= 17 || (player.total === 18 && u >= 9);
  if (player.total <= 11) return true;
  if (player.total === 12) return u < 4 || u > 6;
  return player.total <= 16 && u >= 7;
}

export type HandResult = 'natural' | 'win' | 'push' | 'lose' | 'bust' | 'dealer_natural';

/** What a hand returns per unit staked. */
export const HAND_RETURN: Record<HandResult, number> = { natural: 2.5, win: 2, push: 1, lose: 0, bust: 0, dealer_natural: 0 };

export interface PlayedHand {
  player: number[];
  dealer: number[];
  result: HandResult;
}

/** A deck stream for a seed: the next rank, 1 to 13. */
export function deckFor(seed: number): () => number {
  const rng: RngState = createRng(`blackjack:${seed}`);
  return () => nextInt(rng, 1, 13);
}

/** Decides each hit or stand: `hand` is the hand being played (from 0), `view` your cards, `up` the dealer's up card. */
export type Decide = (view: HandView, up: number, hand: number) => boolean;

export interface Session {
  hands: PlayedHand[];
  /** The hit (1) and stand (0) decisions in the order they were asked. */
  moves: number[];
  /** Decisions that matched the book, and how many were asked. */
  book: number;
  asked: number;
  /** The share of the stake the visit returns: the average return of the hands. */
  returned: number;
}

/** Where a visit stands: waiting for a decision on a hand (what to draw), or finished. */
export type Progress =
  | { status: 'need'; hand: number; player: HandView; up: number; finished: PlayedHand[] }
  | { status: 'done'; session: Session };

/** Plays hands from a seed, asking `decide` whenever a hand needs a decision; `decide` answers null to stop and wait for the player. */
function run(seed: number, count: number, decide: (view: HandView, up: number, hand: number) => boolean | null): Progress {
  const next = deckFor(seed);
  const hands: PlayedHand[] = [];
  const moves: number[] = [];
  let book = 0;
  let asked = 0;
  for (let h = 0; h < count; h++) {
    const player = [next(), next()];
    const dealer = [next(), next()];
    const up = dealer[0]!;
    let result: HandResult;
    if (isNatural(player) || isNatural(dealer)) {
      result = isNatural(player) ? (isNatural(dealer) ? 'push' : 'natural') : 'dealer_natural';
    } else {
      for (;;) {
        const view = valueOf(player);
        if (view.total >= 21) break;
        const hit = decide(view, up, h);
        if (hit === null) return { status: 'need', hand: h, player: view, up, finished: hands };
        asked += 1;
        if (hit === bookHit(view, up)) book += 1;
        moves.push(hit ? 1 : 0);
        if (!hit) break;
        player.push(next());
      }
      if (valueOf(player).total > 21) result = 'bust';
      else {
        while (valueOf(dealer).total < 17) dealer.push(next());
        const p = valueOf(player).total;
        const d = valueOf(dealer).total;
        result = d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose';
      }
    }
    hands.push({ player: [...player], dealer: [...dealer], result });
  }
  const returned = hands.reduce((s, x) => s + HAND_RETURN[x.result], 0) / count;
  return { status: 'done', session: { hands, moves, book, asked, returned } };
}

/** Plays a visit of `count` hands from a seed, asking `decide` whenever a hand needs a decision. */
export function playSession(seed: number, count: number, decide: Decide): Session {
  const r = run(seed, count, decide);
  if (r.status !== 'done') throw new Error('A visit that waits was played to the end.');
  return r.session;
}

/** For the screen: the visit so far after these moves (what to draw and whether a decision is needed). */
export function progressOf(seed: number, count: number, moves: readonly number[]): Progress {
  let i = 0;
  return run(seed, count, () => {
    const m = moves[i++];
    return m === undefined ? null : m === 1;
  });
}

/** Plays a visit from a seed and the moves a player made. Null when the moves do not fit the hands (too few, or some left over). */
export function replaySession(seed: number, count: number, moves: readonly number[]): Session | null {
  let i = 0;
  let short = false;
  const session = playSession(seed, count, () => {
    const m = moves[i++];
    if (m === undefined) short = true;
    return m === 1;
  });
  return short || i !== moves.length || moves.some((m) => m !== 0 && m !== 1) ? null : session;
}

/** The accuracy of a visit: the share of decisions that matched the book (100 when none were asked). */
export const sessionAccuracy = (s: Session): number => (s.asked === 0 ? 100 : Math.round((100 * s.book) / s.asked));

/** How a visit turns into a tier of the activity: by the share of the stake it returned. */
export function sessionTier(returned: number, content: ContentBundle): 'great' | 'good' | 'neutral' | 'bad' | 'backfire' {
  const p = content.balance.minigames.games.blackjack.params;
  const pct = returned * 100;
  if (pct >= p.great!) return 'great';
  if (pct >= p.good!) return 'good';
  if (pct >= p.bad!) return 'neutral';
  return returned === 0 ? 'backfire' : 'bad';
}

/** Auto at the table: the book, with a chance of going against it that falls with skill. */
export function autoDecider(rng: RngState, skill: number, content: ContentBundle): Decide {
  const p = content.balance.minigames.games.blackjack.params;
  const mistake = (p.mistakeWeak! + (p.mistakeStrong! - p.mistakeWeak!) * (skill / 100)) / 100;
  return (view, up) => {
    const right = bookHit(view, up);
    return nextInt(rng, 0, 9999) < mistake * 10000 ? !right : right;
  };
}

/** Auto's whole visit: a seed from the life's generator, then its decisions. */
export function autoSession(rng: RngState, skill: number, content: ContentBundle): { seed: number; session: Session } {
  const seed = nextInt(rng, 0, 2 ** 31 - 1);
  const count = content.balance.minigames.games.blackjack.params.hands!;
  return { seed, session: playSession(seed, count, autoDecider(rng, skill, content)) };
}
