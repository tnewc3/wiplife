import { useRef, useState } from 'react';
import { content } from '../../../content';
import { timingAccuracy } from '../../../engine/minigames/odds';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { MINIGAME_LABELS } from '../../labels';
import type { GameProps } from '../types';
import { useFrames } from '../useReducedMotion';

const SYMBOLS = ['cherries', 'lemon', 'bell', 'glowing_star', 'money_bag'] as const;
/** The symbol (the star) that is on the line when a reel is on its mark. */
const MARK = 3;

/** The slots: three reels spin; stop each on the line. How close you stop moves the machine's odds a little (the house still keeps its edge). */
export default function Slots({ difficulty, onDone }: GameProps) {
  const reels = content.balance.minigames.games.slots.params.reels!;
  const [offsets] = useState(() => Array.from({ length: reels }, () => Math.random()));
  const [stops, setStops] = useState<number[]>([]);
  const [positions, setPositions] = useState<number[]>(() => offsets.slice());
  const latest = useRef(offsets.slice());
  const [done, setDone] = useState(false);
  useFrames(!done, (t) => {
    const next = offsets.map((o, i) => (stops[i] !== undefined ? stops[i]! : (o + t * difficulty.speed * (1 + i * 0.15)) % 1));
    latest.current = next;
    setPositions(next);
  });
  const stop = () => {
    const i = stops.length;
    if (i >= reels) return;
    const at = latest.current[i]!;
    const next = [...stops, at];
    setStops(next);
    if (next.length === reels) {
      setDone(true);
      // The mark is where the star sits on the line; the window is a share of a turn of the reel.
      const target = MARK / SYMBOLS.length;
      const errors = next.map((p) => Math.min(Math.abs(p - target), 1 - Math.abs(p - target)));
      const accuracy = Math.round(errors.reduce((s, e) => s + timingAccuracy(e, difficulty.window), 0) / reels);
      onDone({ accuracy, detail: next.map((p) => Math.round(p * 1000)) });
    }
  };
  const L = MINIGAME_LABELS.slots;
  return (
    <div className="flex flex-col gap-3" data-testid="slots">
      <div className="relative flex justify-center gap-2 rounded-2xl bg-bar-track p-3">
        {positions.map((p, i) => {
          // Three symbols show: the one on the line and the ones either side, moving as the reel turns.
          const cell = p * SYMBOLS.length;
          const base = Math.floor(cell);
          const frac = cell - base;
          return (
            <div key={i} className="relative h-36 w-20 overflow-hidden rounded-xl border border-border bg-surface" role="img" aria-label={L.reel(i + 1)} data-testid={`slots-reel-${i}`} data-position={p.toFixed(3)}>
              {[-1, 0, 1, 2].map((k) => {
                const symbol = SYMBOLS[(((base + k - 1) % SYMBOLS.length) + SYMBOLS.length) % SYMBOLS.length]!;
                return (
                  <span key={k} className="absolute inset-x-0 flex h-12 items-center justify-center" style={{ top: `${(k - frac) * 48}px` }}>
                    <Icon id={symbol} size={36} />
                  </span>
                );
              })}
            </div>
          );
        })}
        <span className="pointer-events-none absolute inset-x-2 top-1/2 h-12 -translate-y-1/2 rounded-lg border-2 border-positive" aria-hidden="true" />
      </div>
      <Button size="lg" block disabled={stops.length >= reels} data-testid="slots-stop" onClick={stop}>
        {stops.length >= reels ? MINIGAME_LABELS.timing.stopped : L.stopReel(stops.length + 1)}
      </Button>
    </div>
  );
}
