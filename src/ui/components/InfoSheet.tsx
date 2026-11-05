import type { ReactNode } from 'react';
import { Sheet } from './Sheet';

/** The rules and tips of a screen (U3): short, behind the ⓘ button of its header, never on the screen itself. */
export function InfoSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div data-testid="info-sheet" className="flex flex-col gap-2 text-[15px]">
        {children}
      </div>
    </Sheet>
  );
}
