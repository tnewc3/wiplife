import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { content } from '../../../content';
import type { ActivityKind, PastimeQuality, PastimeStake } from '../../../content/schemas';
import type { LifeActionParams } from '../../../engine/actions';
import { scaledAmount } from '../../../engine/country';
import { getActivitiesView, getActivityTabView, type ActivityEntryView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { OptionPickerSheet } from '../../components/OptionPickerSheet';
import { ACTIVITY_TAB_LABELS, HUB_BLOCK_WORDS, money, PASTIME_CATEGORY_NOTES } from '../../labels';
import { DoctorPanel } from './DoctorPanel';
import { EntryCards, ReceiptCard } from './EntryCards';
import { nameParams, type Picks } from './picks';
import { ShopScreen } from './ShopScreen';
import { isShop } from './shops';

/**
 * The sheet of one activity of the Activities tab (U3): the option picker. A header with the icon, the title, one line, your
 * savings and how fresh the activity still is this year; a card for each option with effect chips (read from content) and a
 * price; a tap does it and shows the outcome card. A purchase that takes a big share of your savings asks first.
 */
export function ActivitySheet({ life }: { life: LifeState }) {
  const id = useAppStore((s) => s.activitySheet);
  const eventOpen = useAppStore((s) => s.eventSheet !== null);
  const close = useAppStore((s) => s.closeActivity);
  const hub = id ? content.registries.activities.activities.find((a) => a.id === id) : undefined;
  // An event card that an outcome opens comes first; the sheet is still there when it is done.
  if (!hub || eventOpen) return null;
  return <Picker life={life} hubId={hub.id} kind={hub.kind} onClose={close} />;
}

function Picker({ life, hubId, kind, onClose }: { life: LifeState; hubId: string; kind: ActivityKind; onClose: () => void }) {
  const tab = getActivityTabView(life, content);
  const category = tab.categories.find((c) => c.sections.some((x) => x.activities.some((a) => a.id === hubId)));
  const hub = category?.sections.flatMap((x) => x.activities).find((a) => a.id === hubId);
  const def = content.registries.activities.activities.find((a) => a.id === hubId)!;
  const gold = category?.accent === 'gold';
  if (hub && isShop(hub)) return <ShopScreen life={life} hubId={hubId} onClose={onClose} />;
  const freshness = kind === 'options' || kind === 'hobbies' || kind === 'vacation' ? { done: hub?.count ?? 0, limit: hub?.limit ?? 1 } : undefined;
  return (
    <OptionPickerSheet open title={def.label} icon={def.icon} line={def.subtitle} balance={money(tab.savings)} freshness={freshness} gold={gold} onClose={onClose} testId={`activity-sheet-${hubId}`}>
      <Body life={life} hubId={hubId} kind={kind} gold={gold} />
    </OptionPickerSheet>
  );
}

function Body({ life, hubId, kind, gold }: { life: LifeState; hubId: string; kind: ActivityKind; gold: boolean }) {
  const openTravel = useAppStore((s) => s.openTravel);
  const closeActivity = useAppStore((s) => s.closeActivity);
  if (kind === 'doctor') return <DoctorPanel life={life} />;
  if (kind === 'own_thing') return <p className="text-muted">{ACTIVITY_TAB_LABELS.ownThingBody}</p>;
  return (
    <>
      <Options life={life} hubId={hubId} gold={gold} />
      {kind === 'vacation' && (
        <button
          type="button"
          data-testid="activity-plan-trip"
          onClick={() => {
            closeActivity();
            openTravel();
          }}
          className="wl-press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 text-left"
        >
          <span className="font-display min-w-0 flex-1 text-base font-semibold">{ACTIVITY_TAB_LABELS.plan}</span>
          <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
        </button>
      )}
    </>
  );
}

/** The options of an activity: each is an entry of the leisure engine (age, legal and yearly limits, price, companions and portrait choices are the engine's). */
function Options({ life, hubId, gold }: { life: LifeState; hubId: string; gold: boolean }) {
  const tab = getActivityTabView(life, content);
  const hub = tab.categories.flatMap((c) => c.sections.flatMap((x) => x.activities)).find((a) => a.id === hubId);
  const all = getActivitiesView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openMiniGame = useAppStore((s) => s.openMiniGame);
  const [who, setWho] = useState<Record<string, string | null>>({});
  const [picks, setPicks] = useState<Record<string, Picks>>({});
  const [asking, setAsking] = useState<{ run: () => void; price: number } | null>(null);
  const latestRef = useRef<HTMLDivElement | null>(null);
  const latest = all.receipts.find((r) => content.pastimes[r.pastimeId]?.hub === hubId);
  const count = all.receipts.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) latestRef.current?.scrollIntoView({ block: 'nearest' });
    seen.current = count;
  }, [count]);
  if (!hub) return null;
  const disabled = busy || !tab.canAct || hub.block !== null;
  // What to know before you choose, for the risky categories (crime, the black market, gambling, lawsuits, names, loans).
  const note = PASTIME_CATEGORY_NOTES[content.pastimes[hub.options[0]?.id ?? '']?.category as keyof typeof PASTIME_CATEGORY_NOTES];
  const confirmCfg = content.balance.activities.confirm;
  const big = (price: number) => price >= Math.max(scaledAmount(life, confirmCfg.min, content), Math.round(tab.savings * confirmCfg.share)) && price > 0;

  const choose = (entry: ActivityEntryView, extra: { quality?: PastimeQuality; stake?: PastimeStake } = {}) => {
    const companionId = who[entry.id] ?? (entry.companion === 'required' ? entry.companions[0]?.id : undefined);
    const p = picks[entry.id] ?? {};
    const params: LifeActionParams & { pastimeId: string } = {
      pastimeId: entry.id,
      ...(companionId ? { companionId } : {}),
      ...(extra.quality ? { quality: extra.quality } : {}),
      ...(extra.stake ? { stake: extra.stake } : {}),
      ...(entry.mechanic === 'gamble' && p.chase ? { chase: true as const } : {}),
      ...(entry.routes ? { route: p.route ?? 'settle' } : {}),
      ...(entry.look ? { look: p.look ?? entry.look.options[0] } : {}),
      ...(entry.name ? nameParams(entry, p) : {}),
    };
    // G1: an activity with a mini-game opens it first; its result (or Auto) comes back with the same choices.
    if (entry.minigame) openMiniGame({ game: entry.minigame, source: { kind: 'activity', params } });
    else void act('do_activity', params);
  };

  return (
    <>
      {hub.block?.reason === 'age' && <p data-testid="activity-blocked">{HUB_BLOCK_WORDS.age(hub.block.minAge)}</p>}
      {latest && (
        <div ref={latestRef}>
          <ReceiptCard receipt={latest} balance={all.savings} latest />
        </div>
      )}
      <div className="flex flex-col gap-2" aria-label={hub.label} role="group">
        {hub.options.map((entry) => (
          <div key={entry.id} data-testid={`activity-${entry.id}`}>
          <EntryCards
            life={life}
            entry={entry}
            disabled={disabled}
            savings={tab.savings}
            selected={who[entry.id] ?? null}
            picks={picks[entry.id] ?? {}}
            onPick={(p) => setPicks((a) => ({ ...a, [entry.id]: { ...(a[entry.id] ?? {}), ...p } }))}
            onWho={(pid) => setWho((w) => ({ ...w, [entry.id]: pid }))}
            onDo={(extra, price) => {
              const run = () => choose(entry, extra);
              if (big(price)) setAsking({ run, price });
              else run();
            }}
          />
          </div>
        ))}
      </div>
      {note && (
        <p className="px-1 text-xs text-muted" data-testid="activity-note">
          ⓘ {note}
        </p>
      )}
      <ConfirmSheet
        open={asking !== null}
        title="Are you sure?"
        body={asking ? `This takes ${money(asking.price)} of your ${money(tab.savings)}.` : ''}
        confirmLabel={gold ? 'Yes, buy it' : 'Yes'}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const run = asking?.run;
          setAsking(null);
          run?.();
        }}
      />
    </>
  );
}
