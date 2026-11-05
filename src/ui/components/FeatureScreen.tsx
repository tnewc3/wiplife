import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { SheetAction } from './ActionSheet';
import { InfoSheet } from './InfoSheet';
import { OverflowMenu } from './OverflowMenu';
import { ScreenHeader } from './ScreenHeader';

export interface FeatureScreenProps {
  open: boolean;
  title: string;
  onBack: () => void;
  backLabel?: string;
  /** The rules and tips of the screen: shown in a sheet behind the ⓘ button. Leave out for no button. */
  info?: ReactNode;
  /** The secondary and destructive actions: the ⋯ menu. Leave out for no button. */
  actions?: readonly SheetAction[] | undefined;
  children: ReactNode;
  testId?: string;
  /** Sheets and dialogs that belong to the screen; they sit above it. */
  overlays?: ReactNode;
}

/** The distance from the left edge where a back swipe may start, and how far it has to go. */
const EDGE = 32;
const DISTANCE = 72;

/**
 * A feature screen (U3): a career, a band, an organization, a store, a list of groups. It is a full screen with a header
 * and a back button that slides in from the right, never a sheet; swiping right from the left edge goes back. Depth is
 * tab → category → feature screen → sheet, and nothing deeper.
 */
export function FeatureScreen({ open, title, onBack, backLabel = 'Back', info, actions, children, testId, overlays }: FeatureScreenProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Escape goes back, unless a sheet or dialog is on top (it closes first).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const screens = document.querySelectorAll('[data-feature-screen]');
      if (e.key === 'Escape' && document.querySelector('[role="dialog"]') === null && screens[screens.length - 1] === root.current) onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onBack]);
  if (!open) return null;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    const box = e.currentTarget.getBoundingClientRect();
    start.current = t && t.clientX - box.left <= EDGE ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    const s = start.current;
    start.current = null;
    if (t && s && t.clientX - s.x >= DISTANCE && Math.abs(t.clientY - s.y) < DISTANCE) onBack();
  };
  return (
    <div ref={root} data-feature-screen="" role="region" aria-label={title} data-testid={testId} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="fixed inset-0 z-30 flex justify-center bg-bg animate-[wl-slide-in_220ms_ease-out]">
      <div className="flex h-full w-full max-w-lg flex-col md:border-x md:border-border">
        <ScreenHeader title={title} onBack={onBack} backLabel={backLabel} onInfo={info ? () => setInfoOpen(true) : undefined} onOverflow={actions && actions.length > 0 ? () => setMenuOpen(true) : undefined} />
        <main data-testid="feature-main" className="px-safe flex min-h-0 flex-1 scroll-pt-16 flex-col gap-3 overflow-y-auto pt-3 [&>*]:shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </main>
      </div>
      {info && (
        <InfoSheet open={infoOpen} title={title} onClose={() => setInfoOpen(false)}>
          {info}
        </InfoSheet>
      )}
      {actions && <OverflowMenu open={menuOpen} title={title} actions={actions} onClose={() => setMenuOpen(false)} />}
      {overlays}
    </div>
  );
}
