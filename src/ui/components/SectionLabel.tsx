import type { ReactNode } from 'react';

/** A section label of a feature screen: 12px, bold, uppercase, letter-spaced, muted. */
export function SectionLabel({ children, id, trailing }: { children: ReactNode; id?: string; trailing?: ReactNode }) {
  return (
    <h2 id={id} className="font-display flex items-baseline justify-between gap-2 px-1 text-xs font-bold tracking-widest text-muted uppercase">
      <span>{children}</span>
      {trailing !== undefined && <span className="shrink-0 tracking-normal normal-case tabular-nums">{trailing}</span>}
    </h2>
  );
}

/** A compact row: a label and its value on one line (a stat, a total), or a tappable line that opens something. */
export function CompactRow({ label, value, onClick, testId, muted = false }: { label: ReactNode; value?: ReactNode; onClick?: (() => void) | undefined; testId?: string; muted?: boolean }) {
  const body = (
    <>
      <span className={`min-w-0 flex-1 text-left text-[15px] [overflow-wrap:anywhere] ${muted ? 'text-muted' : ''}`}>{label}</span>
      {value !== undefined && value !== null && <span className="shrink-0 text-[15px] font-bold tabular-nums">{value}</span>}
    </>
  );
  const shape = 'flex min-h-11 w-full min-w-0 items-center justify-between gap-3 px-3 py-1';
  return onClick ? (
    <button type="button" onClick={onClick} data-testid={testId} className={`${shape} wl-press text-left`}>
      {body}
    </button>
  ) : (
    <div data-testid={testId} className={shape}>
      {body}
    </div>
  );
}

/** A list of compact rows on one rounded surface. */
export function CompactList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {children}
    </div>
  );
}
