import { useState } from 'react';
import { content } from '../../../../content';
import { BUSINESS_STYLES, type BusinessStyle } from '../../../../content/schemas';
import type { BusinessView } from '../../../../engine/selectors';
import type { LifeState } from '../../../../engine/types';
import { useAppStore } from '../../../../store/appStore';
import { Button } from '../../../components/Button';
import { Sheet } from '../../../components/Sheet';
import { money } from '../../../labels';

export function ExpandSheet({ b, life, open, onClose }: { b: BusinessView; life: LifeState; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [cityId, setCityId] = useState(b.cityId);
  const [style, setStyle] = useState<BusinessStyle>(b.style);
  const [funding, setFunding] = useState<'savings' | 'loan'>('savings');
  const cost = b.expandCosts[style];
  const afford = funding === 'loan' || life.finances.savings >= cost;
  return (
    <Sheet open={open} title="Open a new location" onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="expand-sheet">
        <label htmlFor="expand-city" className="font-bold">
          City
        </label>
        <select id="expand-city" data-testid="expand-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
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
            <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)} data-testid={`expand-style-${s}`} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${style === s ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {content.businesses[b.defId]?.styles[s].label ?? s} · {money(b.expandCosts[s])}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Pay with" className="flex gap-2">
          {(['savings', 'loan'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={funding === f} onClick={() => setFunding(f)} data-testid={`expand-funding-${f}`} className={`min-h-11 flex-1 rounded-xl border px-3 ${funding === f ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {f === 'savings' ? 'Your savings' : 'A business loan'}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted" role="status">
          {funding === 'savings' ? (afford ? `${money(cost)} from savings. Savings now: ${money(life.finances.savings)}.` : 'You don’t have enough savings.') : `A loan for ${money(cost)} at the business loan rate, subject to the bank.`}
        </p>
        <Button block disabled={busy || !afford} data-testid="expand-confirm" onClick={() => void act('open_location', { biz: { businessId: b.id, cityId, style, funding } }).then(onClose)}>
          Open it
        </Button>
      </div>
    </Sheet>
  );
}
