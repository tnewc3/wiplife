import { content } from '../../../content';
import { canPlanEstate, getBelongingsView, getCharacterSummary } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { housingLine, money } from '../../labels';
import { MoneyTab } from '../money/MoneyTab';

/**
 * The Assets tab (U2): in-screen tabs instead of one long page. Money is your finances (the ledger, lifestyle, debts, a
 * business's and crime's money); Home is where you live and your vacation homes; Things is your possessions with their
 * condition, the shops, and your will.
 */
export function AssetsTab({ life }: { life: LifeState }) {
  const openHome = useAppStore((s) => s.openHome);
  const openBelongings = useAppStore((s) => s.openBelongings);
  const openWill = useAppStore((s) => s.openWill);
  const openActivity = useAppStore((s) => s.openActivity);
  const section = useAppStore((s) => s.assetsSection);
  const setSection = useAppStore((s) => s.setAssetsSection);
  const belongings = getBelongingsView(life, content);
  const summary = getCharacterSummary(life, content);
  const adult = canPlanEstate(life, content);
  const items = [
    ...belongings.vehicles.map((v) => ({ id: v.id, name: v.name, condition: v.condition })),
    ...belongings.vacationHomes.map((h) => ({ id: h.id, name: `Vacation home in ${h.city}`, condition: h.condition })),
  ];
  return (
    <div className="flex flex-col gap-3">
      <SegmentedTabs
        label="Assets"
        value={section}
        onChange={setSection}
        tabs={[
          { id: 'money', label: 'Money', testId: 'assets-tab-money' },
          { id: 'home', label: 'Home', testId: 'assets-tab-home' },
          { id: 'things', label: 'Things', testId: 'assets-tab-things' },
        ]}
      />
      {section === 'money' && <MoneyTab life={life} />}
      {section === 'home' && (
        <section aria-label="Properties" className="flex flex-col gap-2">
          <p className="px-1" data-testid="assets-housing-line">
            {housingLine(summary.housing, summary.cityName)}
          </p>
          <RowList label="Properties">
            {belongings.vacationHomes.map((h) => (
              <ListRow key={h.id} title={`Vacation home in ${h.city}`} subtitle={money(h.value)} value={<MiniBar label={`Condition of the vacation home in ${h.city}`} value={h.condition} />} />
            ))}
            <ListRow title="Properties" subtitle="Rent, move, buy or sell a home" ending="chevron" onClick={openHome} testId="assets-properties" />
          </RowList>
        </section>
      )}
      {section === 'things' && (
        <>
          <section aria-label="Possessions" className="flex flex-col gap-2">
            <SectionHeader>Possessions</SectionHeader>
            {items.length === 0 && belongings.valuables.length === 0 && belongings.pets.length === 0 && <p className="px-1 text-muted">You don’t own a vehicle, a valuable or a pet yet.</p>}
            <RowList label="Possessions">
              {items.map((i) => (
                <ListRow key={i.id} title={i.name} value={<MiniBar label={`Condition of ${i.name}`} value={i.condition} />} />
              ))}
              {belongings.valuables.map((v) => (
                <ListRow key={v.id} title={v.name} value={money(v.value)} />
              ))}
              <ListRow title="Possessions" subtitle="Vehicles, valuables, pets, insurance and renovations" ending="chevron" onClick={openBelongings} testId="assets-possessions" />
              <ListRow title="Go shopping" subtitle="Clothes, accessories, hats and treats" ending="dots" onClick={() => openActivity('shopping')} onMore={() => openActivity('shopping')} moreLabel="Open the stores" testId="assets-go-shopping" />
            </RowList>
          </section>
          {adult && (
            <section aria-label="Estate" className="flex flex-col gap-2">
              <SectionHeader>Estate</SectionHeader>
              <RowList label="Estate">
                <ListRow title="Your will" subtitle="Say who gets what when you are gone" ending="chevron" onClick={openWill} testId="assets-will" />
              </RowList>
            </section>
          )}
        </>
      )}
    </div>
  );
}
