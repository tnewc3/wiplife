import { useState } from 'react';
import { timingAccuracy } from '../../../engine/minigames/odds';
import { MINIGAME_LABELS } from '../../labels';
import { TimingBar } from '../TimingBar';
import type { GameProps } from '../types';

/** The swing: a power meter, then an accuracy meter. The accuracy is the average of the two stops. */
export default function Swing({ difficulty, onDone }: GameProps) {
  const [power] = useState(() => 0.7 + Math.random() * 0.2);
  const [contact] = useState(() => 0.3 + Math.random() * 0.4);
  const [first, setFirst] = useState<{ accuracy: number; position: number } | null>(null);
  if (!first) {
    return (
      <TimingBar
        key="power"
        speed={difficulty.speed}
        window={difficulty.window}
        target={power}
        icon="baseball"
        label={MINIGAME_LABELS.timing.power}
        onStop={(position) => setFirst({ accuracy: timingAccuracy(position - power, difficulty.window), position })}
      />
    );
  }
  return (
    <TimingBar
      key="contact"
      speed={difficulty.speed * 1.1}
      window={difficulty.window}
      target={contact}
      icon="baseball"
      label={MINIGAME_LABELS.timing.contact}
      onStop={(position) => {
        const second = timingAccuracy(position - contact, difficulty.window);
        onDone({ accuracy: Math.round((first.accuracy + second) / 2), detail: [Math.round(first.position * 1000), Math.round(position * 1000)] });
      }}
    />
  );
}
