import { useEffect, useRef, useState } from 'react';
import { content } from '../../../content';
import { PASTIME_QUALITIES, PASTIME_ROUTES, type PastimeQuality, type PastimeRoute, type PastimeStake } from '../../../content/schemas';
import { getActivitiesView, nameIssue, parseLegalName, type ActivityEntryView, type ReceiptView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import {
  CHASE_LABEL,
  companionChangeWords,
  evidenceWords,
  LAWYER_QUALITY_LABELS,
  loanOfferWords,
  LAWYER_QUALITY_NOTES,
  LOAN_BLOCK_LABELS,
  money,
  moneyChange,
  OUTCOME_TIER_LABELS,
  PASTIME_BLOCK_LABELS,
  PASTIME_CATEGORY_LABELS,
  PASTIME_CATEGORY_NOTES,
  PASTIME_QUALITY_LABELS,
  PASTIME_QUALITY_NOTES,
  PASTIME_ROUTE_LABELS,
  PASTIME_ROUTE_NOTES,
  PASTIME_STAKE_LABELS,
  PASTIME_STAKE_NOTES,
  pastimeChangeWords,
} from '../../labels';

/** What the player has chosen on an entry before pressing its button: a lawsuit's route, a chase, a typed name, a parent's agreement. */
interface Picks {
  route?: PastimeRoute;
  chase?: boolean;
  first?: string;
  last?: string;
  consent?: string | null;
}

/** More → Activities: leisure and self, grouped by category. Only what is on offer to you now; the price is on each button; an outcome shows the money change and your new balance. */
export function ActivitiesScreen({ life }: { life: LifeState }) {
  const view = getActivitiesView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [who, setWho] = useState<Record<string, string | null>>({});
  const [picks, setPicks] = useState<Record<string, Picks>>({});
  const disabled = busy || !view.canAct;
  const latest = view.receipts[0];
  const latestRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(view.receipts.length);

  // A new outcome comes into view at the top.
  useEffect(() => {
    if (view.receipts.length > seen.current) latestRef.current?.scrollIntoView({ block: 'nearest' });
    seen.current = view.receipts.length;
  }, [view.receipts.length]);

  const choose = (entry: ActivityEntryView, extra: { quality?: PastimeQuality; stake?: PastimeStake } = {}) => {
    const companionId = who[entry.id] ?? (entry.companion === 'required' ? entry.companions[0]?.id : undefined);
    const p = picks[entry.id] ?? {};
    void act('do_activity', {
      pastimeId: entry.id,
      ...(companionId ? { companionId } : {}),
      ...(extra.quality ? { quality: extra.quality } : {}),
      ...(extra.stake ? { stake: extra.stake } : {}),
      ...(entry.mechanic === 'gamble' && p.chase ? { chase: true } : {}),
      ...(entry.routes ? { route: p.route ?? 'settle' } : {}),
      ...(entry.name ? nameParams(entry, p) : {}),
    });
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
          {PASTIME_CATEGORY_NOTES[g.category] && <p className="mt-1 text-sm text-muted">{PASTIME_CATEGORY_NOTES[g.category]}</p>}
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={PASTIME_CATEGORY_LABELS[g.category]}>
            {g.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                life={life}
                entry={entry}
                disabled={disabled}
                selected={who[entry.id] ?? null}
                picks={picks[entry.id] ?? {}}
                onPick={(p) => setPicks((all) => ({ ...all, [entry.id]: { ...(all[entry.id] ?? {}), ...p } }))}
                onWho={(id) => setWho((w) => ({ ...w, [entry.id]: id }))}
                onDo={(extra) => choose(entry, extra)}
              />
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

/** The typed names and the parent who agrees, as the action takes them (the engine checks and tidies them). */
function nameParams(entry: ActivityEntryView, p: Picks): { first?: string; last?: string; consentId?: string } {
  const n = entry.name!;
  return {
    ...(n.fields.includes('first') ? { first: p.first ?? '' } : {}),
    ...(n.fields.includes('last') ? { last: p.last ?? '' } : {}),
    ...(!n.adult && (p.consent ?? n.consent[0]?.id) ? { consentId: p.consent ?? n.consent[0]!.id } : {}),
  };
}

function EntryRow({
  life,
  entry,
  disabled,
  selected,
  picks,
  onPick,
  onWho,
  onDo,
}: {
  life: LifeState;
  entry: ActivityEntryView;
  disabled: boolean;
  selected: string | null;
  picks: Picks;
  onPick: (p: Picks) => void;
  onWho: (id: string | null) => void;
  onDo: (extra?: { quality?: PastimeQuality; stake?: PastimeStake }) => void;
}) {
  const together = selected !== null || entry.companion === 'required';
  const price = together ? (entry.priceTogether ?? entry.price) : entry.price;
  const blockedNow = entry.block === 'limit';
  const priceWord = (n: number) => (n === 0 ? 'Free' : money(n));
  const reason = entry.block ? PASTIME_BLOCK_LABELS[entry.block] : undefined;
  const lead = entry.block === 'afford' || entry.block === 'limit' ? reason : null;
  const lawyer = entry.mechanic === 'lawsuit';
  const route: PastimeRoute = picks.route ?? 'settle';
  const chasing = entry.mechanic === 'gamble' && picks.chase === true && entry.chase?.available === true;
  const nameBlock = entry.name ? nameIssue(life, entry.id, nameChoice(entry, picks), content) : null;
  const generalDisabled = disabled || (entry.block !== null && entry.block !== 'companion' && entry.block !== 'name' && entry.block !== 'consent' && entry.block !== 'stake' && entry.block !== 'route') || blockedNow;
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

      {entry.evidence !== null && (
        <span className="text-sm text-muted" data-testid={`evidence-${entry.id}`}>
          {evidenceWords(entry.evidence)}
        </span>
      )}

      {entry.routes && (
        <fieldset className="flex flex-wrap gap-2" aria-label={`How ${entry.label} ends`}>
          {PASTIME_ROUTES.map((r) => (
            <WhoPill key={r} label={PASTIME_ROUTE_LABELS[r]} on={route === r} disabled={disabled} testId={`route-${entry.id}-${r}`} onClick={() => onPick({ route: r })} />
          ))}
          <span className="basis-full text-sm text-muted">{PASTIME_ROUTE_NOTES[route]}</span>
        </fieldset>
      )}

      {entry.stakes && entry.chase?.available && (
        <button
          type="button"
          aria-pressed={chasing}
          disabled={disabled}
          data-testid={`chase-${entry.id}`}
          onClick={() => onPick({ chase: !chasing })}
          className={`min-h-11 rounded-xl border px-4 py-2 text-left text-sm font-medium disabled:opacity-50 ${chasing ? 'border-danger bg-surface-2 text-text' : 'border-border bg-surface text-text active:bg-surface-2'}`}
        >
          {CHASE_LABEL(money(entry.chase.loss), chasing)}
        </button>
      )}

      {entry.stakes ? (
        <div className="flex flex-col gap-2" role="group" aria-label={`Choose a stake for ${entry.label}`}>
          {entry.stakes.map((row) => {
            const p = chasing ? row.chasePrice : row.price;
            const block = chasing ? row.chaseBlock : row.block;
            return (
              <button
                key={row.stake}
                type="button"
                className="flex min-h-11 w-full min-w-0 flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
                disabled={disabled || block !== null || blockedNow}
                data-testid={`do-${entry.id}-${row.stake}`}
                onClick={() => onDo({ stake: row.stake })}
              >
                <span className="flex justify-between gap-3 font-semibold">
                  <span>{PASTIME_STAKE_LABELS[row.stake]}</span>
                  <span className="tabular-nums">{priceWord(p)}</span>
                </span>
                <span className="text-sm text-muted">{block === 'afford' ? PASTIME_BLOCK_LABELS.afford : PASTIME_STAKE_NOTES[row.stake]}</span>
              </button>
            );
          })}
        </div>
      ) : entry.qualities ? (
        <div className="flex flex-col gap-2" role="group" aria-label={`Choose ${lawyer ? 'a lawyer' : 'a surgeon'} for ${entry.label}`}>
          {PASTIME_QUALITIES.map((q) => {
            const row = entry.qualities!.find((x) => x.quality === q)!;
            const blockHere = lawyer && entry.routes ? (entry.routes.find((r) => r.route === route)?.block ?? null) : row.block;
            const off = disabled || row.block !== null || (lawyer && blockHere !== null && blockHere !== 'quality');
            return (
              <button
                key={q}
                type="button"
                className="flex min-h-11 w-full min-w-0 flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
                disabled={off}
                data-testid={`do-${entry.id}-${q}`}
                onClick={() => onDo({ quality: q })}
              >
                <span className="flex justify-between gap-3 font-semibold">
                  <span>{lawyer ? LAWYER_QUALITY_LABELS[q] : PASTIME_QUALITY_LABELS[q]}</span>
                  <span className="tabular-nums">{priceWord(row.price)}</span>
                </span>
                <span className="text-sm text-muted">{row.block === 'afford' ? PASTIME_BLOCK_LABELS.afford : lawyer ? LAWYER_QUALITY_NOTES[q] : PASTIME_QUALITY_NOTES[q]}</span>
              </button>
            );
          })}
        </div>
      ) : entry.loan ? (
        <>
          <span className="text-sm" data-testid={`loan-${entry.id}`}>
            {entry.loan.block
              ? LOAN_BLOCK_LABELS[entry.loan.block]
              : loanOfferWords(entry.loan.lender, money(entry.loan.amount), Math.round(entry.loan.rate * 100), entry.loan.termYears, entry.loan.fee > 0 ? money(entry.loan.fee) : null)}
          </span>
          <Button variant="secondary" block disabled={disabled || entry.block !== null || blockedNow} data-testid={`do-${entry.id}`} onClick={() => onDo()}>
            {entry.label}{entry.loan.block ? '' : ` · ${money(entry.loan.amount)}`}
          </Button>
        </>
      ) : entry.name ? (
        <NameForm entry={entry} picks={picks} onPick={onPick} disabled={disabled} issue={nameBlock} onDo={() => onDo()} />
      ) : (
        <Button variant="secondary" block disabled={disabled || generalDisabled} data-testid={`do-${entry.id}`} onClick={() => onDo()}>
          {entry.label} · {priceWord(price)}
        </Button>
      )}
      {entry.buys && <span className="text-sm text-muted">It becomes one of your belongings: a {entry.buys}. Insurance and upkeep cost a little each year.</span>}
      {lead && !entry.qualities && !entry.stakes && <span className="text-sm text-muted">{lead}</span>}
    </li>
  );
}

function nameChoice(entry: ActivityEntryView, p: Picks) {
  const n = entry.name!;
  return {
    ...(n.fields.includes('first') ? { first: parseLegalName(p.first) ?? undefined } : {}),
    ...(n.fields.includes('last') ? { last: parseLegalName(p.last) ?? undefined } : {}),
    ...(!n.adult && (p.consent ?? n.consent[0]?.id) ? { consentId: p.consent ?? n.consent[0]!.id } : {}),
  };
}

/** A legal name change: type the name (or see the one it will be), a parent who agrees when you are under 18, and the fee on the button. */
function NameForm({ entry, picks, onPick, disabled, issue, onDo }: { entry: ActivityEntryView; picks: Picks; onPick: (p: Picks) => void; disabled: boolean; issue: string | null; onDo: () => void }) {
  const n = entry.name!;
  const field = (key: 'first' | 'last', label: string) => (
    <label key={key} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base"
        value={picks[key] ?? ''}
        placeholder={n.current[key]}
        maxLength={30}
        autoComplete="off"
        data-testid={`name-${key}-${entry.id}`}
        disabled={disabled}
        onChange={(e) => onPick({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      {n.fields.includes('first') && field('first', 'New first name')}
      {n.fields.includes('last') && field('last', 'New family name')}
      {n.takes && (
        <span className="text-sm" data-testid={`name-takes-${entry.id}`}>
          You would be {n.takes.first} {n.takes.last}.
        </span>
      )}
      {!n.adult && n.consent.length > 0 && (
        <fieldset className="flex flex-wrap gap-2" aria-label="Who agrees">
          {n.consent.map((c, i) => (
            <WhoPill key={c.id} label={`${c.name} agrees`} on={(picks.consent ?? n.consent[0]!.id) === c.id || (picks.consent === undefined && i === 0)} disabled={disabled} testId={`consent-${entry.id}-${c.id}`} onClick={() => onPick({ consent: c.id })} />
          ))}
        </fieldset>
      )}
      <Button variant="secondary" block disabled={disabled || issue !== null} data-testid={`do-${entry.id}`} onClick={onDo}>
        {entry.label} · {entry.price === 0 ? 'Free' : money(entry.price)}
      </Button>
      {issue && <span className="text-sm text-muted">{PASTIME_BLOCK_LABELS[issue as keyof typeof PASTIME_BLOCK_LABELS] ?? 'Not right now.'}</span>}
    </div>
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
          ? `${receipt.money.change !== 0 ? `${moneyChange(receipt.money.change)} · ` : ''}You now have ${money(receipt.money.balance)}${receipt.money.debtChange > 0 ? `, and owe ${money(receipt.money.debtChange)} more` : ''}${receipt.money.debtChange < 0 ? `, and owe ${money(-receipt.money.debtChange)} less` : ''}.${receipt.money.dirty ? ` Dirty money ${moneyChange(receipt.money.dirty.change)}: ${money(receipt.money.dirty.balance)} not yet in your savings.` : ''}`
          : `It cost nothing. You have ${money(balance)}.`}
      </p>
    </Card>
  );
}
