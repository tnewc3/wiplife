import type { ReactNode } from 'react';
import { lightHaptic } from '../haptics';
import { Icon } from './Icon';
import { FactChip } from './FactChip';
import { Sheet } from './Sheet';

/**
 * How fresh an activity still is this year, as pips. The diminishing-returns counters are the engine's (times done, and the
 * most): all pips lit while it is fresh, fewer with each repeat, none at the limit.
 */
export function freshnessOf(done: number, limit: number, pips = 4): { lit: number; pips: number; word: string } {
  const left = Math.max(0, limit - done);
  const lit = limit <= 0 ? 0 : done <= 0 ? pips : Math.max(left > 0 ? 1 : 0, Math.round((left / limit) * pips));
  return { lit, pips, word: done <= 0 ? 'Fresh' : left === 0 ? 'Worn out' : lit >= pips - 1 ? 'Fresh' : lit >= 2 ? 'Fine' : 'Stale' };
}

export function FreshnessPips({ done, limit }: { done: number; limit: number }) {
  const f = freshnessOf(done, limit);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-muted" data-testid="freshness" role="img" aria-label={`${f.word}: ${f.lit} of ${f.pips}`}>
      <span aria-hidden="true">{f.word}</span>
      <span aria-hidden="true" className="tracking-tighter">
        {'●'.repeat(f.lit)}
        {'○'.repeat(f.pips - f.lit)}
      </span>
    </span>
  );
}

/**
 * The sheet of an activity's options (U3): an icon, the title and one line on the left, the balance and the freshness on the
 * right, then a card for each option. A card does it with one tap. It holds no tabs, accordions, text fields or other sheets.
 */
export function OptionPickerSheet({ open, title, icon, line, balance, freshness, onClose, children, footnote, gold = false, testId }: { open: boolean; title: string; icon?: string | undefined; line?: string | undefined; balance?: string | undefined; freshness?: { done: number; limit: number } | undefined; onClose: () => void; children: ReactNode; /** One line, at most. */ footnote?: string | undefined; gold?: boolean; testId?: string }) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      header={
        <div className="flex items-start gap-3">
          {icon && <Icon id={icon} size={36} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={`font-display text-xl leading-tight font-bold [overflow-wrap:anywhere] ${gold ? 'text-gold' : ''}`} aria-hidden="true">
              {title}
            </span>
            {line && <span className="text-sm text-muted [overflow-wrap:anywhere]">{line}</span>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {balance && (
              <span className={`font-display text-base font-semibold tabular-nums ${gold ? 'text-gold' : ''}`} data-testid="picker-balance">
                {balance}
              </span>
            )}
            {freshness && <FreshnessPips done={freshness.done} limit={freshness.limit} />}
          </div>
        </div>
      }
    >
      <div data-testid={testId} className="flex flex-col gap-2">
        {children}
        {footnote && <p className="px-1 text-xs text-muted">ⓘ {footnote}</p>}
      </div>
    </Sheet>
  );
}

/**
 * One option of a picker: its name, effect chips and a price chip. The whole card is the button. When it can't be used it is
 * greyed and the reason is the chip ("Needs $40 more", "18+").
 */
export function OptionCard({ name, chips, price, reason, onClick, testId, children, gold = false }: { name: string; /** EffectChips and FactChips. */ chips?: ReactNode; price?: string | undefined; /** Why it can't be done now; shows in place of the price. */ reason?: string | undefined; onClick?: (() => void) | undefined; testId?: string | undefined; children?: ReactNode; gold?: boolean }) {
  const off = reason !== undefined;
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border ${gold ? 'border-gold-border bg-gold-surface' : 'border-border bg-surface'} ${off ? 'opacity-60' : ''}`}>
      <button
        type="button"
        data-testid={testId}
        aria-disabled={off ? true : undefined}
        onClick={() => {
          if (off || !onClick) return;
          lightHaptic();
          onClick();
        }}
        className="wl-press flex min-h-14 w-full min-w-0 flex-col gap-1.5 rounded-2xl px-3 py-2.5 text-left"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-display min-w-0 flex-1 text-base leading-tight font-semibold [overflow-wrap:anywhere]">{name}</span>
          {off ? <FactChip>{reason}</FactChip> : price && <FactChip gold={gold}>{price}</FactChip>}
        </span>
        {chips && <span className="flex flex-wrap gap-1">{chips}</span>}
      </button>
      {children && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}
