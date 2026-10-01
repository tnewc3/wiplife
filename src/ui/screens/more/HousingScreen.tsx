import { useState } from 'react';
import { content } from '../../../content';
import { getHomeView, type CityMove } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { homeConfirmation, housingLine, money, PURCHASE_BLOCK_LABELS } from '../../labels';

type Pending =
  | { action: 'rent_home' | 'move_home' | 'buy_home' | 'sell_home' }
  | { action: 'relocate'; city: CityMove };

/** More → Home: where you live, what it costs, and the moves you can make now. */
export function HousingScreen({ life }: { life: LifeState }) {
  const view = getHomeView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [pending, setPending] = useState<Pending | null>(null);
  const disabled = busy || !view.between;

  const confirmation = (() => {
    if (!pending) return null;
    switch (pending.action) {
      case 'rent_home':
        return homeConfirmation('rent_home', { city: view.cityName, cost: view.rent?.moveInCost ?? 0 });
      case 'move_home':
        return homeConfirmation('move_home', { name: view.moveHome?.name ?? '', city: view.moveHome?.cityName ?? '' });
      case 'relocate':
        return homeConfirmation('relocate', { city: pending.city.name, cost: pending.city.moveInCost });
      case 'buy_home':
        return homeConfirmation('buy_home', {
          city: view.cityName,
          price: view.buy?.price ?? 0,
          down: view.buy?.downPayment ?? 0,
          payment: view.buy?.yearlyPayment ?? 0,
        });
      case 'sell_home':
        return homeConfirmation('sell_home', { city: view.cityName, proceeds: view.sell ?? 0 });
    }
  })();

  const costLine =
    view.kind === 'owned'
      ? `Property tax and upkeep: ${money(view.annualCost)} a year`
      : view.kind === 'renting'
        ? `Rent: ${money(view.annualCost)} a year${view.roommate ? ', shared with a roommate' : ''}`
        : view.kind === 'with_parents'
          ? view.annualCost > 0
            ? `You chip in ${money(view.annualCost)} a year toward rent`
            : 'Your family covers your rent'
          : view.kind === 'incarcerated'
            ? view.homeValue !== null
              ? `Your home waits for you. Property tax and upkeep: ${money(view.annualCost)} a year`
              : 'A cell, a bunk and a locker, until your release'
            : 'No rent, no roof';

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="home-title">
        <h2 id="home-title" className="text-2xl leading-tight font-bold break-words" data-testid="housing-line">
          {housingLine(view.kind, view.cityName)}
        </h2>
        <p className="mt-1 text-muted">{costLine}</p>
        {view.partnerName && (
          <p className="mt-1 text-muted" data-testid="partner-line">
            {view.kind === 'incarcerated'
              ? `${view.partnerName} still lives there and pays their share`
              : `Living with ${view.partnerName}, who pays their share`}
          </p>
        )}
        {view.homeValue !== null && (
          <p className="mt-1 text-muted">
            Worth about {money(view.homeValue)}
            {view.mortgage > 0 ? ` · Mortgage ${money(view.mortgage)}` : ' · Paid off'}
          </p>
        )}
        {!view.independent && <p className="mt-2">You live with your family until you’re old enough to decide for yourself.</p>}
      </Card>

      {view.independent && (
        <div className="flex flex-col gap-2" role="group" aria-label="Home actions">
          {view.rent && (
            <>
              <Button block variant="secondary" disabled={disabled || !view.rent.affordable} onClick={() => setPending({ action: 'rent_home' })}>
                {view.kind === 'with_parents' ? 'Move out' : 'Rent a place'} · {money(view.rent.moveInCost)} up front
              </Button>
              {!view.rent.affordable && <p className="text-sm text-muted">You need {money(view.rent.moveInCost)} saved for moving and a deposit.</p>}
            </>
          )}
          {view.moveHome && (
            <Button block variant="secondary" disabled={disabled} onClick={() => setPending({ action: 'move_home' })}>
              Move back in with {view.moveHome.name}
            </Button>
          )}
          {view.roommateAction && (
            <Button block variant="secondary" disabled={disabled} onClick={() => void act(view.roommateAction === 'find' ? 'find_roommate' : 'live_alone')}>
              {view.roommateAction === 'find' ? 'Find a roommate' : 'Live alone again'}
            </Button>
          )}
          {view.sell !== null && (
            <Button block variant="secondary" disabled={disabled} onClick={() => setPending({ action: 'sell_home' })}>
              Sell your home
            </Button>
          )}
        </div>
      )}

      {view.buy && (
        <Card role="region" aria-labelledby="buy-title">
          <h2 id="buy-title" className="text-lg font-bold">
            Buy a home
          </h2>
          <p className="mt-1 text-muted">
            A starter home in {view.cityName} costs about {money(view.buy.price)}. You need {money(view.buy.cashNeeded)} for the down payment and
            closing costs.
          </p>
          {view.buy.blocked ? (
            <p className="mt-2">{PURCHASE_BLOCK_LABELS[view.buy.blocked]}</p>
          ) : (
            <Button block className="mt-3" disabled={disabled || !view.buy.available} onClick={() => setPending({ action: 'buy_home' })}>
              Buy a home
            </Button>
          )}
        </Card>
      )}

      {view.cities.length > 0 && (
        <Card role="region" aria-labelledby="move-title">
          <h2 id="move-title" className="text-lg font-bold">
            Move to another city
          </h2>
          <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Cities">
            {view.cities.map((c) => (
              <li key={c.cityId}>
                <button
                  type="button"
                  disabled={disabled || !c.affordable}
                  onClick={() => setPending({ action: 'relocate', city: c })}
                  className="flex min-h-11 w-full min-w-0 flex-col py-3 text-left active:bg-surface-2 disabled:opacity-60"
                >
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">{c.blurb}</span>
                  <span className="text-sm text-muted">
                    Rent {money(c.rent)} a year · Moving {money(c.moveInCost)}
                    {c.affordable ? '' : ' · You can’t afford the move yet'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmSheet
        open={confirmation !== null}
        title={confirmation?.title ?? ''}
        body={confirmation?.body ?? ''}
        confirmLabel={confirmation?.confirm ?? ''}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (!p) return;
          if (p.action === 'relocate') void act('relocate', { cityId: p.city.cityId });
          else void act(p.action);
        }}
      />
    </div>
  );
}
