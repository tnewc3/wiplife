import { PageInfo } from '../../components/PageInfo';
import { ChipSelect } from '../../components/FilterChips';
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
      <ChipSelect label="Kind of trip" testId="trip-style" value={style} onChange={(v) => { setStyle(v); setCompanions([]); setDestination(''); }} options={view.styles.map((s) => ({ id: s.id, label: `${TRIP_STYLE_LABELS[s.id]}${s.reason ? ' (not available)' : ''}` }))} />
      <PageInfo><p>{TRIP_STYLE_BLURBS[style]}</p></PageInfo>
      <ChipSelect label="Destination" testId="trip-destination" value={trip.destinationId} onChange={setDestination} options={view.options.map((d) => ({ id: d.id, label: `${d.name} · ${d.country}` }))} />
      {!business && <>
        <ChipSelect label="Budget" testId="trip-budget" value={budget} onChange={setBudget} options={Object.entries(TRIP_BUDGET_LABELS).map(([id, label]) => ({ id: id as TripBudget, label }))} />
      </>}
      <ChipSelect<TripActivity | ''> label="What you’ll do" testId="trip-activity" value={activity} onChange={setActivity} options={[{ id: '', label: 'No plan' }, ...view.activities.filter((a) => a.available).map((a) => ({ id: a.id, label: `${TRIP_ACTIVITY_LABELS[a.id]} · ${money(a.extra)}` }))]} />
      <ChipSelect label="Bring something back" testId="trip-souvenir" value={souvenir} onChange={setSouvenir} options={view.souvenirs.map((s) => ({ id: s.id, label: `${SOUVENIR_LABELS[s.id]}${s.cost ? ` · ${money(s.cost)}` : ''}` }))} />
      {!fixedCompany && <fieldset className="mt-4"><legend className="font-medium">{style === 'group' ? 'Friends' : 'Companions'}</legend>
        <PageInfo><p>{style === 'group' ? `Choose ${view.minFriends} or ${view.maxCompanions} friends. You cover part of each friend’s costs.` : `Choose up to ${view.maxCompanions} companions, or leave everyone unchecked to travel solo. You cover part of each companion’s costs.`}</p></PageInfo>
        {view.companions.map(({ id, name }) => <label key={id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={trip.companions.includes(id)} disabled={!trip.companions.includes(id) && trip.companions.length >= view.maxCompanions} onChange={(e) => setCompanions(e.target.checked ? [...trip.companions, id] : trip.companions.filter((p) => p !== id))} />{name}</label>)}
      </fieldset>}
      {style === 'honeymoon' && trip.companions.length > 0 && <p className="mt-3 text-sm" data-testid="honeymoon-with">With {view.companions.find((c) => c.id === trip.companions[0])?.name}.</p>}
      <p className="mt-3">Total: {money(view.cost)}</p>
      {business && <p className="mt-1 text-sm" data-testid="per-diem">Your employer pays the trip. You receive {money(view.perDiem)} for the days away.</p>}
      <PageInfo><p>A trip can lift your mood and give you a break. It may also bring surprises.</p></PageInfo>
      <Button className="mt-4" block disabled={busy || !view.canBook} onClick={() => void act('plan_trip', { trip })}>{business ? 'Take this business trip' : style === 'honeymoon' ? 'Take the honeymoon' : 'Take this trip'}</Button>
      {!view.oldEnough && <p className="mt-2 text-sm">You can plan your own trips from {view.minAge}.</p>}
      {reason && <p className="mt-2 text-sm">{TRIP_STYLE_BLOCK_LABELS[reason]}</p>}
      {!view.affordable && <p className="mt-2 text-sm">You need {money(view.cost)} saved for the booking.</p>}
      {view.alreadyTraveled && <p className="mt-2 text-sm">You have already traveled this year.</p>}
    </Card>
  </div>;
}
