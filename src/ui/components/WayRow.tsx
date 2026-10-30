import { ChevronDown, Lock } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';

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

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/**
 * One way to work, or one thing to do (U1, U2 density): a 56px row that expands to show its card, and remembers whether it
 * was open (in the settings). When it isn't available it is greyed out, and tapping it explains why instead of opening.
 */
export function WayRow({ title, status, reason, defaultOpen = true, children, testId }: WayRowProps) {
  const locked = reason !== undefined;
  const id = `way.${testId ?? slug(title)}`;
  const stored = useAppStore((s) => s.settings.openGroups[id]);
  const setGroupOpen = useAppStore((s) => s.setGroupOpen);
  // A row that is not open to you starts closed, and is not remembered; tapping it opens the reason.
  const [lockedOpen, setLockedOpen] = useState(false);
  const open = locked ? lockedOpen : (stored ?? defaultOpen);
  const bodyId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => (locked ? setLockedOpen((o) => !o) : void setGroupOpen(id, !open))}
        className={`flex min-h-row w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-1.5 text-left active:bg-surface-2 ${locked ? 'opacity-60' : ''}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display truncate text-base leading-tight font-semibold">{title}</span>
          {status && <span className="truncate text-[13px] leading-tight text-muted">{status}</span>}
        </span>
        {locked ? <Lock aria-hidden="true" size={18} className="shrink-0 text-muted" /> : <ChevronDown aria-hidden="true" size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <div id={bodyId} hidden={!open}>
        {locked ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" role="status" data-testid={testId ? `${testId}-reason` : undefined}>{reason}</p> : children}
      </div>
    </div>
  );
}
