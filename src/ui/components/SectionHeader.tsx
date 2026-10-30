import type { ReactNode } from 'react';

/**
 * A sticky section header (U2): 28px tall, it stays at the top of the scrolling page while its section passes under it.
 * `trailing` is a small value on the right (a count, a total).
 */
export function SectionHeader({ id, children, trailing }: { id?: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <h2 id={id} className="font-display sticky -top-4 z-10 -mx-4 mb-1 flex h-section items-center justify-between bg-bg px-4 text-[13px] font-semibold tracking-wide text-muted uppercase">
      <span className="truncate">{children}</span>
      {trailing !== undefined && <span className="shrink-0 normal-case tabular-nums">{trailing}</span>}
    </h2>
  );
}
