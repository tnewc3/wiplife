import { PageInfo } from '../../components/PageInfo';
import { useState } from 'react';
import { content } from '../../../content';
import { getHomeView, type CityMove } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { FactChip } from '../../components/FactChip';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
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
  const [more, setMore] = useState(false);
  const [cities, setCities] = useState(false);
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

  const homeActions = [
    ...(view.moveHome ? [{ id: 'movehome', label: `Move back in with ${view.moveHome.name}`, disabled, testId: 'home-move-back', onSelect: () => setPending({ action: 'move_home' }) }] : []),
    ...(view.roommateAction ? [{ id: 'roommate', label: view.roommateAction === 'find' ? 'Find a roommate' : 'Live alone again', disabled, testId: 'home-roommate', onSelect: () => void act(view.roommateAction === 'find' ? 'find_roommate' : 'live_alone') }] : []),
    ...(view.sell !== null ? [{ id: 'sell', label: 'Sell your home', danger: true, disabled, testId: 'home-sell', onSelect: () => setPending({ action: 'sell_home' }) }] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <HeroCard lead={<Icon id="house_with_garden" size={44} />} title={housingLine(view.kind, view.cityName)} status={costLine} testId="housing-line">
        {view.homeValue !== null && <StatCell label="Worth" value={money(view.homeValue)} />}
        {view.homeValue !== null && <StatCell label="Mortgage" value={view.mortgage > 0 ? money(view.mortgage) : 'Paid off'} />}
        {view.partnerName && <StatCell label="Lives with you" value={view.partnerName} testId="partner-line" />}
      </HeroCard>
      {!view.independent && <PageInfo><p>You live with your family until you’re old enough to decide for yourself.</p></PageInfo>}
      {view.independent && (
        <ActionTileRow label="Home actions">
          {view.rent && <ActionTile label={view.kind === 'with_parents' ? 'Move out' : 'Rent'} icon="key" tone="home" status={view.rent.affordable ? `${money(view.rent.moveInCost)} up front` : `Needs ${money(view.rent.moveInCost)}`} disabled={disabled || !view.rent.affordable} onClick={() => setPending({ action: 'rent_home' })} testId="home-rent" />}
          {view.buy && <ActionTile label="Buy" icon="house_with_garden" tone="money" status={view.buy.blocked ? PURCHASE_BLOCK_LABELS[view.buy.blocked] : money(view.buy.price)} disabled={disabled || !view.buy.available} onClick={() => setPending({ action: 'buy_home' })} testId="home-buy" />}
          {view.cities.length > 0 && <ActionTile label="Move city" icon="airplane" tone="travel" status={`${view.cities.length} cities`} onClick={() => setCities(true)} testId="home-cities" />}
          {homeActions.length > 0 && <ActionTile label="More" icon="key" tone="people" status={`${homeActions.length} options`} onClick={() => setMore(true)} testId="home-more" />}
        </ActionTileRow>
      )}
      <ActionSheet open={more} title="Home" actions={homeActions} onClose={() => setMore(false)} />
      <OptionPickerSheet open={cities} title="Move to another city" icon="airplane" onClose={() => setCities(false)} testId="home-cities-picker">
        {view.cities.map((c) => (
          <OptionCard key={c.cityId} name={c.name} chips={<><FactChip>Rent {money(c.rent)} a year</FactChip><FactChip>{c.blurb}</FactChip></>} price={money(c.moveInCost)} reason={disabled ? 'Not now' : c.affordable ? undefined : `Needs ${money(c.moveInCost)}`} testId={`city-${c.cityId}`} onClick={() => { setCities(false); setPending({ action: 'relocate', city: c }); }} />
        ))}
      </OptionPickerSheet>

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
