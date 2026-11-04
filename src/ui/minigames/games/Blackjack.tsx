import { useMemo, useState } from 'react';
import { content } from '../../../content';
import { progressOf, sessionAccuracy, valueOf, type HandResult } from '../../../engine/minigames/blackjack';
import { Button } from '../../components/Button';
import { MINIGAME_LABELS } from '../../labels';
import type { GameProps } from '../types';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];

function Card({ rank, index }: { rank: number; index: number }) {
  const suit = SUITS[(rank + index) % 4]!;
  const red = suit === '♥' || suit === '♦';
  return (
    <span className={`flex h-16 w-11 flex-col items-center justify-center rounded-lg border border-border bg-text text-base font-bold ${red ? 'text-negative' : 'text-bg'}`} data-testid="bj-card" aria-label={`${RANKS[rank - 1]} of ${suit}`}>
      <span>{RANKS[rank - 1]}</span>
      <span aria-hidden="true">{suit}</span>
    </span>
  );
}

function Cards({ cards }: { cards: readonly number[] }) {
  return (
    <span className="flex gap-1.5">
      {cards.map((c, i) => (
        <Card key={i} rank={c} index={i} />
      ))}
    </span>
  );
}

/** Blackjack: hit or stand against the house, for a few hands. The deck comes from a seed that the input log keeps with your moves, so the visit can be played again exactly. */
export default function Blackjack({ onDone }: GameProps) {
  const L = MINIGAME_LABELS.blackjack;
  const hands = content.balance.minigames.games.blackjack.params.hands!;
  // The seed is the screen's own: the engine replays the visit from it and the moves.
  const [seed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0]! % 2 ** 31);
  const [moves, setMoves] = useState<number[]>([]);
  const progress = useMemo(() => progressOf(seed, hands, moves), [seed, hands, moves]);
  const finished = progress.status === 'done' ? progress.session.hands : progress.finished;

  return (
    <div className="flex flex-col gap-3" data-testid="blackjack">
      {progress.status === 'need' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-bar-track p-3">
          <span className="text-sm font-semibold">{L.hand(progress.hand + 1, hands)}</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">{L.dealer}</span>
            <Cards cards={[progress.up]} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">
              {L.you} <span className="font-bold tabular-nums" data-testid="bj-total">{valueOf(progress.player.cards).total}</span>
            </span>
            <Cards cards={progress.player.cards} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" data-testid="bj-hit" onClick={() => setMoves((m) => [...m, 1])}>
              {L.hit}
            </Button>
            <Button size="lg" variant="secondary" data-testid="bj-stand" onClick={() => setMoves((m) => [...m, 0])}>
              {L.stand}
            </Button>
          </div>
        </div>
      )}
      {finished.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Hands played">
          {finished.map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2" data-testid="bj-hand">
              <span className="text-sm font-semibold">{L.hand(i + 1, hands)}</span>
              <Cards cards={h.player} />
              <span className="text-sm font-bold">{L.results[h.result as HandResult]}</span>
            </li>
          ))}
        </ul>
      )}
      {progress.status === 'done' && (
        <>
          <p className="text-sm font-semibold" data-testid="bj-returned">
            {L.returned(Math.round(progress.session.returned * 100))}
          </p>
          <Button size="lg" block data-testid="bj-collect" onClick={() => onDone({ accuracy: sessionAccuracy(progress.session), detail: [seed, ...progress.session.moves] })}>
            {L.collect}
          </Button>
        </>
      )}
    </div>
  );
}
