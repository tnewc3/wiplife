import { ChevronDown, Lock } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export interface WayRowProps {
  title: string;
  /** One line under the title. */
  status?: string | undefined;
  /** Set when it isn't open to you: the row is greyed out and tapping it says why. */
  reason?: string | undefined;
  /** Start expanded (an available row is open unless told otherwise). */
  defaultOpen?: boolean;
  children?: ReactNode;
  testId?: string;
}

/**
 * One way to work, or one thing to do (U1): a row that expands to show its card. When it isn't available it is greyed out,
 * and tapping it explains why instead of opening.
 */
export function WayRow({ title, status, reason, defaultOpen = true, children, testId }: WayRowProps) {
  const locked = reason !== undefined;
  // A row that is not open to you starts closed; tapping it opens the reason.
  const [open, setOpen] = useState(defaultOpen && !locked);
  const bodyId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-disabled={locked || undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left active:bg-surface-2 ${locked ? 'opacity-60' : ''}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-base font-semibold">{title}</span>
          {status && <span className="truncate text-sm text-muted">{status}</span>}
        </span>
        {locked ? <Lock aria-hidden="true" size={18} className="shrink-0 text-muted" /> : <ChevronDown aria-hidden="true" size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <div id={bodyId} hidden={!open}>
        {locked ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" role="status" data-testid={testId ? `${testId}-reason` : undefined}>{reason}</p> : children}
      </div>
    </div>
  );
}
