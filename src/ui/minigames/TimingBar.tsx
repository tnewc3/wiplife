import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { MINIGAME_LABELS } from '../labels';
import { useFrames } from './useReducedMotion';

/** A marker that sweeps back and forth: 0 to 1 and back, `speed` bar widths a second. */
const triangle = (x: number): number => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

/**
 * The timing bar behind the last shot, the swing, the penalty's power and (as a ring of reels) the slots: a zone centered
 * on `target` that is `window` wide, a marker sweeping across, and a Stop button. `onStop` gets where the marker was.
 */
export function TimingBar({ speed, window: zone, target, icon, label, onStop, stopLabel = MINIGAME_LABELS.stop }: { speed: number; window: number; target: number; icon: string; label: string; onStop: (position: number) => void; stopLabel?: string }) {
  const [phase] = useState(() => Math.random());
  const [position, setPosition] = useState(() => triangle(phase));
  const latest = useRef(position);
  const [running, setRunning] = useState(true);
  const stopped = useRef(false);
  useFrames(running, (t) => {
    const p = triangle(phase + t * speed);
    latest.current = p;
    setPosition(p);
  });
  const stop = () => {
    if (stopped.current) return;
    stopped.current = true;
    setRunning(false);
    setPosition(latest.current);
    onStop(latest.current);
  };
  const from = Math.max(0, target - zone / 2);
  const to = Math.min(1, target + zone / 2);
  return (
    <div className="flex flex-col gap-3" data-testid="timing-bar">
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>{label}</span>
      </div>
      <div className="relative h-12 w-full rounded-full bg-bar-track" role="img" aria-label={`${label}: the zone is from ${Math.round(from * 100)} to ${Math.round(to * 100)} percent of the bar`}>
        <div className="absolute inset-y-1 rounded-full border-2 border-positive bg-positive/30" style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} data-testid="timing-zone" data-from={from.toFixed(3)} data-to={to.toFixed(3)} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${position * 100}%` }} data-testid="timing-marker" data-position={position.toFixed(3)}>
          <Icon id={icon} size={36} />
        </div>
      </div>
      <Button size="lg" block data-testid="timing-stop" onClick={stop}>
        {stopLabel}
      </Button>
    </div>
  );
}
