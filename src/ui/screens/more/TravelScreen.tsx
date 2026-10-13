import { useState } from 'react';
import { content } from '../../../content';
import { getTravelView } from '../../../engine/selectors';
import type { TripBudget } from '../../../engine/travel/types';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { money, TRIP_BUDGET_LABELS } from '../../labels';
/** More → Plan a trip. All availability and prices come from the engine. */
export function TravelScreen({ life }: { life: LifeState }) {
  const initial = getTravelView(life, { destinationId: '', budget: 'budget', companions: [] }, content);
  const [destinationId, setDestination] = useState(initial.options[0]?.id ?? '');
  const [budget, setBudget] = useState<TripBudget>('budget');
  const [companions, setCompanions] = useState<string[]>([]);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const view = getTravelView(life, { destinationId, budget, companions }, content);
  const trip = view.trip;
  const residence = view.residence;
  return <div className="flex flex-col gap-4">
    {residence && <Card><p data-testid="residence">{residence.name} · Return in {residence.endYear}</p></Card>}
    <Card>
      <label className="block font-medium" htmlFor="trip-destination">Destination</label>
      <select id="trip-destination" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={trip.destinationId} onChange={(e) => setDestination(e.target.value)}>
        {view.options.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.country}</option>)}
      </select>
      <label className="mt-4 block font-medium" htmlFor="trip-budget">Budget</label>
      <select id="trip-budget" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={budget} onChange={(e) => setBudget(e.target.value as TripBudget)}>
        {Object.entries(TRIP_BUDGET_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <fieldset className="mt-4"><legend className="font-medium">Companions</legend>
        <p className="text-sm text-muted">Choose up to {view.maxCompanions} companions, or leave everyone unchecked to travel solo. You cover part of each companion’s costs.</p>
        {view.companions.map(({ id, name }) => <label key={id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={trip.companions.includes(id)} disabled={!trip.companions.includes(id) && trip.companions.length >= view.maxCompanions} onChange={(e) => setCompanions(e.target.checked ? [...trip.companions, id] : trip.companions.filter((p) => p !== id))} />{name}</label>)}
      </fieldset>
      <p className="mt-3">Total: {money(view.cost)}</p>
      <p className="mt-1 text-sm text-muted">A trip can lift your mood and give you a break. It may also bring surprises.</p>
      <Button className="mt-4" block disabled={busy || !view.canBook} onClick={() => void act('plan_trip', { trip })}>Take this trip</Button>
      {!view.oldEnough && <p className="mt-2 text-sm">You can plan your own trips from {view.minAge}.</p>}
      {!view.affordable && <p className="mt-2 text-sm">You need {money(view.cost)} saved for the booking.</p>}
      {view.alreadyTraveled && <p className="mt-2 text-sm">You have already traveled this year.</p>}
    </Card>
  </div>;
}
