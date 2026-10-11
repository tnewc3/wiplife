import { useMemo, useState } from 'react';
import { content } from '../../../content';
import type { OwnerRole } from '../../../content/schemas';
import type { FundingPlan } from '../../../engine/business/funding';
import { getFundingCheck, getMarketView, type ListingView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Sheet } from '../../components/Sheet';
import { BUSINESS_BLOCK_LABELS, BUSINESS_ROLE_BLURBS, BUSINESS_ROLE_LABELS, money } from '../../labels';
import { FundingPicker } from './FundingPicker';

function BuySheet({ life, listing, onClose }: { life: LifeState; listing: ListingView; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [plan, setPlan] = useState<FundingPlan>({ source: 'savings' });
  const [role, setRole] = useState<OwnerRole>(listing.kind === 'chain' ? 'manager' : listing.cities.some((c) => c !== content.cities[life.character.cityId]?.name) ? 'manager' : 'self');
  const defId = Object.keys(content.businesses).find((id) => content.businesses[id]!.noun === listing.noun);
  const check = getFundingCheck(life, listing.price, plan, defId, content);
  const full = life.business.items.length >= content.balance.business.limits.businesses;
  return (
    <Sheet open title={listing.name} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="buy-sheet">
        <p className="text-sm text-muted">
          {listing.styleLabel} · {listing.noun} · {listing.cities.join(', ')}
        </p>
        <p>{listing.trait}.</p>
        <dl className="flex flex-col">
          <div className="flex justify-between py-1">
            <dt>Asking price</dt>
            <dd className="font-semibold tabular-nums" data-testid="buy-price">{money(listing.price)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>A typical year’s profit</dt>
            <dd className="tabular-nums">{money(listing.profit)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>Sales in a typical year</dt>
            <dd className="tabular-nums">{money(listing.revenue)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>Running for</dt>
            <dd>{listing.years} years</dd>
          </div>
        </dl>
        <div role="radiogroup" aria-label="Who runs it" className="flex flex-col gap-2">
          {(['self', 'manager'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} data-testid={`buy-role-${r}`} className={`min-h-11 rounded-xl border px-3 py-2 text-left ${role === r ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
              {BUSINESS_ROLE_LABELS[r]}
              <span className="block text-sm font-normal text-muted">{BUSINESS_ROLE_BLURBS[r]}</span>
            </button>
          ))}
        </div>
        <FundingPicker life={life} need={listing.price} defId={defId} plan={plan} onChange={setPlan} />
        {full && <p className="text-sm text-muted">{BUSINESS_BLOCK_LABELS.full}.</p>}
        <Button block disabled={busy || full || check.block !== null} data-testid="buy-confirm" onClick={() => void act('buy_business', { biz: { listingId: listing.id, plan, role } }).then(() => onClose())}>
          Buy {listing.name}
        </Button>
      </div>
    </Sheet>
  );
}

/** W3: the "For sale" market: established businesses and fictional chains in each city, priced from their earnings. */
export function MarketSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const [cityId, setCityId] = useState(life.character.cityId);
  const [buying, setBuying] = useState<ListingView | null>(null);
  const listings = useMemo(() => getMarketView(life, cityId, content), [life, cityId]);
  return (
    <>
      <Sheet open={open && buying === null} title="For sale" onClose={onClose}>
        <div className="flex flex-col gap-3" data-testid="market">
          <label htmlFor="market-city" className="font-bold">
            City
          </label>
          <select id="market-city" data-testid="market-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3">
            {Object.keys(content.cities)
              .sort()
              .map((id) => (
                <option key={id} value={id}>
                  {content.cities[id]!.name}
                </option>
              ))}
          </select>
          {listings.length === 0 && <p className="text-muted">Nothing is for sale here right now.</p>}
          <ul className="flex flex-col gap-3">
            {listings.map((l) => (
              <li key={l.id}>
                <Card data-testid={`listing-${l.id}`}>
                  <h3 className="font-bold break-words">{l.name}</h3>
                  <p className="text-sm text-muted">
                    {l.kind === 'chain' ? `Chain · ${l.locations} locations` : l.styleLabel} · {l.noun}
                  </p>
                  <p className="mt-1 text-sm">{l.trait}.</p>
                  <p className="mt-1">
                    <span className="font-semibold tabular-nums">{money(l.price)}</span> <span className="text-sm text-muted">· earns about {money(l.profit)} a year</span>
                  </p>
                  <Button variant="secondary" block className="mt-2" onClick={() => setBuying(l)} data-testid={`listing-open-${l.id}`}>
                    Look closer
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
      {buying && <BuySheet life={life} listing={buying} onClose={() => { setBuying(null); }} />}
    </>
  );
}
