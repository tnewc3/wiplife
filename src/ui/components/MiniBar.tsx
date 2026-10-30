import { barColor, type BarKind } from './barColor';
import { scoreWords } from './scoreWords';

/**
 * A stat bar small enough to sit inside a list row (U2 inline summary): a 56px bar and its percentage, colored by value.
 * It is still a meter with a label, so it reads the same to a screen reader as the full StatBar.
 */
export function MiniBar({ label, value, kind = 'stat' }: { label: string; value: number; kind?: BarKind }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <span className="flex items-center gap-1.5">
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped} percent, ${scoreWords(clamped)}`}
        className="block h-2 w-14 overflow-hidden rounded-full bg-bar-track"
      >
        <span className="block h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: barColor(clamped, kind) }} />
      </span>
      <span className="w-9 text-right text-[13px] font-bold tabular-nums" aria-hidden="true">
        {clamped}%
      </span>
    </span>
  );
}
