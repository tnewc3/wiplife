import { useAppStore } from '../../store/appStore';
import { Button } from './Button';
import { Sheet } from './Sheet';

/** Confirms starting a new life when one is already in progress. */
export function ReplaceLifeSheet({
  open,
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const life = useAppStore((s) => s.life);
  const name = life ? `${life.character.name.first} ${life.character.name.last}` : 'your current character';
  return (
    <Sheet
      open={open}
      title="Start a new life?"
      onClose={onCancel}
      footer={
        <>
          <Button block onClick={onConfirm} disabled={busy}>
            Start a new life
          </Button>
          <Button variant="secondary" block onClick={onCancel} disabled={busy}>
            Keep playing
          </Button>
        </>
      }
    >
      <p className="break-words">This ends the life of {name}. It can’t be continued afterwards.</p>
    </Sheet>
  );
}
