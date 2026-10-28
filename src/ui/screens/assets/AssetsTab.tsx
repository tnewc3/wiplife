import { ChevronRight } from 'lucide-react';
import { content } from '../../../content';
import { canPlanEstate, getBelongingsView, getCharacterSummary } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { StatBar } from '../../components/StatBar';
import { housingLine, money } from '../../labels';
import { MoneyTab } from '../money/MoneyTab';

function LinkRow({ title, detail, onClick, testId }: { title: string; detail: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 text-left active:bg-surface">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-base font-semibold">{title}</span>
        <span className="text-sm break-words text-muted">{detail}</span>
      </span>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
    </button>
  );
}

/**
 * The Assets tab (U1): your finances (the ledger, lifestyle, debts, a business's and crime's money), then your properties,
 * your possessions with their condition, and your will.
 */
export function AssetsTab({ life }: { life: LifeState }) {
  const openHome = useAppStore((s) => s.openHome);
  const openBelongings = useAppStore((s) => s.openBelongings);
  const openWill = useAppStore((s) => s.openWill);
  const openActivity = useAppStore((s) => s.openActivity);
  const belongings = getBelongingsView(life, content);
  const summary = getCharacterSummary(life, content);
  const adult = canPlanEstate(life, content);
  const items = [
    ...belongings.vehicles.map((v) => ({ id: v.id, name: v.name, condition: v.condition })),
    ...belongings.vacationHomes.map((h) => ({ id: h.id, name: `Vacation home in ${h.city}`, condition: h.condition })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Finances</h2>
      <MoneyTab life={life} />
      <h2 className="font-display text-lg font-semibold">Properties</h2>
      <Card className="flex flex-col gap-3" role="region" aria-label="Properties">
        <p data-testid="assets-housing-line">{housingLine(summary.housing, summary.cityName)}</p>
        {belongings.vacationHomes.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Vacation homes">
            {belongings.vacationHomes.map((h) => (
              <li key={h.id}>
                <StatBar label={`Vacation home in ${h.city} · ${money(h.value)}`} value={h.condition} />
              </li>
            ))}
          </ul>
        )}
        <LinkRow title="Properties" detail="Rent, move, buy or sell a home" onClick={openHome} testId="assets-properties" />
      </Card>
      <h2 className="font-display text-lg font-semibold">Possessions</h2>
      <Card className="flex flex-col gap-3" role="region" aria-label="Possessions">
        {items.length === 0 && belongings.valuables.length === 0 && belongings.pets.length === 0 ? (
          <p className="text-muted">You don’t own a vehicle, a valuable or a pet yet.</p>
        ) : (
          <>
            {items.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Condition of what you own">
                {items.map((i) => (
                  <li key={i.id}>
                    <StatBar label={i.name} value={i.condition} />
                  </li>
                ))}
              </ul>
            )}
            {belongings.valuables.length > 0 && (
              <ul className="flex flex-col divide-y divide-border" aria-label="Valuables">
                {belongings.valuables.map((v) => (
                  <li key={v.id} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 break-words">{v.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{money(v.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <LinkRow title="Possessions" detail="Vehicles, valuables, pets, insurance and renovations" onClick={openBelongings} testId="assets-possessions" />
        <LinkRow title="Go shopping" detail="Clothes, accessories, hats and treats" onClick={() => openActivity('shopping')} testId="assets-go-shopping" />
      </Card>
      {adult && (
        <>
          <h2 className="font-display text-lg font-semibold">Estate</h2>
          <LinkRow title="Your will" detail="Say who gets what when you are gone" onClick={openWill} testId="assets-will" />
        </>
      )}
    </div>
  );
}
