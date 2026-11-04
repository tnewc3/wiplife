import { useEffect, useId, useState } from 'react';
import { Button } from './Button';
import { TextField } from './TextField';

/**
 * A small dialog with one text field (U3): rename a band. Feature screens and sheets hold no text inputs; this is where
 * one lives. It opens from an overflow menu and closes on Save, Cancel or Escape.
 */
export function RenameDialog({ open, title, label, initial, error, maxLength = 60, onSave, onCancel, busy = false }: { open: boolean; title: string; label: string; initial: string; /** The reason the text can't be saved, or undefined. */ error?: (text: string) => string | undefined; maxLength?: number; onSave: (text: string) => void; onCancel: () => void; busy?: boolean }) {
  const titleId = useId();
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const problem = error?.(text);
  const unchanged = text.trim() === initial.trim();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-scrim animate-[wl-fade-in_150ms_ease-out]" aria-hidden="true" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-surface p-5 shadow-xl">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <TextField label={label} value={text} onChange={setText} maxLength={maxLength} error={problem} data-testid="rename-input" autoFocus />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={busy || problem !== undefined || unchanged} onClick={() => onSave(text)} data-testid="rename-save">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
