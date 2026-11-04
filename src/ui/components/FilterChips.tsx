export interface FilterChip<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

/** A row of filter chips that scrolls sideways. One is on at a time. Each chip is 44px tall. */
export function FilterChips<T extends string>({ chips, value, onChange, label }: { chips: readonly FilterChip<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={c.id === value}
          data-testid={c.testId}
          onClick={() => onChange(c.id)}
          className={`wl-press min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${c.id === value ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface text-text'}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
