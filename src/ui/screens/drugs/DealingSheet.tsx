import { useState } from 'react';
import { content } from '../../../content';
import { DEAL_PRICES } from '../../../content/schemas';
import { getDealingView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { DRUG_LABELS, HEAT_WORDS, money } from '../../labels';
import { getDirtyView } from '../../../engine/selectors';

type Tab = 'overview' | 'production';

/** Dealing and production (D1): the Career tab's Dealing role: customers, price, stock, heat, and the operations you run. Adults only. */
export function DealingSheet({ life }: { life: LifeState }) {
  const view = getDealingView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<Tab>('overview');
  const [drug, setDrug] = useState<string | null>(null);
  const D = DRUG_LABELS.dealing;
  const disabled = busy || !view.between;
  const last = life.drugs.last;
  const dirtyHeat = HEAT_WORDS[getDirtyView(life, content).heatBand];
  if (!view.adult) return <p className="text-muted">{D.adultOnly}</p>;
  const pick = drug ?? view.startable.find((d) => d.block === null)?.id ?? view.startable[0]?.id ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="dealing-sheet">
      <SegmentedTabs
        label="Dealing"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: D.overview, testId: 'dealing-tab-overview' },
          { id: 'production', label: D.production, testId: 'dealing-tab-production' },
        ]}
      />
      <p className="text-sm text-muted">{D.crimeNote}</p>
      {last && (last.action === 'deal' || last.action === 'operation') && (
        <p role="status" data-testid="dealing-result" className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
          {DRUG_LABELS.result(last.note, last.amount, `dirty money ${money(view.dirty)}`, money(Math.abs(last.amount)))}
        </p>
      )}
      {tab === 'overview' ? (
        <>
          {view.dealing ? (
            <section className="flex flex-col gap-1.5" aria-labelledby="deal-title">
              <SectionHeader id="deal-title">{view.dealing.drug}</SectionHeader>
              <RowList label="Dealing">
                <ListRow title={D.customers} subtitle={D.demand(view.dealing.demand)} value={view.dealing.customers} testId="deal-customers" />
                <ListRow title={D.standing} value={<MiniBar label={D.standing} value={view.dealing.standing} />} testId="deal-standing" />
                <ListRow title={D.heat} subtitle={dirtyHeat} value={<MiniBar label={D.heat} value={view.heat} kind="bad" />} testId="deal-heat" />
                <ListRow title={D.dirty} value={money(view.dirty)} testId="deal-dirty" />
                <ListRow title={D.yearLine(view.dealing.sold, money(view.dealing.earned))} subtitle={DRUG_LABELS.perUnit(money(view.dealing.unit))} testId="deal-year" />
              </RowList>
              <div role="radiogroup" aria-label={D.price} className="flex gap-1">
                {DEAL_PRICES.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={view.dealing!.price === p} disabled={disabled} onClick={() => void act('set_deal_price', { dealPrice: p })} data-testid={`deal-price-${p}`} className={`min-h-11 flex-1 rounded-xl border px-2 text-sm font-semibold disabled:opacity-60 ${view.dealing!.price === p ? 'border-accent bg-surface-2' : 'border-border'}`}>
                    {D.prices[p]}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted">{D.priceHint[view.dealing.price]}</p>
              <Button variant="danger" block disabled={disabled} onClick={() => void act('stop_dealing')} data-testid="deal-stop">
                {D.stop}
              </Button>
            </section>
          ) : (
            <section className="flex flex-col gap-1.5" aria-labelledby="start-title">
              <SectionHeader id="start-title">{D.notDealing}</SectionHeader>
              <RowList label="Drugs">
                {view.startable.map((d) => (
                  <ListRow key={d.id} title={d.name} subtitle={d.block ? D.blocks[d.block] : undefined} muted={d.block !== null} onClick={d.block === null ? () => setDrug(d.id) : undefined} testId={`deal-pick-${d.id}`} value={pick === d.id && d.block === null ? '✓' : undefined} />
                ))}
              </RowList>
              <Button block disabled={disabled || pick === null || view.startable.find((d) => d.id === pick)?.block !== null} onClick={() => void act('start_dealing', { drugId: pick! })} data-testid="deal-start">
                {D.start}
              </Button>
            </section>
          )}
          <section className="flex flex-col gap-1.5" aria-labelledby="stock-title">
            <SectionHeader id="stock-title">{D.stock}</SectionHeader>
            {view.stock.length === 0 ? <p className="text-sm text-muted">{D.noStock}</p> : (
              <RowList label={D.stock}>
                {view.stock.map((s) => (
                  <ListRow key={s.id} title={s.name} subtitle={`${s.units} · ${D.sellOnHint}`} value={<MiniBar label={DRUG_LABELS.quality} value={s.quality} />} ending="dots" onClick={() => void act('sell_wholesale', { drugId: s.id })} onMore={() => void act('sell_wholesale', { drugId: s.id })} moreLabel={`${D.sellOn}: ${s.name}`} testId={`stock-${s.id}`} moreTestId={`sell-on-${s.id}`} />
                ))}
              </RowList>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-1.5" aria-labelledby="ops-title">
            <SectionHeader id="ops-title">{D.production}</SectionHeader>
            {view.ops.length === 0 ? <p className="text-sm text-muted">{D.opsNone}</p> : (
              <RowList label={D.production}>
                {view.ops.map((o) => (
                  <ListRow key={o.id} title={o.name} subtitle={`${D.kinds[o.kind]} · ${o.drug} · ${D.output(o.output)} · ${D.raid(o.raid)}`} value={<MiniBar label={DRUG_LABELS.quality} value={o.quality} />} testId={`op-${o.id}`} />
                ))}
              </RowList>
            )}
            {view.ops.map((o) => (
              <div key={o.id} className="flex gap-1">
                {(['low', 'full'] as const).map((r) => (
                  <button key={r} type="button" aria-pressed={o.running === r} disabled={disabled} onClick={() => void act('set_operation', { opId: o.id, running: r })} data-testid={`op-run-${o.id}-${r}`} className={`min-h-11 flex-1 rounded-xl border px-2 text-sm font-semibold disabled:opacity-60 ${o.running === r ? 'border-accent bg-surface-2' : 'border-border'}`}>
                    {o.name}: {D.running[r]}
                  </button>
                ))}
                <Button variant="danger" disabled={disabled} onClick={() => void act('close_operation', { opId: o.id })} data-testid={`op-close-${o.id}`}>
                  {D.closeOp}
                </Button>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-1.5" aria-labelledby="types-title">
            <SectionHeader id="types-title">{D.start1}</SectionHeader>
            <RowList label={D.start1}>
              {view.opTypes.flatMap((t) =>
                t.drugs.map((d) => (
                  <ListRow
                    key={`${t.id}.${d.id}`}
                    title={`${t.name}: ${d.name}`}
                    subtitle={d.block ? D.opBlocks[d.block] : `${D.setup(money(t.startup), money(t.upkeep))} · ${D.capacity(t.capacity)}`}
                    muted={d.block !== null}
                    ending="chevron"
                    onClick={d.block === null && !disabled ? () => void act('start_operation', { defId: t.id, drugId: d.id }) : undefined}
                    testId={`op-start-${t.id}-${d.id}`}
                  />
                )),
              )}
            </RowList>
          </section>
        </>
      )}
    </div>
  );
}
