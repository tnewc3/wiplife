import { useState } from 'react';
import type { BusinessView } from '../../../../engine/selectors';
import type { LifeState } from '../../../../engine/types';
import { useAppStore } from '../../../../store/appStore';
import { Button } from '../../../components/Button';
import { PLACE_STOCK_WORDS, money } from '../../../labels';
import { ExpandSheet } from './ExpandSheet';

/** B2: the Places tab: each location with its city, style, manager, headcount, stock and last year's result; open and close. */
export function PlacesTab({ b, life, disabled }: { b: BusinessView; life: LifeState; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const [expand, setExpand] = useState(false);
  const d = b.depth;
  return (
    <div data-testid={`places-${b.id}`}>
      <p className="mt-3 text-sm text-muted">
        {d.places.length} of {d.maxLocations} locations. Each one takes a share of the trade in its city, and whoever runs several of them is spread thinner.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {d.places.map((l) => (
          <li key={l.id} className="rounded-xl border border-border p-3" data-testid={`place-${l.id}`}>
            <p className="font-semibold break-words">
              {l.city} · {l.style}
            </p>
            <p className="text-sm text-muted">
              Open since {l.opened} · {l.manager ? `managed by ${l.manager}` : b.role === 'self' ? 'run by you where you are' : 'run through the general manager'}
            </p>
            <p className="text-sm text-muted" data-testid={`place-people-${l.id}`}>
              {l.heads} {l.heads === 1 ? 'person' : 'people'} ({l.crew} crew) · {PLACE_STOCK_WORDS[l.stock]}
            </p>
            <p className="text-sm">{l.profit === null ? 'No year yet.' : `Last year ${money(l.revenue)} in sales, ${l.profit >= 0 ? 'profit' : 'loss'} of ${money(Math.abs(l.profit))}.`}</p>
            {d.places.length > 1 && (
              <Button variant="ghost" disabled={disabled} onClick={() => void act('close_location', { biz: { businessId: b.id, locationId: l.id } })} data-testid={`close-location-${l.id}`}>
                Close it
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="secondary" block className="mt-2" disabled={disabled || !b.canExpand} onClick={() => setExpand(true)} data-testid={`expand-open-${b.id}`}>
        Open a new location
      </Button>
      <ExpandSheet b={b} life={life} open={expand} onClose={() => setExpand(false)} />
    </div>
  );
}
