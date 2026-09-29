import type { ReactNode } from 'react';

export interface ScreenProps {
  /** Visible heading. Omit for screens with their own hero (title, age gate). */
  title?: string;
  /** Shows a back button in the header. */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  /** Pinned below the scrolling content (e.g. primary actions, bottom nav). */
  footer?: ReactNode;
  /** Vertically center the content (title and age gate). */
  centered?: boolean;
}

/**
 * Full-height screen layout: safe-area aware, a single scrolling region, and a
 * centered column on tablet and desktop.
 */
export function Screen({ title, onBack, backLabel = 'Back', children, footer, centered = false }: ScreenProps) {
  return (
    <div className="flex h-dvh w-full justify-center bg-bg">
      <div className="flex h-full w-full max-w-lg flex-col md:border-x md:border-border">
        {(title || onBack) && (
          <header className="pt-safe px-safe flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-bg">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="-ml-2 flex size-11 items-center justify-center rounded-full text-2xl text-accent active:bg-surface-2"
              >
                <span aria-hidden="true">‹</span>
              </button>
            )}
            {title && <h1 className="truncate py-3 text-xl font-bold">{title}</h1>}
          </header>
        )}
        <main
          className={`px-safe min-h-0 flex-1 overflow-y-auto py-4 ${centered ? 'flex flex-col justify-center' : ''} ${
            title || onBack ? '' : 'pt-[max(env(safe-area-inset-top),1rem)]'
          } ${footer ? '' : 'pb-[max(env(safe-area-inset-bottom),1rem)]'}`}
        >
          {children}
        </main>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
