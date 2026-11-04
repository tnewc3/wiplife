import { Button } from './Button';

/** Nothing here yet: one line and, at most, one button. */
export function EmptyState({ text, action, onAction, testId }: { text: string; action?: string; onAction?: () => void; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-muted">{text}</p>
      {action && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
