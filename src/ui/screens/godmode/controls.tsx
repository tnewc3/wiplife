import { useId, useState, type ReactNode } from 'react';

/** A collapsible group of the editor. Its heading is a 44px button; a refusal can open it and scroll to it. */
export function Group({ id, title, open, onToggle, notes, children }: { id: string; title: string; open: boolean; onToggle: () => void; notes?: string[]; children: ReactNode }) {
  const bodyId = useId();
  return (
    <section id={`god-area-${id}`} className="rounded-card border border-border bg-surface" data-testid={`god-group-${id}`}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left text-lg font-bold active:bg-surface-2"
        >
          <span>{title}</span>
          <span aria-hidden="true" className="text-muted">
            {open ? '−' : '+'}
          </span>
        </button>
      </h3>
      {notes && notes.length > 0 && (
        <ul className="px-4 pb-2 text-sm text-danger" aria-label={`${title}: problems`} data-testid={`god-notes-${id}`}>
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div id={bodyId} hidden={!open} className="flex flex-col gap-4 px-4 pb-4">
        {children}
      </div>
    </section>
  );
}

export function Toggle({ label, checked, onChange, note, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; note?: string; disabled?: boolean }) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <input type="checkbox" className="mt-2 size-5 shrink-0 accent-accent" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="py-2">
        {label}
        {note && <span className="block text-sm text-muted">{note}</span>}
      </span>
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({ label, value, options, onChange, hint }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; hint?: string | undefined }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text">
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Whole dollars, typed. Keeps what was typed while it is not yet a whole number. */
export function DollarField({ label, value, onChange, format, error }: { label: string; value: number; onChange: (value: number) => void; format: (value: number) => string; error?: string | undefined }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [typed, setTyped] = useState(false);
  const cleaned = text.replace(/[,\s$]/g, '');
  const valid = /^-?\d+$/.test(cleaned);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={typed ? text : String(value)}
        onChange={(e) => {
          setTyped(true);
          setText(e.target.value);
          const c = e.target.value.replace(/[,\s$]/g, '');
          if (/^-?\d+$/.test(c)) onChange(Number(c));
        }}
        onBlur={() => setTyped(false)}
        aria-invalid={typed && !valid ? true : undefined}
        className={`min-h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-base text-text ${typed && !valid ? 'border-danger' : 'border-border'}`}
      />
      <p className="text-xs text-muted">{format(value)}</p>
      {typed && !valid && <p className="text-sm text-danger">Whole dollars only.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-sm font-semibold text-danger active:bg-surface-2">
      {label.split(':')[0]}
    </button>
  );
}

/** A repeated row in a list. */
export function Row({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid={testId}>
      {children}
    </div>
  );
}
