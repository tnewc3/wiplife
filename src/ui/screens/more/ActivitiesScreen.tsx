import { useEffect, useRef, useState } from 'react';
import { content } from '../../../content';
import { PASTIME_QUALITIES, type PastimeQuality } from '../../../content/schemas';
import { getActivitiesView, type ActivityEntryView, type ReceiptView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import {
  companionChangeWords,
  money,
  moneyChange,
  OUTCOME_TIER_LABELS,
  PASTIME_BLOCK_LABELS,
  PASTIME_CATEGORY_LABELS,
  PASTIME_QUALITY_LABELS,
  PASTIME_QUALITY_NOTES,
  pastimeChangeWords,
} from '../../labels';

/** More → Activities: leisure and self, grouped by category. Only what is on offer to you now; the price is on each button; an outcome shows the money change and your new balance. */
export function ActivitiesScreen({ life }: { life: LifeState }) {
  const view = getActivitiesView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [who, setWho] = useState<Record<string, string | null>>({});
  const disabled = busy || !view.canAct;
  const latest = view.receipts[0];
  const latestRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(view.receipts.length);

  // A new outcome comes into view at the top.
  useEffect(() => {
    if (view.receipts.length > seen.current) latestRef.current?.scrollIntoView({ block: 'nearest' });
    seen.current = view.receipts.length;
  }, [view.receipts.length]);

  const choose = (entry: ActivityEntryView, quality?: PastimeQuality) => {
    const companionId = who[entry.id] ?? (entry.companion === 'required' ? entry.companions[0]?.id : undefined);
    void act('do_activity', { pastimeId: entry.id, ...(companionId ? { companionId } : {}), ...(quality ? { quality } : {}) });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="activities-title" data-testid="activities-summary">
        <h2 id="activities-title" className="text-2xl leading-tight font-bold">
          What would you like to do?
        </h2>
        <p className="mt-1 text-muted">Time for yourself, with a price on it. You have {money(view.savings)} saved. Doing the same thing again and again in a year gives you less each time.</p>
        {!view.canAct && <p className="mt-2 text-sm">Activities are for when you are free to go out.</p>}
      </Card>

      {latest && (
        <div ref={latestRef}>
          <ReceiptCard receipt={latest} balance={view.savings} latest />
        </div>
      )}

      {view.groups.map((g) => (
        <Card key={g.category} role="region" aria-labelledby={`cat-${g.category}`} data-testid={`activities-${g.category}`}>
          <h3 id={`cat-${g.category}`} className="text-lg font-bold">
            {PASTIME_CATEGORY_LABELS[g.category]}
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={PASTIME_CATEGORY_LABELS[g.category]}>
            {g.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} disabled={disabled} selected={who[entry.id] ?? null} onWho={(id) => setWho((w) => ({ ...w, [entry.id]: id }))} onDo={(q) => choose(entry, q)} />
            ))}
          </ul>
        </Card>
      ))}

      {view.receipts.length > 1 && (
        <Card role="region" aria-labelledby="earlier-title" data-testid="activities-earlier">
          <h3 id="earlier-title" className="text-lg font-bold">
            Earlier this year
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {view.receipts.slice(1).map((r) => (
              <li key={r.key} className="flex min-w-0 flex-col py-2">
                <span className="flex justify-between gap-3 font-semibold">
                  <span className="min-w-0 break-words">{r.label}</span>
                  {r.money && <span className="shrink-0 tabular-nums">{moneyChange(r.money.change)}</span>}
                </span>
                <span className="text-sm text-muted">{OUTCOME_TIER_LABELS[r.tier]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function EntryRow({ entry, disabled, selected, onWho, onDo }: { entry: ActivityEntryView; disabled: boolean; selected: string | null; onWho: (id: string | null) => void; onDo: (quality?: PastimeQuality) => void }) {
  const together = selected !== null || entry.companion === 'required';
  const price = together ? (entry.priceTogether ?? entry.price) : entry.price;
  const blockedNow = entry.block === 'limit';
  const priceWord = (n: number) => (n === 0 ? 'Free' : money(n));
  const reason = entry.block ? PASTIME_BLOCK_LABELS[entry.block] : undefined;
  const lead = entry.block === 'afford' || entry.block === 'limit' ? reason : null;
  return (
    <li className="flex min-w-0 flex-col gap-2 py-3" data-testid={`activity-${entry.id}`}>
      <span className="font-semibold break-words [overflow-wrap:anywhere]">{entry.label}</span>
      <span className="text-sm text-muted">{entry.blurb}</span>
      {entry.count > 0 && (
        <span className="text-sm text-muted">
          Done {entry.count} of {entry.limit} times this year.
        </span>
      )}

      {entry.companion !== 'none' && entry.companions.length > 0 && (
        <fieldset className="flex flex-wrap gap-2" aria-label={`Who comes along on ${entry.label}`}>
          {entry.companion === 'optional' && (
            <WhoPill label="Alone" on={selected === null} disabled={disabled} testId={`who-${entry.id}-alone`} onClick={() => onWho(null)} />
          )}
          {entry.companions.slice(0, 6).map((c) => (
            <WhoPill key={c.id} label={c.name} on={selected === c.id || (entry.companion === 'required' && selected === null && c.id === entry.companions[0]?.id)} disabled={disabled} testId={`who-${entry.id}-${c.id}`} onClick={() => onWho(c.id)} />
          ))}
        </fieldset>
      )}

      {entry.qualities ? (
        <div className="flex flex-col gap-2" role="group" aria-label={`Choose a surgeon for ${entry.label}`}>
          {PASTIME_QUALITIES.map((q) => {
            const row = entry.qualities!.find((x) => x.quality === q)!;
            return (
              <button
                key={q}
                type="button"
                className="flex min-h-11 w-full min-w-0 flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
                disabled={disabled || row.block !== null}
                data-testid={`do-${entry.id}-${q}`}
                onClick={() => onDo(q)}
              >
                <span className="flex justify-between gap-3 font-semibold">
                  <span>{PASTIME_QUALITY_LABELS[q]}</span>
                  <span className="tabular-nums">{priceWord(row.price)}</span>
                </span>
                <span className="text-sm text-muted">{row.block === 'afford' ? PASTIME_BLOCK_LABELS.afford : PASTIME_QUALITY_NOTES[q]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Button variant="secondary" block disabled={disabled || (entry.block !== null && entry.block !== 'companion') || blockedNow} data-testid={`do-${entry.id}`} onClick={() => onDo()}>
          {entry.label} · {priceWord(price)}
        </Button>
      )}
      {entry.buys && <span className="text-sm text-muted">It becomes one of your belongings: a {entry.buys}. Insurance and upkeep cost a little each year.</span>}
      {lead && !entry.qualities && <span className="text-sm text-muted">{lead}</span>}
    </li>
  );
}

function WhoPill({ label, on, disabled, testId, onClick }: { label: string; on: boolean; disabled: boolean; testId: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium disabled:opacity-50 ${on ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface text-text active:bg-surface-2'}`}
    >
      {label}
    </button>
  );
}

/** What an activity came to: the words, what moved (in words), and the money with the balance after it. */
function ReceiptCard({ receipt, balance, latest }: { receipt: ReceiptView; balance: number; latest?: boolean }) {
  const changes = pastimeChangeWords(receipt.changes);
  const companion = receipt.companion ? companionChangeWords(receipt.companion.name, receipt.companion.affection) : null;
  return (
    <Card role="region" aria-labelledby="receipt-title" data-testid={latest ? 'activity-receipt' : undefined} data-tier={receipt.tier}>
      <p className="text-sm font-semibold text-muted">{receipt.label}</p>
      <h3 id="receipt-title" className="text-lg font-bold">
        {OUTCOME_TIER_LABELS[receipt.tier]}
      </h3>
      <p className="mt-1" data-testid="receipt-text">{receipt.text}</p>
      {receipt.notes.map((n, i) => (
        <p key={i} className="mt-1" data-testid="receipt-note">
          {n}
        </p>
      ))}
      {(changes.length > 0 || companion) && (
        <ul className="mt-2 flex flex-col gap-0.5 text-sm text-muted" aria-label="What changed">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {companion && <li>{companion}</li>}
        </ul>
      )}
      <p className="mt-2 text-sm font-semibold" data-testid="receipt-money">
        {receipt.money
          ? `${moneyChange(receipt.money.change)} · You now have ${money(receipt.money.balance)}${receipt.money.debtChange > 0 ? `, and owe ${money(receipt.money.debtChange)} more` : ''}.`
          : `It cost nothing. You have ${money(balance)}.`}
      </p>
    </Card>
  );
}
