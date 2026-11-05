export interface FilterChip<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

/** A row of filter chips that scrolls sideways. One is on at a time. Each chip is 44px tall. */
export function FilterChips<T extends string>({ chips, value, onChange, label, wrap = false }: { chips: readonly FilterChip<T>[]; value: T; onChange: (id: T) => void; label: string; /** Wrap onto several lines instead of scrolling sideways (a choice inside a sheet). */ wrap?: boolean }) {
  return (
    <div role="group" aria-label={label} className={wrap ? 'flex flex-wrap gap-2' : '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1'}>
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

/**
 * A choice of one from a few options (U3): chips instead of a dropdown. It has a label above it; each chip's test id is
 * `${testId}-${option id}`. Use it for the settings of a plan (a destination, a route, a role).
 */
export function ChipSelect<T extends string>({ label, value, onChange, options, testId }: { label: string; value: T; onChange: (id: T) => void; options: readonly { id: T; label: string }[]; testId?: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-sm font-semibold">{label}</span>
      <FilterChips wrap label={label} value={value} onChange={onChange} chips={options.map((o) => ({ id: o.id, label: o.label, ...(testId ? { testId: `${testId}-${o.id}` } : {}) }))} />
    </div>
  );
}
