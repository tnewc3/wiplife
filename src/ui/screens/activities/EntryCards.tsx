import { useState } from 'react';
import { content } from '../../../content';
import { PASTIME_QUALITIES, PASTIME_ROUTES, type PastimeQuality, type PastimeRoute, type PastimeStake } from '../../../content/schemas';
import { nameIssue, parseLegalName, type ActivityEntryView, type ReceiptView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Card } from '../../components/Card';
import { EffectChip, FactChip } from '../../components/FactChip';
import { FilterChips } from '../../components/FilterChips';
import { OptionCard } from '../../components/OptionPickerSheet';
import { RenameDialog } from '../../components/RenameDialog';
import type { Picks } from './picks';
import { effectChips } from './effectChips';
import {
  ACTIVITY_TAB_LABELS,
  CHASE_LABEL,
  companionChangeWords,
  evidenceWords,
  HOBBY_LEVEL_LABELS,
  LAWYER_QUALITY_LABELS,
  LOAN_BLOCK_LABELS,
  loanOfferWords,
  LOOK_KIND_LABELS,
  lookWords,
  MINIGAME_LABELS,
  money,
  moneyChange,
  OUTCOME_TIER_LABELS,
  PASTIME_BLOCK_LABELS,
  PASTIME_QUALITY_LABELS,
  PASTIME_ROUTE_LABELS,
  PASTIME_STAKE_LABELS,
  pastimeChangeWords,
} from '../../labels';

/** The chips of an option: what it does (from content), then a mini-game, a hobby's level or the item it buys. */
function chipsOf(entry: ActivityEntryView) {
  const def = content.pastimes[entry.id];
  return (
    <>
      {effectChips(def).map((c) => (
        <EffectChip key={c.text} tone={c.tone}>
          {c.text}
        </EffectChip>
      ))}
      {entry.minigame && <FactChip>{MINIGAME_LABELS.playOrAuto}</FactChip>}
      {entry.hobby && <FactChip>{ACTIVITY_TAB_LABELS.hobbySkill(HOBBY_LEVEL_LABELS[Math.min(entry.hobby.level, HOBBY_LEVEL_LABELS.length - 1)]!, entry.hobby.skill)}</FactChip>}
      {entry.buys && <FactChip>A belonging: {entry.buys}</FactChip>}
      {entry.evidence !== null && <FactChip>{evidenceWords(entry.evidence)}</FactChip>}
    </>
  );
}

/** Why an option can't be chosen now, as the short chip that greys its card ("Needs $40 more", "Done this year"). */
export function reasonOf(entry: ActivityEntryView, price: number, savings: number, blockedByPhase: boolean): string | undefined {
  if (blockedByPhase) return 'Not now';
  if (entry.block === 'limit') return 'Done this year';
  if (entry.block === 'afford') return `Needs ${money(Math.max(0, price - savings))} more`;
  if (entry.block !== null && !['companion', 'name', 'consent', 'stake', 'route', 'quality', 'look'].includes(entry.block)) return PASTIME_BLOCK_LABELS[entry.block]?.replace(/\.$/, '') ?? 'Not now';
  return undefined;
}

const priceWord = (n: number) => (n === 0 ? 'Free' : money(n));

/**
 * The option cards of one entry of an activity (U3). A plain option is one card; a stake, a lawyer or surgeon tier or a
 * name change is a few. Choices that go with it (who comes along, how a lawsuit ends, the look) are chips under the card.
 * The whole card is the button; `onDo` says what was chosen.
 */
