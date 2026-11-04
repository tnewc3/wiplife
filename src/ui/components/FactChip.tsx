import type { ReactNode } from 'react';

/** A small fact on a card: "3 h a week", "$40 a year", "Members only". 12px, on the second surface. */
export function FactChip({ children, icon, gold = false, testId }: { children: ReactNode; icon?: ReactNode; gold?: boolean; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${gold ? 'bg-gold-surface text-gold' : 'bg-surface-2 text-text'}`}>
      {icon}
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

export type EffectTone = 'good' | 'risk' | 'neutral';

/**
 * What an option does, as a chip. The chips come from the option's effects in content (never written by hand), so they
 * cannot drift from what happens: good effects are green, risks amber.
 */
export function EffectChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: EffectTone }) {
  const color = tone === 'good' ? 'text-positive' : tone === 'risk' ? 'text-warning' : 'text-text';
  return (
    <span data-tone={tone} className={`inline-flex min-w-0 items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold ${color}`}>
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}
