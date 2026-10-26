import { ORDER_LEVELS, PRICE_LEVELS } from '../../../../content/schemas';
import type { BusinessView, LineView } from '../../../../engine/selectors';
import { useAppStore } from '../../../../store/appStore';
import { LINE_BLOCK_LABELS, ORDER_HINTS, ORDER_LABELS, PRICE_LABELS, STOCK_WORDS, SUPPLIER_ARROWS, SUPPLIER_MOODS, money } from '../../../labels';

function Choice<T extends string>({ label, list, value, labels, disabled, testId, onPick }: { label: string; list: readonly T[]; value: T; labels: Record<T, string>; disabled: boolean; testId: string; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-1 flex gap-2">
      {list.map((level) => (
        <button key={level} type="button" role="radio" aria-checked={value === level} disabled={disabled} data-testid={`${testId}-${level}`} onClick={() => onPick(level)} className={`min-h-11 flex-1 rounded-xl border px-2 text-sm ${value === level ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
          {labels[level]}
        </button>
      ))}
    </div>
  );
}

const marginWord = (m: number): string => (m >= 0.6 ? 'a very good margin' : m >= 0.4 ? 'a good margin' : m >= 0.2 ? 'a thin margin' : m > 0 ? 'barely any margin' : 'a loss on each sale');

function LineRow({ b, l, disabled }: { b: BusinessView; l: LineView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const id = `${b.id}-${l.productId}`;
  const last = l.last;
  return (
    <li className="rounded-xl border border-border p-3" data-testid={`line-${id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 font-semibold break-words">{l.name}</p>
        <span className="shrink-0 text-sm text-muted" data-testid={`line-supplier-${id}`}>
          {SUPPLIER_ARROWS[l.supplier.mood]} {l.supplier.label} {SUPPLIER_MOODS[l.supplier.mood]}
        </span>
      </div>
      <p className="text-sm text-muted" data-testid={`line-margin-${id}`}>
        {marginWord(l.margin)} ({Math.round(l.margin * 100)}%)
        {l.core ? ' · on the menu' : ''}
      </p>
      {l.on ? (
        <>
          <p className="mt-2 text-sm font-semibold">Price</p>
          <Choice label={`Price of ${l.name}`} list={PRICE_LEVELS} value={l.price} labels={PRICE_LABELS} disabled={disabled} testId={`line-price-${id}`} onPick={(price) => void act('set_line', { biz: { businessId: b.id, productId: l.productId, price } })} />
          {b.depth.mode !== 'services' && (
            <>
              <p className="mt-2 text-sm font-semibold">Order for next year</p>
              <Choice label={`Order of ${l.name}`} list={ORDER_LEVELS} value={l.order} labels={ORDER_LABELS} disabled={disabled} testId={`line-order-${id}`} onPick={(level) => void act('set_order', { biz: { businessId: b.id, stockId: l.stockId, level } })} />
              <p className="mt-1 text-xs text-muted">{ORDER_HINTS[l.order]}</p>
            </>
          )}
          <p className="mt-2 text-sm" data-testid={`line-last-${id}`}>
            {last ? `Last year: ${last.sold.toLocaleString('en-US')} ${b.depth.mode === 'services' ? 'jobs' : 'sold'}${last.lost > 0 ? `, ${last.lost.toLocaleString('en-US')} turned away` : ''}${last.spoiled > 0 ? `, ${last.spoiled.toLocaleString('en-US')} spoiled` : ''} · ${STOCK_WORDS[l.stock]}` : STOCK_WORDS.new}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Not sold.</p>
      )}
      {!l.core && b.depth.mode !== 'services' && l.soldHere && (
        <button type="button" disabled={disabled || (!l.on && l.blocked !== null)} data-testid={`line-toggle-${id}`} onClick={() => void act('set_line', { biz: { businessId: b.id, productId: l.productId, on: !l.on } })} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3 text-sm">
          {l.on ? 'Stop selling it' : `Start selling it · ${money(l.fee)} to restock`}
        </button>
      )}
      {!l.core && b.depth.mode === 'services' && l.soldHere && (
        <button type="button" disabled={disabled} data-testid={`line-toggle-${id}`} onClick={() => void act('set_line', { biz: { businessId: b.id, productId: l.productId, on: !l.on } })} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3 text-sm">
          {l.on ? 'Stop offering it' : `Start offering it · ${money(l.fee)}`}
        </button>
      )}
      {!l.on && l.blocked !== null && <p className="mt-1 text-xs text-muted">{LINE_BLOCK_LABELS[l.blocked] ?? ''}</p>}
    </li>
  );
}

/** B2: the Products tab: each line's price and order, last year's sales, and (for a shop) which lines it carries. */
export function ProductsTab({ b, disabled }: { b: BusinessView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const d = b.depth;
  const on = d.lines.filter((l) => l.on).length;
  return (
    <div data-testid={`products-${b.id}`}>
      {d.mode === 'choose' && (
        <p className="mt-3 text-sm" data-testid={`line-count-${b.id}`}>
          Choose what you sell: {on} of {d.lineLimit} lines.
        </p>
      )}
      {d.mode === 'services' && <p className="mt-3 text-sm text-muted">Services draw on supplies instead of shelves. Order each supply below.</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {d.lines
          .filter((l) => l.soldHere)
          .map((l) => (
            <LineRow key={l.productId} b={b} l={l} disabled={disabled} />
          ))}
      </ul>
      {d.pools.length > 0 && (
        <section className="mt-5" aria-label="Supplies">
          <h4 className="text-base font-bold">Supplies</h4>
          <ul className="mt-2 flex flex-col gap-3">
            {d.pools.map((p) => (
              <li key={p.id} className="rounded-xl border border-border p-3" data-testid={`pool-${b.id}-${p.id}`}>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-muted">
                  {SUPPLIER_ARROWS[p.supplier.mood]} {p.supplier.label} {SUPPLIER_MOODS[p.supplier.mood]}
                  {p.usedBy.length > 0 ? ` · used for ${p.usedBy.join(', ').toLowerCase()}` : ''}
                </p>
                <Choice label={`Order of ${p.name}`} list={ORDER_LEVELS} value={p.order} labels={ORDER_LABELS} disabled={disabled} testId={`pool-order-${b.id}-${p.id}`} onPick={(level) => void act('set_order', { biz: { businessId: b.id, stockId: p.id, level } })} />
                <p className="mt-1 text-xs text-muted">{ORDER_HINTS[p.order]}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
