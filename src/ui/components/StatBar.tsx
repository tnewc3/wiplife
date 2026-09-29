import { scoreWords } from './scoreWords';

export interface StatBarProps {
  label: string;
  /** 0–100. Shown only as a bar, never as a number (docs/design.md). */
  value: number;
}

export function StatBar({ label, value }: StatBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-muted">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={scoreWords(clamped)}
        className="h-2.5 w-full overflow-hidden rounded-full bg-bar-track"
      >
        <div className="h-full rounded-full bg-bar-fill transition-[width] duration-500" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
