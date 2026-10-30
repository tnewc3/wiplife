import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';

/**
 * A collapsible group (U2): a 44px+ header with a count, and a body that opens and closes. Whether it is open is
 * remembered across visits and sessions (in the settings, by `id`); `defaultOpen` is what it is until you choose.
 */
export function CollapsibleGroup({ id, title, count, defaultOpen = true, children, testId }: { id: string; title: string; count?: number | string; defaultOpen?: boolean; children: ReactNode; testId?: string }) {
  const bodyId = useId();
  const stored = useAppStore((s) => s.settings.openGroups[id]);
  const setGroupOpen = useAppStore((s) => s.setGroupOpen);
  const open = stored ?? defaultOpen;
  return (
    <section aria-label={title} className="flex flex-col" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => void setGroupOpen(id, !open)}
        className="font-display sticky -top-4 z-10 -mx-4 flex min-h-11 items-center justify-between gap-2 bg-bg px-4 text-left text-base font-semibold active:bg-surface-2"
      >
        <span className="truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          {count !== undefined && <span className="tabular-nums">{count}</span>}
          <ChevronDown aria-hidden="true" size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="pb-2">
        {children}
      </div>
    </section>
  );
}
