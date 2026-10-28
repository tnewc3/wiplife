import { scoreWords } from './scoreWords';
import { barColor, type BarKind } from './barColor';
import { Icon } from './Icon';

export interface StatBarProps {
  label: string;
  /** 0–100. Shown as a bar and as a percentage (docs/design.md). */
  value: number;
  kind?: BarKind;
  /** A content icon id (registries/icons.yaml) shown beside the label. */
  icon?: string;
  /** 'row': label, bar and percentage on one line (the Home stat panel). 'stacked': the label above the bar. */
  layout?: 'stacked' | 'row';
}

export function StatBar({ label, value, kind = 'stat', icon, layout = 'stacked' }: StatBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const bar = (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped} percent, ${scoreWords(clamped)}`}
      className="h-3 w-full min-w-0 overflow-hidden rounded-full bg-bar-track"
    >
      <div className="h-full rounded-full transition-[width,background-color] duration-700 ease-out" style={{ width: `${clamped}%`, backgroundColor: barColor(clamped, kind) }} />
    </div>
  );
  const percent = (
    <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums" aria-hidden="true">
      {clamped}%
    </span>
  );
  if (layout === 'row') {
    return (
      <div className="flex items-center gap-2">
        <span className="flex w-28 shrink-0 items-center gap-1.5 text-sm font-bold">
          {icon && <Icon id={icon} size={18} />}
          <span className="truncate">{label}</span>
        </span>
        {bar}
        {percent}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          {icon && <Icon id={icon} size={16} />}
          <span>{label}</span>
        </span>
        <span className="font-bold text-text tabular-nums" aria-hidden="true">
          {clamped}%
        </span>
      </span>
      {bar}
    </div>
  );
}
