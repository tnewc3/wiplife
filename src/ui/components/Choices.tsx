import type { ReactNode } from 'react';

export interface Choice<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  name?: string;
}

interface BaseProps<T extends string | number> {
  label: string;
  choices: Choice<T>[];
  error?: string | undefined;
  /** Lay choices out in columns instead of wrapping chips. */
  columns?: 1 | 2 | 3;
}

function Frame({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      {children}
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

const chipClass = (selected: boolean) =>
  `min-h-11 min-w-11 rounded-xl border px-3 py-2 text-sm font-semibold break-words transition-colors ${
    selected ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface text-text active:bg-surface-2'
  }`;

const layout = (columns?: 1 | 2 | 3) =>
  columns ? `grid gap-2 ${columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}` : 'flex flex-wrap gap-2';

/** Pick exactly one. */
export function SingleChoice<T extends string | number>({
  label,
  choices,
  value,
  onChange,
  error,
  columns,
}: BaseProps<T> & { value: T | null; onChange: (value: T) => void }) {
  return (
    <Frame label={label} error={error}>
      <div role="radiogroup" aria-label={label} className={layout(columns)}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={c.value === value}
            aria-label={c.name}
            onClick={() => onChange(c.value)}
            className={chipClass(c.value === value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </Frame>
  );
}

/** Pick any number, including none. */
export function MultiChoice<T extends string | number>({
  label,
  choices,
  value,
  onChange,
  error,
  columns,
}: BaseProps<T> & { value: T[]; onChange: (value: T[]) => void }) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Frame label={label} error={error}>
      <div className={layout(columns)}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={value.includes(c.value)}
            aria-label={c.name}
            onClick={() => toggle(c.value)}
            className={chipClass(value.includes(c.value))}
          >
            {c.label}
          </button>
        ))}
      </div>
    </Frame>
  );
}

/** Quick-fill suggestions under a free-text field. */
export function Suggestions({ options, onPick, label }: { options: string[]; onPick: (value: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label={label} role="group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className="min-h-11 rounded-full border border-border bg-surface-2 px-3 text-sm text-text active:bg-surface"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
