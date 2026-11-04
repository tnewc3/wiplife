import { useState } from 'react';
import { content } from '../../../content';
import type { LifeActionParams } from '../../../engine/actions';
import { scaledAmount } from '../../../engine/country';
import { getActivitiesView, getActivityTabView, type ActivityEntryView, type ActivityHubView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import type { TileTone } from '../../components/ActionTile';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { FilterChips } from '../../components/FilterChips';
import { ItemCard, ItemDetailSheet, StoreScreen } from '../../components/StoreScreen';
import { LOOK_KIND_LABELS, lookWords, money, SHOP_TONES } from '../../labels';
import { ReceiptCard } from './EntryCards';
import { reasonOf } from './EntryCards';

/** Which activities of the hub are shops: the Shopping section of a category (stores, fine goods, outdoor gear, the luxury shops) and the black market. */
export function isShop(hub: Pick<ActivityHubView, 'id' | 'section' | 'kind'>): boolean {
  return hub.kind === 'options' && (hub.section === 'shopping' || hub.id === 'black_market');
}

type Filter = 'all' | 'afford' | 'owned' | string;

/**
 * A shop (U3): a full screen with your savings, filter chips, and a two-column grid of item cards; a card opens a detail sheet
 * with Buy (or Sell when you own it). Luxury shops are gold. What each item does is the leisure engine's (age, limits, price).
 */
export function ShopScreen({ life, hubId, onClose }: { life: LifeState; hubId: string; onClose: () => void }) {
  const tab = getActivityTabView(life, content);
  const category = tab.categories.find((c) => c.sections.some((x) => x.activities.some((a) => a.id === hubId)));
  const hub = category?.sections.flatMap((x) => x.activities).find((a) => a.id === hubId);
  const all = getActivitiesView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [look, setLook] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ entry: ActivityEntryView; look: string | undefined } | null>(null);
  if (!hub || !category) return null;
  const def = content.registries.activities.activities.find((a) => a.id === hubId)!;
  const gold = category.accent === 'gold';
  const tone: TileTone = (SHOP_TONES[hubId] ?? SHOP_TONES[category.id] ?? 'money') as TileTone;
  const disabled = busy || !tab.canAct || hub.block !== null;
  const ownedOf = (entry: ActivityEntryView) => {
    const valuableId = content.pastimes[entry.id]?.buys;
    return valuableId ? life.possessions.items.find((p) => p.kind === 'valuable' && p.defId === valuableId) : undefined;
  };
  const kinds = [...new Set(hub.options.flatMap((e) => (e.look ? [e.look.kind] : [])))];
  const afford = (e: ActivityEntryView) => e.block !== 'afford';
  const shown = hub.options.filter((e) => (filter === 'all' ? true : filter === 'afford' ? afford(e) : filter === 'owned' ? ownedOf(e) !== undefined : e.look?.kind === filter));
  const chips = [
    { id: 'all', label: 'All', testId: 'shop-filter-all' },
    ...(kinds.length > 1 ? kinds.map((k) => ({ id: k as string, label: LOOK_KIND_LABELS[k], testId: `shop-filter-${k}` })) : []),
    { id: 'afford', label: 'I can afford', testId: 'shop-filter-afford' },
    { id: 'owned', label: 'Owned', testId: 'shop-filter-owned' },
  ];
  const entry = hub.options.find((e) => e.id === openId) ?? null;
  const owned = entry ? ownedOf(entry) : undefined;
  const confirmCfg = content.balance.activities.confirm;
  const big = (price: number) => price > 0 && price >= Math.max(scaledAmount(life, confirmCfg.min, content), Math.round(tab.savings * confirmCfg.share));
  const buy = (e: ActivityEntryView, pickedLook: string | undefined) => {
    const params: LifeActionParams & { pastimeId: string } = { pastimeId: e.id, ...(e.look ? { look: pickedLook ?? e.look.options[0] } : {}) };
    setOpenId(null);
    void act('do_activity', params);
  };
  const latest = all.receipts.find((r) => content.pastimes[r.pastimeId]?.hub === hubId);
  return (
    <>
      <StoreScreen
        open
        title={def.label}
        onBack={onClose}
        balance={money(tab.savings)}
        gold={gold}
        testId={`activity-sheet-${hubId}`}
        info={
          <>
            <p>{def.subtitle}</p>
            <p>Each time you buy in the same shop in a year, you get less from it.</p>
            <p>{hub.count} of {hub.limit} purchases this year.</p>
          </>
        }
        chips={<FilterChips label="Filter" value={filter} onChange={setFilter} chips={chips} />}
      >
        {shown.length === 0 && <li className="col-span-2 px-1 text-muted">Nothing here.</li>}
        {shown.map((e) => {
          const reason = reasonOf(e, e.price, tab.savings, disabled);
          return <ItemCard key={e.id} name={e.label} fact={content.valuables?.[content.pastimes[e.id]?.buys ?? '']?.blurb ?? e.blurb} price={money(e.price)} icon={def.icon} tone={tone} gold={gold} owned={ownedOf(e) !== undefined} {...(reason && ownedOf(e) === undefined ? { reason } : {})} onClick={() => { setOpenId(e.id); setLook(null); }} testId={`item-${e.id}`} />;
        })}
        {latest && (
          <li className="col-span-2">
            <ReceiptCard receipt={latest} balance={all.savings} latest />
          </li>
        )}
      </StoreScreen>
      <ItemDetailSheet
        open={entry !== null}
        item={entry ? { name: entry.label, icon: def.icon, tone, facts: [['Price', money(entry.price)], ['Your savings', money(tab.savings)], ['After buying', money(Math.max(0, tab.savings - entry.price))], ...(owned ? ([['Worth now', money(owned.value)]] as [string, string][]) : [])], blurb: entry.blurb, price: money(entry.price), owned: owned !== undefined, gold } : null}
        onClose={() => setOpenId(null)}
        busy={busy}
        reason={entry ? reasonOf(entry, entry.price, tab.savings, disabled) : undefined}
        onBuy={() => entry && (big(entry.price) ? setAsking({ entry, look: look ?? undefined }) : buy(entry, look ?? undefined))}
        onSell={owned ? () => { setOpenId(null); void act('sell_valuable', { possessionId: owned.id }); } : undefined}
        extra={
          entry?.look && (
            <FilterChips wrap label={LOOK_KIND_LABELS[entry.look.kind]} value={look ?? entry.look.options[0]!} onChange={setLook} chips={entry.look.options.map((o) => ({ id: o, label: lookWords(o), testId: `look-${entry.id}-${o}` }))} />
          )
        }
      />
      <ConfirmSheet
        open={asking !== null}
        title="Are you sure?"
        body={asking ? `This takes ${money(asking.entry.price)} of your ${money(tab.savings)}.` : ''}
        confirmLabel="Yes, buy it"
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const a = asking;
          setAsking(null);
          if (a) buy(a.entry, a.look);
        }}
      />
    </>
  );
}
