import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { TextField } from './TextField';

/**
 * A small dialog with one text field (U3): rename a band. Feature screens and sheets hold no text inputs; this is where
 * one lives. It opens from an overflow menu and closes on Save, Cancel or Escape.
 */
export function RenameDialog(props: RenameDialogProps) {
  return props.open ? createPortal(<Dialog {...props} />, document.body) : null;
}

interface RenameDialogProps {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  error?: ((text: string) => string | undefined) | undefined;
  maxLength?: number;
  multiline?: boolean;
  allowSame?: boolean;
  hint?: string;
  testId?: string;
  saveTestId?: string;
  saveLabel?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

function Dialog({ title, label, initial, error, maxLength = 60, multiline = false, allowSame = false, hint, testId = 'rename-input', saveTestId = 'rename-save', saveLabel = 'Save', onSave, onCancel, busy = false }: RenameDialogProps) {
  const titleId = useId();
  const [text, setText] = useState(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const problem = error?.(text);
  const unchanged = !allowSame && text.trim() === initial.trim();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-scrim animate-[wl-fade-in_150ms_ease-out]" aria-hidden="true" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-surface p-5 shadow-xl">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        {multiline ? (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {label}
            <textarea className="min-h-28 w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-base font-normal text-text" value={text} onChange={(e) => setText(e.target.value)} data-testid={testId} autoFocus />
            {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
            {problem && <span className="text-sm font-normal text-danger">{problem}</span>}
          </label>
        ) : (
          <TextField label={label} value={text} onChange={setText} maxLength={maxLength} error={problem} {...(hint ? { hint } : {})} data-testid={testId} autoFocus />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={busy || problem !== undefined || unchanged} onClick={() => onSave(text)} data-testid={saveTestId}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
