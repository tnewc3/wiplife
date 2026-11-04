import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { content } from '../../../content';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { MINIGAME_LABELS } from '../../labels';
import type { GameProps } from '../types';
import { useFrames } from '../useReducedMotion';

/** Rows of barriers that show at once, from the top of the course to the runner's line. */
const AHEAD = 3;

/** The getaway: swipe (or tap the arrows) to change lane and dodge the barriers on the way to the finish. */
export default function Getaway({ difficulty, onDone }: GameProps) {
  const p = content.balance.minigames.games.getaway.params;
  const rows = p.rows!;
  const lanes = p.lanes!;
  // A wider course blocks two lanes in fewer rows.
  const twoBlocked = Math.min(0.85, Math.max(0.15, 1 - difficulty.window * 2.5));
  const [course] = useState(() =>
    Array.from({ length: rows }, () => {
      const open = Math.floor(Math.random() * lanes);
      const second = Math.random() < twoBlocked ? (open + 1 + Math.floor(Math.random() * (lanes - 1))) % lanes : open;
      // The lanes not open are blocked; a second open lane makes a wider gap.
      return Array.from({ length: lanes }, (_, lane) => lane !== open && lane !== second);
    }),
  );
  const [lane, setLane] = useState(Math.floor(lanes / 2));
  const laneRef = useRef(lane);
  const [time, setTime] = useState(0);
  const [cleared, setCleared] = useState(0);
  const checked = useRef(0);
  const hits = useRef(0);
  const over = useRef(false);
  const [finished, setFinished] = useState(false);
  const swipe = useRef<number | null>(null);
  const last = (rows - 1 + AHEAD) / difficulty.speed;

  const move = (d: -1 | 1) => {
    const next = Math.min(lanes - 1, Math.max(0, laneRef.current + d));
    laneRef.current = next;
    setLane(next);
  };
  useFrames(!finished, (t) => {
    setTime(t);
    // A row reaches the runner's line at (row + AHEAD) / speed.
    while (checked.current < rows && t >= (checked.current + AHEAD) / difficulty.speed) {
      if (course[checked.current]![laneRef.current]) hits.current += 1;
      checked.current += 1;
      setCleared(checked.current - hits.current);
    }
    if (t >= last + 0.25 && !over.current) {
      over.current = true;
      setFinished(true);
      onDone({ accuracy: Math.round((100 * (rows - hits.current)) / rows), detail: [rows - hits.current, hits.current] });
    }
  });
  const rowTop = (r: number): number => (1 - (((r + AHEAD) / difficulty.speed - time) * difficulty.speed) / AHEAD) * 78;
  return (
    <div className="flex flex-col gap-3" data-testid="getaway">
      <div className="flex items-center justify-between text-sm font-semibold tabular-nums" data-testid="getaway-score">
        <span>{MINIGAME_LABELS.getaway.course}</span>
        <span>{MINIGAME_LABELS.getaway.cleared(cleared, rows)}</span>
      </div>
      <div
        className="relative h-64 touch-none overflow-hidden rounded-2xl bg-bar-track select-none"
        role="group"
        aria-label={MINIGAME_LABELS.getaway.course}
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 24) move(e.clientX > swipe.current ? 1 : -1);
          swipe.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') move(-1);
          if (e.key === 'ArrowRight') move(1);
        }}
        tabIndex={0}
      >
        {Array.from({ length: lanes - 1 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-border" style={{ left: `${((i + 1) / lanes) * 100}%` }} aria-hidden="true" />
        ))}
        {course.map((row, r) => {
          const top = rowTop(r);
          if (top < -12 || top > 100) return null;
          return row.map((blocked, l) =>
            blocked ? (
              <span key={`${r}-${l}`} className="absolute h-8 rounded-lg bg-negative" style={{ top: `${top}%`, left: `calc(${(l / lanes) * 100}% + 6px)`, width: `calc(${100 / lanes}% - 12px)` }} data-testid="getaway-barrier" aria-hidden="true" />
            ) : null,
          );
        })}
        <span className="absolute bottom-3 flex justify-center transition-[left] duration-100" style={{ left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }} data-testid="getaway-runner" data-lane={lane} aria-hidden="true">
          <Icon id="person_running" size={44} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="secondary" onClick={() => move(-1)} aria-label={MINIGAME_LABELS.getaway.left} data-testid="getaway-left">
          <ArrowLeft aria-hidden="true" size={22} />
        </Button>
        <Button size="lg" variant="secondary" onClick={() => move(1)} aria-label={MINIGAME_LABELS.getaway.right} data-testid="getaway-right">
          <ArrowRight aria-hidden="true" size={22} />
        </Button>
      </div>
    </div>
  );
}
