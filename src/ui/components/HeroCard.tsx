import type { ReactNode } from 'react';
import { barColor, type BarKind } from './barColor';
import { scoreWords } from './scoreWords';

/** One stat of a hero card: a label, a big value, and a bar or a sub-label. 14px radius, on the second surface. */
export function StatCell({ label, value, bar, barKind = 'stat', sub, testId }: { label: string; value: ReactNode; /** 0–100: draws a bar (and names it for a screen reader). */ bar?: number; barKind?: BarKind; sub?: string; testId?: string }) {
  const clamped = bar === undefined ? undefined : Math.min(100, Math.max(0, Math.round(bar)));
  return (
    <div data-testid={testId} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[14px] bg-surface-2 px-3 py-2">
      <span className="text-xs font-bold text-muted [overflow-wrap:anywhere]">{label}</span>
      <span className="font-display text-xl leading-tight font-semibold [overflow-wrap:anywhere]">{value}</span>
      {clamped !== undefined && (
        <span role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-valuetext={`${clamped} percent, ${scoreWords(clamped)}`} className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-bar-track">
          <span className="block h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: barColor(clamped, barKind) }} />
        </span>
      )}
      {sub && <span className="text-xs text-muted [overflow-wrap:anywhere]">{sub}</span>}
    </div>
  );
}

/**
 * The hero card of a feature screen (U3): a big icon or portrait, a title, one status line, and two or three stat cells.
 * The title wraps; it never truncates.
 */
export function HeroCard({ lead, title, status, children, gold = false, testId }: { lead?: ReactNode; title: string; status?: string | undefined; /** The StatCells. */ children?: ReactNode; gold?: boolean; testId?: string }) {
  return (
    <section aria-label={title} data-testid={testId} className={`flex flex-col gap-3 rounded-[20px] border p-3 ${gold ? 'border-gold-border bg-gold-surface' : 'border-border bg-surface'}`}>
      <div className="flex items-center gap-3">
        {lead && <span className="flex shrink-0 items-center justify-center">{lead}</span>}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className={`font-display text-xl leading-tight font-semibold [overflow-wrap:anywhere] ${gold ? 'text-gold' : ''}`}>{title}</h2>
          {status && <p className="text-sm text-muted [overflow-wrap:anywhere]">{status}</p>}
        </div>
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </section>
  );
}
