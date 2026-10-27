import { useState } from 'react';
import { content } from '../../../content';
import { getAbroadView } from '../../../engine/selectors';
import type { Residence } from '../../../engine/travel/types';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { money, STAY_ROUTE_LABELS, STAY_BLOCK_LABELS } from '../../labels';
export function AbroadCard({ life }: { life: LifeState }) {
  const initial = getAbroadView(life, { destinationId: '', route: 'year' }, content);
  const cities = initial.cities;
  const study = initial.student;
  const [destinationId, setDestination] = useState(cities[0]?.id ?? '');
  const [choice, setChoice] = useState<Residence['route']>('year');
  const [family, setFamily] = useState(false);
  const route: Residence['route'] = study ? (choice === 'semester' ? 'semester' : 'year') : (choice === 'transfer' ? 'transfer' : 'working_holiday');
  const stay = { destinationId, route, ...(family ? { family: true } : {}) };
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const view = getAbroadView(life, stay, content);
  const action = view.action;
  const block = view.block;
  if (!view.oldEnough) return null;
  if (view.residence) return <Card><h2 className="text-lg font-bold">Time abroad</h2><p data-testid="work-residence">{view.residence.name} · Return in {view.residence.endYear}</p>{life.travel.residence?.family && <p className="mt-1 text-sm" data-testid="work-family">Your family is with you.</p>}</Card>;
  return <Card>
    <h2 className="text-lg font-bold">{study ? 'Study abroad' : 'Temporary work abroad'}</h2>
    <label className="mt-3 block" htmlFor="abroad-destination">{study ? 'Partner school city' : 'Work destination'}</label>
    <select id="abroad-destination" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={destinationId} onChange={(e) => setDestination(e.target.value)}>{cities.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.country}</option>)}</select>
    <label className="mt-3 block" htmlFor="abroad-route">Length or route</label>
    <select id="abroad-route" className="mt-2 min-h-11 w-full rounded border border-border bg-surface px-2" value={route} onChange={(e) => setChoice(e.target.value as Residence['route'])}>{(study ? ['semester', 'year'] as const : ['working_holiday', 'transfer'] as const).map((r) => <option value={r} key={r}>{STAY_ROUTE_LABELS[r]}</option>)}</select>
    {(view.family.partner || view.family.children.length > 0) && <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={family} onChange={(e) => setFamily(e.target.checked)} />Bring my family ({[view.family.partner, ...view.family.children].filter(Boolean).join(', ')})</label>}
    {family && <p className="mt-1 text-sm text-muted" data-testid="family-note">They live with you there, your children go to school where you live, and they come home with you. Each adds to the up-front cost.</p>}
    <p className="mt-3">{study ? 'One annual turn' : `${view.years} years; working holidays through age ${view.holidayMaxAge}`} · Up front: {money(view.cost)}</p>
    <p className="mt-2 text-sm text-muted">{study ? 'Your home school keeps your enrollment and tuition. A semester is resolved within one annual turn.' : 'A working holiday uses temporary gig work. An employer transfer keeps your job.'} Living costs apply abroad. Leaving a city ends its local group memberships. Your ties at home may feel the distance.</p>
    <Button className="mt-4" block disabled={busy || !view.canStart} onClick={() => void act(action, { stay })}>{study ? 'Start exchange' : 'Start temporary work'}</Button>
    {block && <p className="mt-2 text-sm">{STAY_BLOCK_LABELS[block] ?? STAY_BLOCK_LABELS.unavailable}</p>}
  </Card>;
}
