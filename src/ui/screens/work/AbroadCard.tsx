import { useState } from 'react';
import { content } from '../../../content';
import { getAbroadView } from '../../../engine/selectors';
import type { Residence } from '../../../engine/travel/types';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { ChipSelect } from '../../components/FilterChips';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { money, STAY_ROUTE_LABELS, STAY_BLOCK_LABELS } from '../../labels';

/** Time abroad (U3): study or work in another country. A hero with the cost and length, chips for the city and route, one tile to start;. */
export function AbroadCard({ life }: { life: LifeState }) {
  const initial = getAbroadView(life, { destinationId: '', route: 'year' }, content);
  const cities = initial.cities;
  const study = initial.student;
  const [destinationId, setDestination] = useState(cities[0]?.id ?? '');
  const [choice, setChoice] = useState<Residence['route']>('year');
  const [family, setFamily] = useState(false);
  const route: Residence['route'] = study ? (choice === 'semester' ? 'semester' : 'year') : choice === 'transfer' ? 'transfer' : 'working_holiday';
  const stay = { destinationId, route, ...(family ? { family: true } : {}) };
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const view = getAbroadView(life, stay, content);
  const action = view.action;
  const block = view.block;
  if (!view.oldEnough) return null;
  if (view.residence) {
    return (
      <HeroCard lead={<Icon id="airplane" size={44} />} title="Time abroad" status={`Return in ${view.residence.endYear}`} testId="work-residence">
        <StatCell label="Where" value={view.residence.name} />
        {life.travel.residence?.family && <StatCell label="Family" value="With you" testId="work-family" />}
      </HeroCard>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <HeroCard lead={<Icon id="airplane" size={44} />} title={study ? 'Study abroad' : 'Temporary work abroad'} status={study ? 'One annual turn' : `${view.years} years; working holidays through age ${view.holidayMaxAge}`}>
        <StatCell label="Up front" value={money(view.cost)} testId="abroad-cost" />
      </HeroCard>
      <ChipSelect label={study ? 'Partner school city' : 'Work destination'} testId="abroad-destination" value={destinationId} onChange={setDestination} options={cities.map((d) => ({ id: d.id, label: `${d.name} · ${d.country}` }))} />
      <ChipSelect<Residence['route']> label="Length or route" testId="abroad-route" value={route} onChange={setChoice} options={(study ? (['semester', 'year'] as const) : (['working_holiday', 'transfer'] as const)).map((r) => ({ id: r, label: STAY_ROUTE_LABELS[r] }))} />
      {(view.family.partner || view.family.children.length > 0) && (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" checked={family} onChange={(e) => setFamily(e.target.checked)} />
          Bring my family ({[view.family.partner, ...view.family.children].filter(Boolean).join(', ')})
        </label>
      )}
      {family && (
        <p className="text-sm text-muted" data-testid="family-note">
          They live with you there, and each adds to the up-front cost.
        </p>
      )}
      <ActionTileRow>
        <ActionTile label={study ? 'Start exchange' : 'Start temporary work'} icon="airplane" tone="travel" status={money(view.cost)} disabled={busy || !view.canStart} onClick={() => void act(action, { stay })} testId="abroad-start" />
      </ActionTileRow>
      {block && <p className="text-sm">{STAY_BLOCK_LABELS[block] ?? STAY_BLOCK_LABELS.unavailable}</p>}
    </div>
  );
}
