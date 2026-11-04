import { useState } from 'react';
import { content } from '../../../content';
import { timingAccuracy } from '../../../engine/minigames/odds';
import { Icon } from '../../components/Icon';
import { MINIGAME_LABELS } from '../../labels';
import { TimingBar } from '../TimingBar';
import type { GameProps } from '../types';

const SPOTS = ['left', 'middle', 'right'] as const;

/** The penalty kick: choose a corner, stop the power marker in the zone, and the keeper guesses. */
export default function PenaltyKick({ difficulty, onDone }: GameProps) {
  const p = content.balance.minigames.games.penalty_kick.params;
  const [spot, setSpot] = useState<number | null>(null);
  const [power] = useState(() => 0.65 + Math.random() * 0.25);
  const [shot, setShot] = useState<{ keeper: number; read: boolean; accuracy: number; position: number } | null>(null);
  const L = MINIGAME_LABELS;

  const take = (position: number) => {
    const chosen = spot ?? 1;
    // The keeper reads you less the better you are.
    const reads = (p.readsWeak! + (p.readsStrong! - p.readsWeak!) * (difficulty.skill / 100)) / 100;
    const read = Math.random() < reads;
    const keeper = read ? chosen : (chosen + 1 + Math.floor(Math.random() * 2)) % 3;
    const power_ = timingAccuracy(position - power, difficulty.window);
    const accuracy = read ? Math.round((power_ * p.saved!) / 100) : power_;
    setShot({ keeper, read, accuracy, position });
    onDone({ accuracy, detail: [chosen, keeper, Math.round(position * 1000)] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-bar-track p-3" role="group" aria-label={L.penalty.pick} data-testid="penalty-goal">
        {SPOTS.map((name, i) => (
          <button
            key={name}
            type="button"
            disabled={spot !== null || shot !== null}
            aria-pressed={spot === i}
            data-testid={`penalty-spot-${name}`}
            onClick={() => setSpot(i)}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold ${spot === i ? 'border-accent bg-surface' : 'border-border bg-surface-2'} disabled:opacity-100`}
          >
            {shot && shot.keeper === i ? <span className="rounded-full bg-warning px-2 text-xs font-bold text-accent-contrast">{L.penalty.keeper}</span> : <Icon id="goal_net" size={28} />}
            {shot && spot === i && <Icon id="soccer_ball" size={24} />}
            <span>{L.penalty[name]}</span>
          </button>
        ))}
      </div>
      {shot ? (
        <p className="text-sm font-semibold" role="status" data-testid="penalty-keeper">
          {shot.read ? L.penalty.saved : L.penalty.beat}
        </p>
      ) : spot === null ? (
        <p className="text-sm font-semibold">{L.penalty.pick}</p>
      ) : (
        <>
          <p className="text-sm font-semibold">{L.penalty.power}</p>
          <TimingBar speed={difficulty.speed} window={difficulty.window} target={power} icon="soccer_ball" label={L.timing.power} onStop={take} />
        </>
      )}
    </div>
  );
}
