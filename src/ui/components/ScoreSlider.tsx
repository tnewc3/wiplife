import { useId } from 'react';
import { scoreWords } from './scoreWords';

export interface ScoreSliderProps {
  label: string;
  /** 0–100. */
  value: number;
  onChange: (value: number) => void;
}

/** A 0–100 slider described in words, never numbers. */
export function ScoreSlider({ label, value, onChange }: ScoreSliderProps) {
  const id = useId();
  const words = scoreWords(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <span className="text-sm text-muted" aria-hidden="true">
          {words}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-valuetext={words}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}
