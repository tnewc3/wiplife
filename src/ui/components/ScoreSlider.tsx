import { useId } from 'react';
import { scoreWords } from './scoreWords';

export interface ScoreSliderProps {
  label: string;
  /** 0–100 (or `min`–100). */
  value: number;
  onChange: (value: number) => void;
  /** G1 (god mode): show the number beside the words ("high · 72"). Creation shows words only. */
  showNumber?: boolean;
  /** G1: add − and + buttons (44px) that move the value by `step`. */
  steps?: { down: string; up: string; step?: number };
  /** The lowest value (default 0). */
  min?: number;
}

/** A 0–100 slider described in words, never numbers (unless a screen like the god mode editor asks for them). */
export function ScoreSlider({ label, value, onChange, showNumber = false, steps, min = 0 }: ScoreSliderProps) {
  const id = useId();
  const words = scoreWords(value);
  const step = steps?.step ?? 1;
  const nudge = (delta: number) => onChange(Math.min(100, Math.max(min, value + delta)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <span className="text-sm text-muted" aria-hidden="true">
          {showNumber ? `${words} · ${value}` : words}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {steps && (
          <button
            type="button"
            aria-label={`${steps.down}: ${label}`}
            disabled={value <= min}
            onClick={() => nudge(-step)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-xl font-semibold active:bg-surface-2 disabled:opacity-40"
          >
            <span aria-hidden="true">−</span>
          </button>
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={100}
          step={1}
          value={value}
          aria-valuetext={showNumber ? `${words}, ${value}` : words}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full min-w-0 cursor-pointer accent-accent"
        />
        {steps && (
          <button
            type="button"
            aria-label={`${steps.up}: ${label}`}
            disabled={value >= 100}
            onClick={() => nudge(step)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-xl font-semibold active:bg-surface-2 disabled:opacity-40"
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
    </div>
  );
}
