import { useState } from 'react';
import { content } from '../../../content';
import { DEAL_PRICES } from '../../../content/schemas';
import { getDealingView, getDirtyView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { EmptyState } from '../../components/EmptyState';
import { FactChip } from '../../components/FactChip';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { ActionSheet } from '../../components/ActionSheet';
import { DRUG_LABELS, HEAT_WORDS, money } from '../../labels';

type Tab = 'overview' | 'stock' | 'production';
type Picker = 'start' | 'price' | 'setup' | null;

/**
 * Dealing and production (D1, rebuilt in U3 on the feature screen template): the hero shows your standing, heat and dirty
 * money; the tiles start selling, set the price and set up a grow or lab; the tabs are Overview, Stock and Production. Stopping
 * is in the ⋯ menu. Adults only.
 */
export function DealingSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getDealingView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<Tab>('overview');
  const [picker, setPicker] = useState<Picker>(null);
  const [opMenu, setOpMenu] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const D = DRUG_LABELS.dealing;
  const disabled = busy || !view.between;
  const last = life.drugs.last;
  const dirtyHeat = HEAT_WORDS[getDirtyView(life, content).heatBand];
  const dealing = view.dealing;
  const op = view.ops.find((o) => o.id === opMenu);
  const tabs = [
    { id: 'overview' as const, label: D.overview, testId: 'dealing-tab-overview' },
    { id: 'stock' as const, label: D.stock, testId: 'dealing-tab-stock' },
    { id: 'production' as const, label: D.production, testId: 'dealing-tab-production' },
  ];
  if (!view.adult) {
    return (
      <FeatureScreen open={open} title={D.title} onBack={onClose} testId="dealing-sheet">
        <EmptyState text={D.adultOnly} />
      </FeatureScreen>
    );
  }
  return (
    <FeatureScreen
      open={open}
      title={D.title}
      onBack={onClose}
      testId="dealing-sheet"
      info={<p>{D.crimeNote}</p>}
      actions={dealing ? [{ id: 'stop', label: D.stop, danger: true, disabled, testId: 'deal-stop', onSelect: () => void act('stop_dealing') }] : []}
      overlays={
        <>
          <OptionPickerSheet open={picker === 'start'} title={D.start} icon="syringe" line={D.notDealing} onClose={() => setPicker(null)} testId="deal-start-picker">
            {view.startable.map((d) => (
              <OptionCard
                key={d.id}
                name={d.name}
                reason={d.block ? D.blocks[d.block] : undefined}
                price={undefined}
                testId={`deal-pick-${d.id}`}
                onClick={() => {
                  setPicker(null);
                  void act('start_dealing', { drugId: d.id });
                }}
              />
            ))}
          </OptionPickerSheet>
          <OptionPickerSheet open={picker === 'price'} title={D.price} icon="money_bag" line={dealing ? D.priceHint[dealing.price] : undefined} onClose={() => setPicker(null)} testId="deal-price-picker">
            {DEAL_PRICES.map((p) => (
              <OptionCard
                key={p}
                name={D.prices[p]}
                chips={<FactChip>{D.priceHint[p]}</FactChip>}
                testId={`deal-price-${p}`}
                onClick={() => {
                  setPicker(null);
                  void act('set_deal_price', { dealPrice: p });
                }}
              />
            ))}
          </OptionPickerSheet>
          <OptionPickerSheet open={picker === 'setup'} title={D.start1} icon="key" onClose={() => setPicker(null)} testId="deal-setup-picker">
            {view.opTypes.flatMap((t) =>
              t.drugs.map((d) => (
                <OptionCard
                  key={`${t.id}.${d.id}`}
                  name={`${t.name}: ${d.name}`}
                  price={money(t.startup)}
                  chips={<FactChip>{D.capacity(t.capacity)}</FactChip>}
                  reason={d.block ? D.opBlocks[d.block] : undefined}
                  testId={`op-start-${t.id}-${d.id}`}
                  onClick={() => {
                    setPicker(null);
                    void act('start_operation', { defId: t.id, drugId: d.id });
                  }}
                />
              )),
            )}
          </OptionPickerSheet>
          <ActionSheet
            open={op !== undefined}
            title={op?.name ?? ''}
            onClose={() => setOpMenu(null)}
            actions={
              op
                ? [
                    ...(['low', 'full'] as const).map((r) => ({ id: r, label: `${D.running[r]}`, detail: op.running === r ? 'Now' : undefined, disabled, testId: `op-run-${op.id}-${r}`, onSelect: () => void act('set_operation', { opId: op.id, running: r }) })),
                    { id: 'close', label: D.closeOp, danger: true, disabled, testId: `op-close-${op.id}`, onSelect: () => setConfirmClose(op.id) },
                  ]
                : []
            }
          />
          <ConfirmSheet open={confirmClose !== null} title={D.closeOp} body="The equipment is lost. You can set one up again, at the full cost." confirmLabel={D.closeOp} busy={busy} onCancel={() => setConfirmClose(null)} onConfirm={() => {
            const id = confirmClose;
            setConfirmClose(null);
            if (id) void act('close_operation', { opId: id });
          }} />
        </>
      }
    >
      <HeroCard lead={undefined} title={dealing ? dealing.drug : D.notDealing} status={dealing ? D.demand(dealing.demand) : undefined}>
        <StatCell label={D.standing} value={dealing ? `${Math.round(dealing.standing)}%` : '–'} {...(dealing ? { bar: dealing.standing } : {})} testId="deal-standing" />
        <StatCell label={D.heat} value={dirtyHeat} bar={view.heat} barKind="bad" testId="deal-heat" />
        <StatCell label={D.dirty} value={money(view.dirty)} testId="deal-dirty" />
      </HeroCard>
      <ActionTileRow>
        {dealing ? <ActionTile label={D.price} icon="money_bag" tone="money" status={D.prices[dealing.price]} disabled={disabled} onClick={() => setPicker('price')} testId="deal-price-open" /> : <ActionTile label={D.start} icon="syringe" tone="crime" status={`${view.startable.filter((d) => d.block === null).length} to sell`} disabled={disabled} onClick={() => setPicker('start')} testId="deal-start" />}
        <ActionTile label={D.start1} icon="key" tone="crime" status={`${view.ops.length} running`} disabled={disabled} onClick={() => setPicker('setup')} testId="deal-setup-open" />
      </ActionTileRow>
      {last && (last.action === 'deal' || last.action === 'operation') && (
        <p role="status" data-testid="dealing-result" className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
          {DRUG_LABELS.result(last.note, last.amount, `dirty money ${money(view.dirty)}`, money(Math.abs(last.amount)))}
        </p>
      )}
      <SegmentedTabs sticky label="Dealing" value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' &&
        (dealing ? (
          <RowList label="Dealing">
            <ListRow title={D.customers} subtitle={D.demand(dealing.demand)} value={dealing.customers} testId="deal-customers" />
            <ListRow title={D.yearLine(dealing.sold, money(dealing.earned))} subtitle={DRUG_LABELS.perUnit(money(dealing.unit))} testId="deal-year" />
          </RowList>
        ) : (
          <EmptyState text={D.notDealing} action={D.start} onAction={() => setPicker('start')} />
        ))}
      {tab === 'stock' &&
        (view.stock.length === 0 ? (
          <EmptyState text={D.noStock} />
        ) : (
          <RowList label={D.stock}>
            {view.stock.map((s) => (
              <ListRow key={s.id} title={s.name} subtitle={`${s.units} · ${D.sellOnHint}`} value={<MiniBar label={DRUG_LABELS.quality} value={s.quality} />} ending="dots" onClick={() => void act('sell_wholesale', { drugId: s.id })} onMore={() => void act('sell_wholesale', { drugId: s.id })} moreLabel={`${D.sellOn}: ${s.name}`} testId={`stock-${s.id}`} moreTestId={`sell-on-${s.id}`} />
            ))}
          </RowList>
        ))}
      {tab === 'production' &&
        (view.ops.length === 0 ? (
          <EmptyState text={D.opsNone} action={D.start1} onAction={() => setPicker('setup')} />
        ) : (
          <RowList label={D.production}>
            {view.ops.map((o) => (
              <ListRow key={o.id} title={o.name} subtitle={`${D.kinds[o.kind]} · ${o.drug} · ${D.output(o.output)} · ${D.raid(o.raid)}`} value={<MiniBar label={DRUG_LABELS.quality} value={o.quality} />} ending="dots" onMore={() => setOpMenu(o.id)} moreTestId={`op-more-${o.id}`} testId={`op-${o.id}`} />
            ))}
          </RowList>
        ))}
    </FeatureScreen>
  );
}
