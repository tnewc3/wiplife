import { useRef, useState } from 'react';
import { content } from '../../../content';
import { Button } from '../../components/Button';
import { MINIGAME_LABELS } from '../../labels';
import type { GameProps } from '../types';
import { useFrames } from '../useReducedMotion';

const SIZE = 220;
const R = 90;
const point = (deg: number, r = R): [number, number] => [SIZE / 2 + r * Math.sin((deg * Math.PI) / 180), SIZE / 2 - r * Math.cos((deg * Math.PI) / 180)];
/** The shortest distance between two angles, in degrees. */
const gap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);
const arc = (from: number, to: number): string => {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** Lockpick: a needle turns round a dial; tap Set pin when it is inside the glowing arc. Every pin set before time runs out; a miss costs points. */
export default function Lockpick({ difficulty, slow, onDone }: GameProps) {
  const p = content.balance.minigames.games.lockpick.params;
  const pins = p.pins!;
  const seconds = p.seconds! / (slow ? content.balance.minigames.slowFactor : 1);
  const [phase] = useState(() => Math.random() * 360);
  const [sweet, setSweet] = useState(() => Math.random() * 360);
  const [set, setSetCount] = useState(0);
  const [slips, setSlips] = useState(0);
  const [angle, setAngle] = useState(phase);
  const [left, setLeft] = useState(seconds);
  const latest = useRef(phase);
  const over = useRef(false);
  const [finished, setFinished] = useState(false);
  const state = useRef({ set: 0, slips: 0 });
  const half = (difficulty.window * 360) / 2;

  const end = () => {
    if (over.current) return;
    over.current = true;
    setFinished(true);
    const accuracy = Math.max(0, Math.round((100 * state.current.set) / pins - state.current.slips * p.slip!));
    onDone({ accuracy, detail: [state.current.set, state.current.slips] });
  };
  useFrames(!finished, (t) => {
    const a = (phase + t * difficulty.speed * 360) % 360;
    latest.current = a;
    setAngle(a);
    setLeft(Math.max(0, seconds - t));
    if (t >= seconds) end();
  });
  const tap = () => {
    if (over.current) return;
    if (gap(latest.current, sweet) <= half) {
      state.current.set += 1;
      setSetCount(state.current.set);
      if (state.current.set >= pins) return end();
      setSweet(Math.random() * 360);
    } else {
      state.current.slips += 1;
      setSlips(state.current.slips);
    }
  };
  const [nx, ny] = point(angle, R + 6);
  return (
    <div className="flex flex-col items-center gap-3" data-testid="lockpick">
      <div className="flex w-full items-center justify-between text-sm font-semibold tabular-nums">
        <span data-testid="lockpick-pins">{MINIGAME_LABELS.lockpick.pins(set, pins)}</span>
        <span>{MINIGAME_LABELS.lockpick.time(Math.ceil(left))}</span>
        <span>{MINIGAME_LABELS.lockpick.slips(slips)}</span>
      </div>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={MINIGAME_LABELS.titles.lockpick}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--wl-bar-track)" strokeWidth={18} />
        <path d={arc(sweet - half, sweet + half)} fill="none" stroke="var(--wl-positive)" strokeWidth={18} strokeLinecap="round" data-testid="lockpick-arc" data-sweet={sweet.toFixed(1)} data-half={half.toFixed(1)} />
        <line x1={SIZE / 2} y1={SIZE / 2} x2={nx} y2={ny} stroke="var(--wl-text)" strokeWidth={5} strokeLinecap="round" data-testid="lockpick-needle" data-angle={angle.toFixed(1)} />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={9} fill="var(--wl-text)" />
      </svg>
      <Button size="lg" block data-testid="lockpick-set" onClick={tap}>
        {MINIGAME_LABELS.lockpick.set}
      </Button>
    </div>
  );
}
