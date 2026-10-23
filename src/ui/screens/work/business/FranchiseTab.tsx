import { useState } from 'react';
import { content } from '../../../../content';
import { BUSINESS_STYLES, type BusinessStyle } from '../../../../content/schemas';
import { getFranchiseOffer, type BusinessView } from '../../../../engine/selectors';
import type { LifeState } from '../../../../engine/types';
import { useAppStore } from '../../../../store/appStore';
import { Button } from '../../../components/Button';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Sheet } from '../../../components/Sheet';
import { FRANCHISE_CONDITION_LABELS, RISK_WORDS, money } from '../../../labels';

function SellSheet({ b, life, open, onClose }: { b: BusinessView; life: LifeState; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [cityId, setCityId] = useState(Object.keys(content.cities).sort().find((id) => id !== b.cityId) ?? b.cityId);
  const [style, setStyle] = useState<BusinessStyle>(b.style);
  const [royalty, setRoyalty] = useState(b.depth.franchise.royalties[0]!);
  const [personId, setPersonId] = useState<string | null>(null);
  const offer = getFranchiseOffer(life, b.id, cityId, style, content);
  const candidate = offer?.candidates.find((c) => c.personId === personId) ? personId : null;
  return (
    <Sheet open={open} title="Sell a franchise" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="franchise-sheet">
        <label htmlFor="fr-city" className="font-bold">
          City
        </label>
        <select id="fr-city" data-testid="franchise-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
          {Object.keys(content.cities)
            .sort()
            .map((id) => (
              <option key={id} value={id}>
                {content.cities[id]!.name}
              </option>
            ))}
        </select>
        <div role="radiogroup" aria-label="Style" className="flex flex-col gap-2">
          {BUSINESS_STYLES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)} data-testid={`franchise-style-${s}`} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${style === s ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {content.businesses[b.defId]?.styles[s].label ?? s}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Royalty" className="flex gap-2">
          {b.depth.franchise.royalties.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={royalty === r} onClick={() => setRoyalty(r)} data-testid={`franchise-royalty-${Math.round(r * 100)}`} className={`min-h-11 flex-1 rounded-xl border px-3 ${royalty === r ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {Math.round(r * 100)}%
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">A higher royalty brings you more and leaves the operator less to live on. The operator also needs the brand’s support, which costs you a little every year.</p>
        <h4 className="font-bold">Who runs it</h4>
        <div role="radiogroup" aria-label="Operator" className="flex flex-col gap-2">
          <button type="button" role="radio" aria-checked={candidate === null} onClick={() => setPersonId(null)} data-testid="franchise-operator-none" className={`min-h-11 rounded-xl border px-3 py-2 text-left ${candidate === null ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
            An operator you have not met
          </button>
          {(offer?.candidates ?? []).map((c) => (
            <button key={c.personId} type="button" role="radio" aria-checked={candidate === c.personId} onClick={() => setPersonId(c.personId)} data-testid={`franchise-operator-${c.personId}`} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${candidate === c.personId ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {c.name}, {c.age}
            </button>
          ))}
        </div>
        <p className="text-sm" role="status" data-testid="franchise-fee">
          The fee, paid into the business: {money(offer?.fee ?? 0)}.
        </p>
        <Button block disabled={busy} data-testid="franchise-confirm" onClick={() => void act('sell_franchise', { biz: { businessId: b.id, cityId, style, royalty, ...(candidate !== null ? { personId: candidate } : {}) } }).then(onClose)}>
          Sell it
        </Button>
      </div>
    </Sheet>
  );
}

/** B2: the Franchise tab: what it takes, what is met, a sheet to sell one, and the franchisees with last year's royalty and brand risk. */
export function FranchiseTab({ b, life, disabled }: { b: BusinessView; life: LifeState; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const [sell, setSell] = useState(false);
  const [end, setEnd] = useState<string | null>(null);
  const f = b.depth.franchise;
  return (
    <div data-testid={`franchise-${b.id}`}>
      <p className="mt-3 text-sm text-muted">A business that has earned it can license its name to a franchisee in another place, for a fee and a royalty on every sale. It is not a location you run, and its reputation is partly in their hands.</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid={`franchise-conditions-${b.id}`}>
        {f.conditions.map((c) => (
          <li key={c.key} className={c.met ? '' : 'text-muted'}>
            {c.met ? '✓' : '○'} {FRANCHISE_CONDITION_LABELS[c.key]!(c.need)}
          </li>
        ))}
      </ul>
      <Button block className="mt-3" disabled={disabled || !f.eligible} onClick={() => setSell(true)} data-testid={`franchise-open-${b.id}`}>
        Sell a franchise
      </Button>
      <h4 className="mt-5 text-base font-bold">
        Your franchises ({f.count} of {f.limit})
      </h4>
      {f.rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">None yet.</p>
      ) : (
        <>
          <p className="mt-1 text-sm" data-testid={`franchise-net-${b.id}`}>
            Last year, net of the brand’s support: {money(f.netYear)}.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {f.rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3" data-testid={`franchise-row-${r.id}`}>
                <p className="font-semibold break-words">
                  {r.city} · {r.style}
                </p>
                <p className="text-sm text-muted">
                  {r.operator} · since {r.since} · {Math.round(r.royalty * 100)}% royalty
                </p>
                <p className="text-sm">
                  {r.revenue > 0 ? `Last year: ${money(r.revenue)} in sales, ${money(r.royaltyPaid)} to you, ${money(r.support)} in support.` : 'No full year yet.'}
                </p>
                <p className="text-sm text-muted">{RISK_WORDS(r.risk)}</p>
                <Button variant="ghost" disabled={disabled} onClick={() => setEnd(r.id)} data-testid={`franchise-end-${r.id}`}>
                  End it
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <SellSheet b={b} life={life} open={sell} onClose={() => setSell(false)} />
      <ConfirmSheet open={end !== null} title="End this franchise?" confirmLabel="End it" onCancel={() => setEnd(null)} onConfirm={() => {
        const id = end;
        setEnd(null);
        if (id) void act('end_franchise', { biz: { businessId: b.id, franchiseId: id, how: 'end' } });
      }} body="The sign comes down. The operator will remember how it ended, and a poorly run franchise can hurt your name a little on the way out." />
    </div>
  );
}
