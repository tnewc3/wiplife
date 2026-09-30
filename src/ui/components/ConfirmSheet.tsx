import { Button } from './Button';
import { Sheet } from './Sheet';

/** Asks before something that can't be undone. */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="danger" block onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" block onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="break-words">{body}</p>
    </Sheet>
  );
}
