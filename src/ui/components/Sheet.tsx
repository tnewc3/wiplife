import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned to the bottom of the sheet. */
  footer?: ReactNode;
  /** U3: a header of your own (an icon, one line, a balance) in place of the plain title; `title` still names the dialog. */
  header?: ReactNode;
  testId?: string;
}

/** A modal bottom sheet. Closes on Escape or a tap outside. */
export function Sheet({ open, title, onClose, children, footer, header, testId }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-scrim animate-[wl-fade-in_150ms_ease-out]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        data-testid={testId}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-xl outline-none animate-[wl-sheet-in_200ms_ease-out]"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
        {header ? (
          <div className="px-5 pt-3 pb-2">
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            {header}
          </div>
        ) : (
          <h2 id={titleId} className="px-5 pt-3 pb-2 text-xl font-bold">
            {title}
          </h2>
        )}
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</div>}
        {!footer && <div className="pb-[max(env(safe-area-inset-bottom),1rem)]" />}
      </div>
    </div>
  );
}
