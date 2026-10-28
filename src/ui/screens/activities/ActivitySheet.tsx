import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { content } from '../../../content';
import type { ActivityKind, PastimeQuality, PastimeStake } from '../../../content/schemas';
import { getActivitiesView, getActivityTabView, type ActivityEntryView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Sheet } from '../../components/Sheet';
import { ACTIVITY_TAB_LABELS, HUB_BLOCK_WORDS, money } from '../../labels';
import { EntryRow, ReceiptCard, type Picks } from '../more/ActivitiesScreen';
import { DoctorPanel } from './DoctorPanel';

/** The sheet of one activity of the Activities tab (A1): its options, with the price on each button, then the outcome card. */
export function ActivitySheet({ life }: { life: LifeState }) {
  const id = useAppStore((s) => s.activitySheet);
  const eventOpen = useAppStore((s) => s.eventSheet !== null);
  const close = useAppStore((s) => s.closeActivity);
  const hub = id ? content.registries.activities.activities.find((a) => a.id === id) : undefined;
  // An event card that an outcome opens comes first; the sheet is still there when it is done.
  if (!hub || eventOpen) return null;
  return (
    <Sheet open title={hub.label} onClose={close}>
      <SheetBody life={life} hubId={hub.id} kind={hub.kind} />
    </Sheet>
  );
}

function SheetBody({ life, hubId, kind }: { life: LifeState; hubId: string; kind: ActivityKind }) {
  const openTravel = useAppStore((s) => s.openTravel);
  const closeActivity = useAppStore((s) => s.closeActivity);
  if (kind === 'doctor') return <DoctorPanel life={life} />;
  if (kind === 'own_thing') return <p className="text-muted">{ACTIVITY_TAB_LABELS.ownThingBody}</p>;
  return (
    <div className="flex flex-col gap-3">
      <Options life={life} hubId={hubId} />
      {kind === 'vacation' && (
        <button
          type="button"
          data-testid="activity-plan-trip"
          onClick={() => {
            closeActivity();
            openTravel();
          }}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 text-left active:bg-surface"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-display text-base font-semibold">{ACTIVITY_TAB_LABELS.plan}</span>
            <span className="text-sm text-muted">{ACTIVITY_TAB_LABELS.planBody}</span>
          </span>
          <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
        </button>
      )}
    </div>
  );
}

/** The options of an activity: each is an entry of the leisure engine (age, legal and yearly limits, price, companions and portrait choices are the engine's). */
function Options({ life, hubId }: { life: LifeState; hubId: string }) {
  const tab = getActivityTabView(life, content);
  const hub = tab.groups.flatMap((g) => g.activities).find((a) => a.id === hubId);
  const all = getActivitiesView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [who, setWho] = useState<Record<string, string | null>>({});
  const [picks, setPicks] = useState<Record<string, Picks>>({});
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

  const choose = (entry: ActivityEntryView, extra: { quality?: PastimeQuality; stake?: PastimeStake } = {}) => {
    const companionId = who[entry.id] ?? (entry.companion === 'required' ? entry.companions[0]?.id : undefined);
    const p = picks[entry.id] ?? {};
    void act('do_activity', {
      pastimeId: entry.id,
      ...(companionId ? { companionId } : {}),
      ...(extra.quality ? { quality: extra.quality } : {}),
      ...(extra.stake ? { stake: extra.stake } : {}),
      ...(entry.mechanic === 'gamble' && p.chase ? { chase: true } : {}),
      ...(entry.look ? { look: p.look ?? entry.look.options[0] } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid={`activity-sheet-${hubId}`}>
      <p className="text-sm text-muted">
        You have {money(tab.savings)} saved. {ACTIVITY_TAB_LABELS.doneThisYear(hub.count, hub.limit)} Each time you do the same thing in a year, you get less from it and it is likelier to go wrong.
      </p>
      {hub.block?.reason === 'age' && <p data-testid="activity-blocked">{HUB_BLOCK_WORDS.age(hub.block.minAge)}</p>}
      {latest && (
        <div ref={latestRef}>
          <ReceiptCard receipt={latest} balance={all.savings} latest />
        </div>
      )}
      <ul className="flex flex-col divide-y divide-border" aria-label={hub.label}>
        {hub.options.map((entry) => (
          <EntryRow
            key={entry.id}
            life={life}
            entry={entry}
            disabled={disabled}
            selected={who[entry.id] ?? null}
            picks={picks[entry.id] ?? {}}
            onPick={(p) => setPicks((a) => ({ ...a, [entry.id]: { ...(a[entry.id] ?? {}), ...p } }))}
            onWho={(pid) => setWho((w) => ({ ...w, [entry.id]: pid }))}
            onDo={(extra) => choose(entry, extra)}
          />
        ))}
      </ul>
    </div>
  );
}
