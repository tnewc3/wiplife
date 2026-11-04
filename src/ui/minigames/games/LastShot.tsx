import { useState } from 'react';
import { timingAccuracy } from '../../../engine/minigames/odds';
import { MINIGAME_LABELS } from '../../labels';
import { TimingBar } from '../TimingBar';
import type { GameProps } from '../types';

/** The last shot / free throw: one tap when the ball is in the zone. */
export default function LastShot({ difficulty, onDone }: GameProps) {
  const [target] = useState(() => 0.3 + Math.random() * 0.4);
  return (
    <TimingBar
      speed={difficulty.speed}
      window={difficulty.window}
      target={target}
      icon="basketball"
      label={MINIGAME_LABELS.timing.zone}
      onStop={(position) => onDone({ accuracy: timingAccuracy(position - target, difficulty.window), detail: [Math.round(position * 1000)] })}
    />
  );
}
