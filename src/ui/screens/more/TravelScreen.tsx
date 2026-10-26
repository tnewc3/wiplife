import { useState } from 'react';
import { content } from '../../../content';
import type { Souvenir, TripActivity, TripStyle } from '../../../content/schemas';
import { getTravelView } from '../../../engine/selectors';
import type { TripBudget } from '../../../engine/travel/types';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { money, SOUVENIR_LABELS, TRIP_ACTIVITY_LABELS, TRIP_BUDGET_LABELS, TRIP_STYLE_BLOCK_LABELS, TRIP_STYLE_BLURBS, TRIP_STYLE_LABELS } from '../../labels';
/** More → Plan a trip. All availability and prices come from the engine. */
export function TravelScreen({ life }: { life: LifeState }) {
  const [style, setStyle] = useState<TripStyle>('vacation');
  const initial = getTravelView(life, { destinationId: '', budget: 'budget', companions: [], style }, content);
  const [destinationId, setDestination] = useState(initial.options[0]?.id ?? '');
  const [budget, setBudget] = useState<TripBudget>('budget');
  const [companions, setCompanions] = useState<string[]>([]);
  const [activity, setActivity] = useState<TripActivity | ''>('');
  const [souvenir, setSouvenir] = useState<Souvenir>('none');
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const view = getTravelView(life, { destinationId, budget, companions, style, ...(activity ? { activity } : {}), ...(souvenir !== 'none' ? { souvenir } : {}) }, content);
  const trip = view.trip;
  const residence = view.residence;
  const business = style === 'business';
  const fixedCompany = style === 'honeymoon' || business;
  const reason = view.styles.find((s) => s.id === style)?.reason ?? null;
  return <div className="flex flex-col gap-4">
    {residence && <Card><p data-testid="residence">{residence.name} · Return in {residence.endYear}</p></Card>}
    <Card>
      <label className="block font-medium" htmlFor="trip-style">Kind of trip</label>
      <select id="trip-style" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={style} onChange={(e) => { setStyle(e.target.value as TripStyle); setCompanions([]); setDestination(''); }}>
        {view.styles.map((s) => <option key={s.id} value={s.id}>{TRIP_STYLE_LABELS[s.id]}{s.reason ? ' (not available)' : ''}</option>)}
      </select>
      <p className="mt-1 text-sm text-muted">{TRIP_STYLE_BLURBS[style]}</p>
      <label className="mt-4 block font-medium" htmlFor="trip-destination">Destination</label>
      <select id="trip-destination" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={trip.destinationId} onChange={(e) => setDestination(e.target.value)}>
        {view.options.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.country}</option>)}
      </select>
      {!business && <>
        <label className="mt-4 block font-medium" htmlFor="trip-budget">Budget</label>
        <select id="trip-budget" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={budget} onChange={(e) => setBudget(e.target.value as TripBudget)}>
          {Object.entries(TRIP_BUDGET_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </>}
      <label className="mt-4 block font-medium" htmlFor="trip-activity">What you’ll do</label>
      <select id="trip-activity" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={activity} onChange={(e) => setActivity(e.target.value as TripActivity | '')}>
        <option value="">No plan</option>
        {view.activities.filter((a) => a.available).map((a) => <option key={a.id} value={a.id}>{TRIP_ACTIVITY_LABELS[a.id]} · {money(a.extra)}</option>)}
      </select>
      <label className="mt-4 block font-medium" htmlFor="trip-souvenir">Bring something back</label>
      <select id="trip-souvenir" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={souvenir} onChange={(e) => setSouvenir(e.target.value as Souvenir)}>
        {view.souvenirs.map((s) => <option key={s.id} value={s.id}>{SOUVENIR_LABELS[s.id]}{s.cost ? ` · ${money(s.cost)}` : ''}</option>)}
      </select>
      {!fixedCompany && <fieldset className="mt-4"><legend className="font-medium">{style === 'group' ? 'Friends' : 'Companions'}</legend>
        <p className="text-sm text-muted">{style === 'group' ? `Choose ${view.minFriends} or ${view.maxCompanions} friends. You cover part of each friend’s costs.` : `Choose up to ${view.maxCompanions} companions, or leave everyone unchecked to travel solo. You cover part of each companion’s costs.`}</p>
        {view.companions.map(({ id, name }) => <label key={id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={trip.companions.includes(id)} disabled={!trip.companions.includes(id) && trip.companions.length >= view.maxCompanions} onChange={(e) => setCompanions(e.target.checked ? [...trip.companions, id] : trip.companions.filter((p) => p !== id))} />{name}</label>)}
      </fieldset>}
      {style === 'honeymoon' && trip.companions.length > 0 && <p className="mt-3 text-sm" data-testid="honeymoon-with">With {view.companions.find((c) => c.id === trip.companions[0])?.name}.</p>}
      <p className="mt-3">Total: {money(view.cost)}</p>
      {business && <p className="mt-1 text-sm" data-testid="per-diem">Your employer pays the trip. You receive {money(view.perDiem)} for the days away.</p>}
      <p className="mt-1 text-sm text-muted">A trip can lift your mood and give you a break. It may also bring surprises.</p>
      <Button className="mt-4" block disabled={busy || !view.canBook} onClick={() => void act('plan_trip', { trip })}>{business ? 'Take this business trip' : style === 'honeymoon' ? 'Take the honeymoon' : 'Take this trip'}</Button>
      {!view.oldEnough && <p className="mt-2 text-sm">You can plan your own trips from {view.minAge}.</p>}
      {reason && <p className="mt-2 text-sm">{TRIP_STYLE_BLOCK_LABELS[reason]}</p>}
      {!view.affordable && <p className="mt-2 text-sm">You need {money(view.cost)} saved for the booking.</p>}
      {view.alreadyTraveled && <p className="mt-2 text-sm">You have already traveled this year.</p>}
    </Card>
  </div>;
}
