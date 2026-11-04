import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { content } from '../../content';
import type { MiniGameId } from '../../content/schemas';
import { difficultyOf, performanceOf, skillOf, type PlayRecord } from '../../engine/minigames/odds';
import { useAppStore } from '../../store/appStore';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { StatBar } from '../components/StatBar';
import { MINIGAME_LABELS } from '../labels';
import type { GameProps, GameResult } from './types';
import { useReducedMotion } from './useReducedMotion';

/** Each game is its own chunk, fetched when it is first played (the first load never carries them). */
const GAMES: Record<MiniGameId, ComponentType<GameProps>> = {
  last_shot: lazy(() => import('./games/LastShot')),
  penalty_kick: lazy(() => import('./games/PenaltyKick')),
  swing: lazy(() => import('./games/Swing')),
  lockpick: lazy(() => import('./games/Lockpick')),
  getaway: lazy(() => import('./games/Getaway')),
  blackjack: lazy(() => import('./games/Blackjack')),
  slots: lazy(() => import('./games/Slots')),
};

/**
 * G1: the sheet a mini-game is played in. It sizes the game from your stats (a strong shooter gets a bigger, slower zone),
 * offers Auto at every moment (and first when motion is reduced), shows how you did, and hands the result to the event
 * choice or activity it was for. Without a result, Auto plays from your stats.
 */
export function MiniGameHost() {
  const request = useAppStore((s) => s.miniGame);
  const life = useAppStore((s) => s.life);
  if (!request || !life) return null;
  return <Sheet key={`${request.game}:${request.source.kind}`} game={request.game} />;
}

function Sheet({ game }: { game: MiniGameId }) {
  const life = useAppStore((s) => s.life)!;
  const finish = useAppStore((s) => s.finishMiniGame);
  const cancel = useAppStore((s) => s.closeMiniGame);
  const busy = useAppStore((s) => s.aging);
  const reduced = useReducedMotion();
  const skill = useMemo(() => skillOf(life, game, content), [life, game]);
  const difficulty = useMemo(() => difficultyOf(skill, game, content, reduced), [skill, game, reduced]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [idle, setIdle] = useState(false);
  const Game = GAMES[game];
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus moves into the game when it opens, for screen readers and keyboards.
  useEffect(() => heading.current?.focus(), []);

  // After a while without a tap, say Auto can play it.
  useEffect(() => {
    if (result) return;
    const t = window.setTimeout(() => setIdle(true), content.balance.minigames.idleMs);
    return () => window.clearTimeout(t);
  }, [result]);

  const record = (r: GameResult): PlayRecord => ({ game, auto: false, accuracy: r.accuracy, ...(r.detail ? { detail: r.detail } : {}) });
  const performance = result ? performanceOf(result.accuracy, content) : null;
  const L = MINIGAME_LABELS;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim" role="dialog" aria-modal="true" aria-labelledby="minigame-title" data-testid="minigame">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-xl">
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <Icon id={L.icons[game]} size={40} />
            <h2 id="minigame-title" ref={heading} tabIndex={-1} className="font-display text-xl font-semibold outline-none">
              {L.titles[game]}
            </h2>
          </div>
          <p className="text-sm text-muted" data-testid="minigame-how">
            {L.how[game]}
          </p>
          {game !== 'blackjack' && <StatBar label={L.skill} value={skill} kind="stat" layout="row" />}
          {reduced && !result && <p className="text-sm text-muted">{L.autoSuggested}</p>}
          {/* The game stays in view when it ends (the keeper, the hands), with how it went below it. */}
          <Suspense fallback={<p className="py-8 text-center text-muted">{L.loading}</p>}>
            <Game difficulty={difficulty} slow={reduced} onDone={(r) => setResult((was) => was ?? r)} />
          </Suspense>
          {result && (
            <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-2 p-4" role="status" data-testid="minigame-result" data-performance={performance}>
              <span className="font-display text-2xl font-semibold">{L.results[performance!]}</span>
              <span className="text-sm font-semibold tabular-nums">{L.accuracy(result.accuracy)}</span>
              <span className="text-sm text-muted">{L.resultNote[performance!]}</span>
            </div>
          )}
          {idle && !result && <p className="text-sm text-muted">{L.tooSlow}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {result ? (
            <Button size="lg" block disabled={busy} data-testid="minigame-continue" onClick={() => void finish(record(result))}>
              {L.continue}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant={reduced || idle ? 'primary' : 'secondary'} block disabled={busy} data-testid="minigame-auto" onClick={() => void finish()} aria-describedby="minigame-auto-hint">
                {L.auto}
              </Button>
              <Button variant="ghost" block disabled={busy} data-testid="minigame-cancel" onClick={cancel}>
                {L.cancel}
              </Button>
            </div>
          )}
          {!result && (
            <span id="minigame-auto-hint" className="text-center text-[13px] text-muted">
              {L.autoHint}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
