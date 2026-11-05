import { ChevronLeft, Info, MoreHorizontal } from 'lucide-react';

/**
 * The header of every screen below a tab (U3): a back button, the title (it wraps, it never truncates), an optional ⓘ
 * that opens the screen's rules and an optional ⋯ overflow menu for its secondary and destructive actions.
 */
export function ScreenHeader({ title, onBack, backLabel = 'Back', onInfo, onOverflow, tone = 'plain' }: { title: string; onBack: () => void; backLabel?: string; onInfo?: (() => void) | undefined; onOverflow?: (() => void) | undefined; tone?: 'plain' | 'raised' }) {
  const button = 'flex size-11 shrink-0 items-center justify-center rounded-full active:bg-surface-2';
  return (
    <header className={`pt-safe px-safe flex min-h-14 shrink-0 items-center gap-1 border-b border-border ${tone === 'raised' ? 'bg-surface-2' : 'bg-bg'}`}>
      <button type="button" onClick={onBack} aria-label={backLabel} className={`${button} -ml-2 text-link`}>
        <ChevronLeft aria-hidden="true" size={28} />
      </button>
      <h1 className="font-display min-w-0 flex-1 py-2 text-xl leading-tight font-semibold [overflow-wrap:anywhere]">{title}</h1>
      {onInfo && (
        <button type="button" onClick={onInfo} aria-label={`About ${title}`} data-testid="screen-info" className={`${button} text-muted`}>
          <Info aria-hidden="true" size={22} />
        </button>
      )}
      {onOverflow && (
        <button type="button" onClick={onOverflow} aria-label="More options" data-testid="screen-overflow" className={`${button} -mr-2 text-muted`}>
          <MoreHorizontal aria-hidden="true" size={24} />
        </button>
      )}
    </header>
  );
}
