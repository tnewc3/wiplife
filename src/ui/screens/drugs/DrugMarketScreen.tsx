import { PageInfo } from '../../components/PageInfo';
import { useState } from 'react';
import { content } from '../../../content';
import type { DrugSource } from '../../../content/schemas';
import { getDrugMarketView, type DrugMarketView, type DrugRowView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet, type SheetAction } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Sheet } from '../../components/Sheet';
import { DRUG_LABELS, money } from '../../labels';

type Tab = 'buy' | 'stash';

/** The result of the latest action, with the amount and the new balance. */
function ResultLine({ life }: { life: LifeState }) {
  const last = life.drugs.last;
  if (!last) return null;
  const text = DRUG_LABELS.result(last.note, last.amount, `balance ${money(last.balance)}`, money(Math.abs(last.amount)));
  return (
    <p role="status" data-testid="drug-result" className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
      {text}
    </p>
  );
}

/** Where a drug can be bought, and what one unit costs from there. */
function BuySheet({ drug, view, open, onClose }: { drug: DrugRowView | null; view: DrugMarketView; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const [source, setSource] = useState<DrugSource | null>(null);
  const [resale, setResale] = useState(false);
  if (!drug) return null;
  const open1 = drug.sources.filter((s) => s.quote !== null);
  const chosen = source && open1.some((s) => s.source === source) ? source : (open1[0]?.source ?? null);
  const row = drug.sources.find((s) => s.source === chosen);
  return (
    <Sheet open={open} title={`${DRUG_LABELS.buyFor} ${drug.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="drug-buy-sheet">
        <p className="text-sm text-muted">{drug.blurb}</p>
        <div role="radiogroup" aria-label="Where from" className="flex flex-col gap-1.5">
          {drug.sources.map((s) => {
            const available = s.quote !== null;
            return (
              <button
                key={s.source}
                type="button"
                role="radio"
                aria-checked={chosen === s.source}
                disabled={!available}
                onClick={() => setSource(s.source)}
                data-testid={`drug-source-${s.source}`}
                className={`flex min-h-11 flex-col items-start rounded-xl border px-3 py-1.5 text-left disabled:opacity-50 ${chosen === s.source ? 'border-accent bg-surface-2' : 'border-border'}`}
              >
                <span className="flex w-full justify-between gap-2 font-semibold">
                  <span>{DRUG_LABELS.sources[s.source]}</span>
                  <span className="tabular-nums">{available ? DRUG_LABELS.perUnit(money(s.quote!)) : ''}</span>
                </span>
                <span className="text-[13px] text-muted">{DRUG_LABELS.sourceHint[s.source]}</span>
              </button>
            );
          })}
        </div>
        {view.dealing && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={resale} onChange={(e) => setResale(e.target.checked)} data-testid="drug-resale" className="size-5" />
            <span className="text-sm font-semibold">{DRUG_LABELS.forResale}</span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          {view.amounts.map((n) => {
            const block = row ? (resale && n < view.resaleMin ? 'resale' : null) : 'source';
            return (
              <Button
                key={n}
                variant="secondary"
                disabled={!view.between || !chosen || block !== null || (row?.quote ?? 0) * n > view.savings}
                data-testid={`drug-buy-${n}`}
                onClick={() => {
                  onClose();
                  void act('buy_drug', { drugId: drug.id, drugSource: chosen!, units: n, resale });
                }}
              >
                {n} {n === 1 ? drug.unit.one : drug.unit.many}
                {row?.quote ? ` · ${money(row.quote * n)}` : ''}
              </Button>
            );
          })}
        </div>
        {!view.between && <p className="text-sm text-muted">{DRUG_LABELS.blocks.jail}</p>}
      </div>
    </Sheet>
  );
}

/** The drug market (D1): buy from a dealer, a contact, a night out or the black market; and your stash. */
export function DrugMarketScreen({ life }: { life: LifeState }) {
  const view = getDrugMarketView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const tab: Tab = useAppStore((s) => s.drugTab);
  const setTab = useAppStore((s) => s.setDrugTab);
  const [buying, setBuying] = useState<string | null>(null);
  const [stashOf, setStashOf] = useState<string | null>(null);
  if (!view.oldEnough) return <p className="text-muted">{DRUG_LABELS.youngNote}</p>;
  const buyDrug = view.drugs.find((d) => d.id === buying) ?? null;
  const held = view.drugs.filter((d) => d.held);
  const stashDrug = view.drugs.find((d) => d.id === stashOf) ?? null;
  const stashActions: SheetAction[] = stashDrug
    ? [
        { id: 'light', label: DRUG_LABELS.light, disabled: busy || !view.between || stashDrug.useLight !== null, testId: 'drug-use-light', onSelect: () => void act('use_drug', { drugId: stashDrug.id, dose: 'light' }) },
        { id: 'heavy', label: DRUG_LABELS.heavy, disabled: busy || !view.between || stashDrug.useHeavy !== null, testId: 'drug-use-heavy', onSelect: () => void act('use_drug', { drugId: stashDrug.id, dose: 'heavy' }) },
        { id: 'hide', label: stashDrug.held?.hidden ? DRUG_LABELS.unhide : DRUG_LABELS.hide, disabled: busy || !view.between, testId: 'drug-hide', onSelect: () => void act('hide_stash', { drugId: stashDrug.id, on: !stashDrug.held?.hidden }) },
      ]
    : [];
  return (
    <div className="flex flex-col gap-3" data-testid="drug-market">
      <SegmentedTabs
        label="Drug market"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'buy', label: DRUG_LABELS.tabs.buy, testId: 'drug-tab-buy' },
          { id: 'stash', label: DRUG_LABELS.tabs.stash, testId: 'drug-tab-stash' },
        ]}
      />
      <ResultLine life={life} />
      {!view.adult && <p className="text-sm text-muted">{DRUG_LABELS.adultOnly}</p>}
      {tab === 'buy' ? (
        <>
          <section aria-labelledby="drug-list" className="flex flex-col gap-1.5">
            <SectionHeader id="drug-list">{DRUG_LABELS.marketTitle}</SectionHeader>
            <RowList label={DRUG_LABELS.marketTitle}>
              {view.drugs.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.name}
                  subtitle={`${DRUG_LABELS.categories[d.category as keyof typeof DRUG_LABELS.categories]} · ${DRUG_LABELS.severity[d.severity]}`}
                  value={DRUG_LABELS.unitRange(money(d.price.min), money(d.price.max))}
                  ending="dots"
                  muted={!view.adult}
                  onClick={view.adult ? () => setBuying(d.id) : undefined}
                  onMore={view.adult ? () => setBuying(d.id) : undefined}
                  moreLabel={`Buy ${d.name}`}
                  testId={`drug-row-${d.id}`}
                  moreTestId={`drug-more-${d.id}`}
                />
              ))}
            </RowList>
          </section>
          <section aria-labelledby="dealer-list" className="flex flex-col gap-1.5">
            <SectionHeader id="dealer-list">{DRUG_LABELS.dealersTitle}</SectionHeader>
            {view.dealers.length === 0 ? <p className="text-sm text-muted">{DRUG_LABELS.noDealers}</p> : (
              <RowList label={DRUG_LABELS.dealersTitle}>
                {view.dealers.map((p) => (
                  <ListRow key={p.id} title={p.name} testId={`dealer-${p.id}`} />
                ))}
              </RowList>
            )}
            <Button variant="secondary" block disabled={busy || !view.between || view.introBlock !== null} onClick={() => void act('meet_dealer')} data-testid="drug-meet-dealer">
              {DRUG_LABELS.askFriend}
            </Button>
            {view.introBlock && <p className="text-sm text-muted">{DRUG_LABELS.introBlocks[view.introBlock]}</p>}
          </section>
        </>
      ) : (
        <section aria-labelledby="stash-list" className="flex flex-col gap-1.5">
          <SectionHeader id="stash-list">{DRUG_LABELS.tabs.stash}</SectionHeader>
          <PageInfo><p>{DRUG_LABELS.stashNote}</p></PageInfo>
          <p className="text-sm text-muted">{DRUG_LABELS.used(view.used, view.limit)}</p>
          {held.length === 0 ? <p className="text-muted" data-testid="stash-empty">{DRUG_LABELS.nothingHeld}</p> : (
            <RowList label={DRUG_LABELS.tabs.stash}>
              {held.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.name}
                  subtitle={`${DRUG_LABELS.held(d.held!.units, d.held!.units === 1 ? d.unit.one : d.unit.many)}${d.held!.hidden ? ` · ${DRUG_LABELS.hiding}` : ''}`}
                  value={<MiniBar label={DRUG_LABELS.quality} value={d.held!.quality} />}
                  ending="dots"
                  onClick={() => setStashOf(d.id)}
                  onMore={() => setStashOf(d.id)}
                  moreLabel={`Options for ${d.name}`}
                  testId={`stash-row-${d.id}`}
                  moreTestId={`stash-more-${d.id}`}
                />
              ))}
            </RowList>
          )}
        </section>
      )}
      <BuySheet drug={buyDrug} view={view} open={buying !== null && buyDrug !== null} onClose={() => setBuying(null)} />
      <ActionSheet open={stashDrug !== null} title={stashDrug?.name ?? ''} actions={stashActions} onClose={() => setStashOf(null)} />
    </div>
  );
}
