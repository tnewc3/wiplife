import type { ReactNode } from 'react';
import { Button } from './Button';
import { FeatureScreen, type FeatureScreenProps } from './FeatureScreen';
import { FactChip } from './FactChip';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import type { TileTone } from './ActionTile';

/**
 * A shop (U3): a full screen with the balance in the header line, filter chips and a two-column grid of item cards. Tapping a
 * card opens its detail sheet. The luxury stores use the gold tokens.
 */
export function StoreScreen({ balance, chips, children, gold = false, ...screen }: Omit<FeatureScreenProps, 'children'> & { balance: string; chips?: ReactNode; children: ReactNode; gold?: boolean }) {
  return (
    <FeatureScreen {...screen}>
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-sm font-semibold text-muted">Your savings</span>
        <span className={`font-display text-lg font-semibold tabular-nums ${gold ? 'text-gold' : ''}`} data-testid="store-balance">
          {balance}
        </span>
      </div>
      {chips}
      <ul className="grid grid-cols-2 gap-2" aria-label={screen.title}>
        {children}
      </ul>
    </FeatureScreen>
  );
}

/** One item of a shop: an art tile (Fluent Emoji on a tint per item type), its name, one fact line and its price. */
export function ItemCard({ name, fact, price, icon, tone = 'money', owned = false, reason, onClick, gold = false, testId }: { name: string; fact?: string | undefined; price: string; icon: string; tone?: TileTone; owned?: boolean; /** "Needs $40 more": greys the card. */ reason?: string | undefined; onClick: () => void; gold?: boolean; testId?: string }) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        aria-disabled={reason ? true : undefined}
        className={`wl-press flex h-full min-h-44 w-full min-w-0 flex-col gap-1.5 rounded-2xl border p-2 text-left ${gold ? 'border-gold-border bg-gold-surface' : 'border-border bg-surface'} ${reason ? 'opacity-60' : ''}`}
      >
        <span className="relative flex h-20 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, var(--wl-cat-${tone}) 28%, var(--wl-surface-2))` }}>
          <Icon id={icon} size={48} />
          {owned && (
            <span className="absolute top-1 right-1">
              <FactChip>Owned</FactChip>
            </span>
          )}
        </span>
        <span className={`font-display text-[15px] leading-tight font-semibold [overflow-wrap:anywhere] ${gold ? 'text-gold' : ''}`}>{name}</span>
        {fact && <span className="text-xs text-muted [overflow-wrap:anywhere]">{fact}</span>}
        <span className={`font-display mt-auto text-base font-bold tabular-nums ${gold ? 'text-gold' : ''}`}>{reason ?? price}</span>
      </button>
    </li>
  );
}

export interface ItemDetail {
  name: string;
  icon: string;
  tone?: TileTone;
  /** Upkeep, insurance, condition, value: label and value. */
  facts: [string, string][];
  /** One line about it. */
  blurb?: string | undefined;
  price: string;
  owned: boolean;
  gold?: boolean;
}

/** The detail sheet of an item: larger art, its facts, and Buy (cash, or a loan where the shop allows one) or Sell when it is yours. */
export function ItemDetailSheet({ open, item, onClose, onBuy, onLoan, onSell, reason, busy = false, extra }: { open: boolean; item: ItemDetail | null; onClose: () => void; onBuy?: () => void; /** Where a loan is allowed. */ onLoan?: (() => void) | undefined; onSell?: (() => void) | undefined; reason?: string | undefined; busy?: boolean; /** Choices that go with the buy (who comes along, a look). */ extra?: ReactNode }) {
  if (!item) return null;
  return (
    <Sheet
      open={open}
      title={item.name}
      onClose={onClose}
      footer={
        item.owned ? (
          onSell && (
            <Button variant="danger" block onClick={onSell} disabled={busy} data-testid="item-sell">
              Sell
            </Button>
          )
        ) : (
          <>
            <Button block onClick={onBuy} disabled={busy || reason !== undefined} data-testid="item-buy">
              {reason ?? `Buy · ${item.price}`}
            </Button>
            {onLoan && (
              <Button variant="secondary" block onClick={onLoan} disabled={busy} data-testid="item-loan">
                Buy with a loan
              </Button>
            )}
          </>
        )
      }
    >
      <div data-testid="item-detail" className="flex flex-col gap-3">
        <span className="flex h-36 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, var(--wl-cat-${item.tone ?? 'money'}) 28%, var(--wl-surface-2))` }}>
          <Icon id={item.icon} size={96} />
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`font-display text-xl font-semibold ${item.gold ? 'text-gold' : ''}`}>{item.name}</span>
          <span className={`font-display text-xl font-bold tabular-nums ${item.gold ? 'text-gold' : ''}`}>{item.price}</span>
        </div>
        {item.blurb && <p className="text-muted">{item.blurb}</p>}
        {item.facts.length > 0 && (
          <dl className="divide-y divide-border rounded-2xl border border-border">
            {item.facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {extra}
      </div>
    </Sheet>
  );
}
