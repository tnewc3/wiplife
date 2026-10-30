import { useId } from 'react';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

/**
 * In-screen tabs (U2): a segmented control at the top of a screen with more than two sections or about 12 rows. Each
 * button is at least 44px tall. The panel it controls is the caller's: render only the selected section.
 */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly SegmentedTab<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const base = useId();
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-2xl bg-surface-2 p-1">
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={selected}
            data-testid={t.testId}
            onClick={() => onChange(t.id)}
            className={`min-h-11 min-w-0 flex-1 truncate rounded-xl px-2 text-sm font-bold ${selected ? 'bg-surface text-link shadow-sm' : 'text-muted'}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