export function EntryCards({
  life,
  entry,
  disabled,
  savings,
  selected,
  picks,
  onPick,
  onWho,
  onDo,
}: {
  life: LifeState;
  entry: ActivityEntryView;
  disabled: boolean;
  savings: number;
  selected: string | null;
  picks: Picks;
  onPick: (p: Picks) => void;
  onWho: (id: string | null) => void;
  onDo: (extra: { quality?: PastimeQuality; stake?: PastimeStake } | undefined, price: number) => void;
}) {
  const [nameDialog, setNameDialog] = useState<'first' | 'last' | null>(null);
  const together = selected !== null || entry.companion === 'required';
  const price = together ? (entry.priceTogether ?? entry.price) : entry.price;
  const blockedNow = entry.block === 'limit';
  const lawyer = entry.mechanic === 'lawsuit';
  const route: PastimeRoute = picks.route ?? 'settle';
  const chasing = entry.mechanic === 'gamble' && picks.chase === true && entry.chase?.available === true;
  const nameBlock = entry.name ? nameIssue(life, entry.id, nameChoice(entry, picks), content) : null;
  const phase = disabled;
  const generalReason = reasonOf(entry, price, savings, phase);
  const chips = chipsOf(entry);

  const companionChips =
    entry.companion !== 'none' && entry.companions.length > 0 ? (
      <FilterChips
        wrap
        label={`Who comes along on ${entry.label}`}
        value={selected ?? (entry.companion === 'required' ? entry.companions[0]!.id : 'alone')}
        onChange={(v) => onWho(v === 'alone' ? null : v)}
        chips={[...(entry.companion === 'optional' ? [{ id: 'alone', label: 'Alone', testId: `who-${entry.id}-alone` }] : []), ...entry.companions.slice(0, 6).map((c) => ({ id: c.id, label: c.name, testId: `who-${entry.id}-${c.id}` }))]}
      />
    ) : null;
  const lookChips = entry.look ? (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{LOOK_KIND_LABELS[entry.look.kind]}</span>
      <FilterChips wrap label={LOOK_KIND_LABELS[entry.look.kind]} value={picks.look ?? entry.look.options[0]!} onChange={(v) => onPick({ look: v })} chips={entry.look.options.map((o) => ({ id: o, label: lookWords(o), testId: `look-${entry.id}-${o}` }))} />
    </div>
  ) : null;
  const routeChips = entry.routes ? (
    <FilterChips wrap label={`How ${entry.label} ends`} value={route} onChange={(v) => onPick({ route: v })} chips={PASTIME_ROUTES.map((r) => ({ id: r, label: PASTIME_ROUTE_LABELS[r], testId: `route-${entry.id}-${r}` }))} />
  ) : null;
  const extras = (companionChips || lookChips || routeChips) && (
    <>
      {companionChips}
      {lookChips}
      {routeChips}
    </>
  );

  if (entry.stakes) {
    return (
      <div className="flex flex-col gap-2" data-testid={`activity-${entry.id}`}>
        {extras}
        {entry.chase?.available && (
          <button type="button" aria-pressed={chasing} disabled={disabled} data-testid={`chase-${entry.id}`} onClick={() => onPick({ chase: !chasing })} className={`wl-press min-h-11 rounded-xl border px-4 py-2 text-left text-sm font-medium disabled:opacity-50 ${chasing ? 'border-danger bg-surface-2' : 'border-border bg-surface'}`}>
            {CHASE_LABEL(money(entry.chase.loss), chasing)}
          </button>
        )}
        {entry.stakes.map((row) => {
          const p = chasing ? row.chasePrice : row.price;
          const block = chasing ? row.chaseBlock : row.block;
          return (
            <OptionCard
              key={row.stake}
              name={`${entry.label} · ${PASTIME_STAKE_LABELS[row.stake]}`}
              chips={chips}
              price={priceWord(p)}
              reason={phase || blockedNow ? 'Not now' : block === 'afford' ? `Needs ${money(Math.max(0, p - savings))} more` : block !== null ? 'Not now' : undefined}
              testId={`do-${entry.id}-${row.stake}`}
              onClick={() => onDo({ stake: row.stake }, p)}
            />
          );
        })}
      </div>
    );
  }
  if (entry.qualities) {
    return (
      <div className="flex flex-col gap-2" data-testid={`activity-${entry.id}`}>
        {extras}
        {PASTIME_QUALITIES.map((q) => {
          const row = entry.qualities!.find((x) => x.quality === q)!;
          const blockHere = lawyer && entry.routes ? (entry.routes.find((r) => r.route === route)?.block ?? null) : row.block;
          const off = phase || blockedNow || row.block !== null || (lawyer && blockHere !== null && blockHere !== 'quality');
          return (
            <OptionCard
              key={q}
              name={`${entry.label} · ${lawyer ? LAWYER_QUALITY_LABELS[q] : PASTIME_QUALITY_LABELS[q]}`}
              chips={chips}
              price={priceWord(row.price)}
              reason={off ? (row.block === 'afford' ? `Needs ${money(Math.max(0, row.price - savings))} more` : 'Not now') : undefined}
              testId={`do-${entry.id}-${q}`}
              onClick={() => onDo({ quality: q }, row.price)}
            />
          );
        })}
      </div>
    );
  }
  if (entry.loan) {
    return (
      <OptionCard
        name={entry.label}
        chips={<FactChip>{entry.loan.block ? LOAN_BLOCK_LABELS[entry.loan.block] : loanOfferWords(entry.loan.lender, money(entry.loan.amount), Math.round(entry.loan.rate * 100), entry.loan.termYears, entry.loan.fee > 0 ? money(entry.loan.fee) : null)}</FactChip>}
        price={entry.loan.block ? undefined : money(entry.loan.amount)}
        reason={phase || entry.block !== null || blockedNow || entry.loan.block ? (entry.loan.block ? 'Not offered' : 'Not now') : undefined}
        testId={`do-${entry.id}`}
        onClick={() => onDo(undefined, 0)}
      />
    );
  }
  if (entry.name) {
    const n = entry.name;
    const need = nameIssue(life, entry.id, nameChoice(entry, picks), content);
    return (
      <OptionCard name={entry.label} chips={chips} price={priceWord(entry.price)} reason={phase ? 'Not now' : need ? (PASTIME_BLOCK_LABELS[need as keyof typeof PASTIME_BLOCK_LABELS]?.replace(/\.$/, '') ?? 'Not now') : undefined} testId={`do-${entry.id}`} onClick={() => onDo(undefined, entry.price)}>
        {n.fields.includes('first') && <NameRow label="New first name" value={picks.first ?? ''} placeholder={n.current.first} onOpen={() => setNameDialog('first')} testId={`name-first-${entry.id}`} />}
        {n.fields.includes('last') && <NameRow label="New family name" value={picks.last ?? ''} placeholder={n.current.last} onOpen={() => setNameDialog('last')} testId={`name-last-${entry.id}`} />}
        {n.takes && <span className="text-sm" data-testid={`name-takes-${entry.id}`}>You would be {n.takes.first} {n.takes.last}.</span>}
        {!n.adult && n.consent.length > 0 && (
          <FilterChips wrap label="Who agrees" value={picks.consent ?? n.consent[0]!.id} onChange={(v) => onPick({ consent: v })} chips={n.consent.map((c) => ({ id: c.id, label: `${c.name} agrees`, testId: `consent-${entry.id}-${c.id}` }))} />
        )}
        <RenameDialog open={nameDialog !== null} title={nameDialog === 'first' ? 'New first name' : 'New family name'} label="Name" initial={nameDialog ? (picks[nameDialog] ?? '') : ''} allowSame maxLength={30} testId={`name-input-${entry.id}`} onCancel={() => setNameDialog(null)} onSave={(t) => { if (nameDialog) onPick({ [nameDialog]: t }); setNameDialog(null); }} />
        <span className="hidden">{nameBlock}</span>
      </OptionCard>
    );
  }
  return (
    <OptionCard name={entry.label} chips={chips} price={priceWord(price)} reason={generalReason} testId={`do-${entry.id}`} onClick={() => onDo(undefined, price)} gold={false}>
      {extras}
    </OptionCard>
  );
}

function NameRow({ label, value, placeholder, onOpen, testId }: { label: string; value: string; placeholder: string; onOpen: () => void; testId: string }) {
  return (
    <button type="button" onClick={onOpen} data-testid={testId} className="wl-press flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 text-left">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{value || placeholder}</span>
    </button>
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

/** What an activity came to: the words, what moved (in words), and the money with the balance after it. */
export function ReceiptCard({ receipt, balance, latest }: { receipt: ReceiptView; balance: number; latest?: boolean }) {
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
