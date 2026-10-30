import { Sheet } from './Sheet';

export interface SheetAction {
  id: string;
  label: string;
  detail?: string | undefined;
  danger?: boolean | undefined;
  disabled?: boolean | undefined;
  testId?: string | undefined;
  onSelect: () => void;
}

/** A bottom sheet of quick actions (U2): what a row's three dots open. Each action is a 56px row; choosing one closes the sheet. */
export function ActionSheet({ open, title, actions, onClose }: { open: boolean; title: string; actions: readonly SheetAction[]; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <ul aria-label={title} className="flex flex-col divide-y divide-border">
        {actions.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={a.disabled}
              data-testid={a.testId}
              onClick={() => {
                onClose();
                a.onSelect();
              }}
              className={`flex min-h-row w-full flex-col justify-center text-left disabled:opacity-50 ${a.danger ? 'text-negative' : ''}`}
            >
              <span className="text-base font-semibold">{a.label}</span>
              {a.detail && <span className="text-[13px] text-muted">{a.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
