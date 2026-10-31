import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { barColor } from './barColor';
import { Icon } from './Icon';
import { TRAINING_LABELS } from '../labels';

/** The icon of each kind of training card. */
const ICONS = { practice: 'light_bulb', rehearsal: 'guitar', training: 'flexed_biceps', study: 'books', gym: 'flexed_biceps' } as const;

/** How long the card stays: the bar fills, then the result shows, then it goes (a tap skips it). */
const FILL_MS = 1400;
const STAY_MS = 2600;

const reducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * C2: the short card after a practice, training session, rehearsal, study session or gym visit: an icon, a skill bar that fills,
 * then the result ("Shooting +2", "Your drummer is getting tighter"). It lasts 2–3 seconds, a tap skips it, and with reduced
 * motion the bar is already full and the result shows at once.
 */
export function TrainingPopup() {
  const training = useAppStore((s) => s.training);
  const close = useAppStore((s) => s.closeTraining);
  if (!training || !training.lines[0]) return null;
  // A new card starts fresh: the key changes with what it shows.
  return <TrainingCard key={`${training.kind}:${training.lines.map((l) => l.text).join('|')}`} training={training} close={close} />;
}

function TrainingCard({ training, close }: { training: NonNullable<ReturnType<typeof useAppStore.getState>['training']>; close: () => void }) {
  const reduce = reducedMotion();
  const [filled, setFilled] = useState(reduce);

  useEffect(() => {
    const start = window.setTimeout(() => setFilled(true), reduce ? 0 : 60);
    const end = window.setTimeout(close, reduce ? 2000 : STAY_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [reduce, close]);

  const [first, ...rest] = training.lines;
  if (!first) return null;
  const done = reduce || filled;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-end justify-center px-4 pb-28">
      <button
        type="button"
        onClick={close}
        data-testid="training-popup"
        aria-label={`${TRAINING_LABELS.title[training.kind]}. ${first.text}. ${TRAINING_LABELS.skip}`}
        className="pointer-events-auto flex min-h-16 w-full max-w-sm flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-left shadow-xl"
      >
        <span className="flex items-center gap-3">
          <Icon id={ICONS[training.kind]} size={28} />
          <span className="font-display text-base font-semibold">{TRAINING_LABELS.title[training.kind]}</span>
          <span className="ml-auto text-[13px] text-muted">{TRAINING_LABELS.skip}</span>
        </span>
        <span aria-hidden="true" className="block h-2.5 w-full overflow-hidden rounded-full bg-bar-track">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.round(Math.min(100, done ? first.to : first.from))}%`, backgroundColor: barColor(Math.min(100, first.to), 'stat'), transition: reduce ? 'none' : `width ${FILL_MS}ms ease-out` }}
          />
        </span>
        <span role="status" aria-live="polite" className="text-base font-semibold" data-testid="training-result">
          {done ? first.text : '\u00a0'}
        </span>
        {done &&
          rest.slice(0, 1).map((line) => (
            <span key={line.text} className="text-[13px] text-muted">
              {line.text}
            </span>
          ))}
      </button>
    </div>
  );
}
