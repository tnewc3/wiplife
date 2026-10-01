import { useState } from 'react';
import { content } from '../../../content';
import { LIFESTYLES, type Lifestyle } from '../../../content/schemas';
import { getMoneyView, type DebtView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { DEBT_LABELS, debtStatus, LEDGER_LABELS, LIFESTYLE_BLURBS, LIFESTYLE_LABELS, money, rateLabel } from '../../labels';

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-semibold' : ''}`}>
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

/** Last year's ledger, line by line. */
function LedgerCard({ life }: { life: LifeState }) {
  const { ledger } = getMoneyView(life, content);
  return (
    <Card role="region" aria-labelledby="ledger-title">
      <h2 id="ledger-title" className="mb-1 text-lg font-bold">
        {ledger ? `Last year (${ledger.year})` : 'Last year'}
      </h2>
      {!ledger ? (
        <p className="text-muted">Your first year’s money shows here after you age up.</p>
      ) : (
        <dl className="flex flex-col" aria-label="Last year’s money">
          <Row label={LEDGER_LABELS.gross} value={money(ledger.gross)} />
          {ledger.retirement > 0 && <Row label={LEDGER_LABELS.retirement} value={money(ledger.retirement)} />}
          <Row label={LEDGER_LABELS.tax} value={money(-ledger.tax)} />
          <Row label={LEDGER_LABELS.housing} value={money(-ledger.housing)} />
          <Row label={LEDGER_LABELS.living} value={money(-ledger.living)} />
          <Row label={LEDGER_LABELS.debtPayments} value={money(-ledger.debtPayments)} />
          <Row label={LEDGER_LABELS.interest} value={money(ledger.interest)} />
          <div className="mt-1 border-t border-border pt-1">
            <Row label={LEDGER_LABELS.net} value={money(ledger.net)} strong />
          </div>
          {ledger.support > 0 && <Row label={LEDGER_LABELS.support} value={money(ledger.support)} />}
          {ledger.borrowed > 0 && <Row label={LEDGER_LABELS.borrowed} value={money(ledger.borrowed)} />}
          {ledger.debtInterest > 0 && <Row label={LEDGER_LABELS.debtInterest} value={money(ledger.debtInterest)} />}
        </dl>
      )}
    </Card>
  );
}

/** Frugal, comfortable or lavish, with what each costs where you live. */
function LifestyleCard({ life }: { life: LifeState }) {
  const view = getMoneyView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const between = life.phase === 'yearStart';
  return (
    <Card role="region" aria-labelledby="lifestyle-title">
      <h2 id="lifestyle-title" className="mb-1 text-lg font-bold">
        Lifestyle
      </h2>
      {!view.independent ? (
        <p className="text-muted">Your family decides how you live for now.</p>
      ) : (
        <div role="radiogroup" aria-labelledby="lifestyle-title" className="flex flex-col gap-2">
          {LIFESTYLES.map((l: Lifestyle) => {
            const checked = view.lifestyle === l;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={busy || !between}
                onClick={() => !checked && void act('set_lifestyle', { lifestyle: l })}
                className={`flex min-h-11 w-full flex-col rounded-xl border px-4 py-2 text-left disabled:opacity-60 ${
                  checked ? 'border-accent bg-surface-2' : 'border-border'
                }`}
              >
                <span className="flex justify-between gap-2 font-semibold">
                  <span>{LIFESTYLE_LABELS[l]}</span>
                  <span className="tabular-nums">{money(view.lifestyleCosts[l])} a year</span>
                </span>
                <span className="text-sm text-muted">{LIFESTYLE_BLURBS[l]}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** The retirement benefit your earnings record adds up to. */
function RetirementCard({ life }: { life: LifeState }) {
  const { retirement: r } = getMoneyView(life, content);
  const yearsText = r.years === 1 ? '1 year' : `${r.years} years`;
  return (
    <Card role="region" aria-labelledby="retirement-title">
      <h2 id="retirement-title" className="mb-1 text-lg font-bold">
        Retirement
      </h2>
      <p data-testid="retirement-line">
        {r.receiving
          ? `You receive a retirement benefit of ${money(r.yearlyBenefit)} a year.`
          : r.years < r.minYears
            ? `From ${r.age}, a retirement benefit is paid to anyone with ${r.minYears} years of work. You have ${yearsText}.`
            : `From ${r.age}, your ${yearsText} of work would pay about ${money(r.yearlyBenefit)} a year.`}
      </p>
    </Card>
  );
}

function DebtRow({ debt, onPay }: { debt: DebtView; onPay: (debt: DebtView) => void }) {
  const busy = useAppStore((s) => s.aging);
  return (
    <li className="flex min-w-0 flex-col gap-1 py-3">
      <span className="flex justify-between gap-2 font-semibold">
        <span>{DEBT_LABELS[debt.kind]}</span>
        <span className="tabular-nums">{money(debt.balance)}</span>
      </span>
      <span className="text-sm text-muted">
        {rateLabel(debt.annualRate)} a year · {money(debt.minPayment)} {debt.paused ? 'a year once you’re done with school' : 'due each year'}
      </span>
      <span
        className={`text-sm ${!debt.paused && (debt.missed > 0 || debt.kind === 'collections') ? 'font-semibold text-danger' : 'text-muted'}`}
        data-testid={`debt-status-${debt.kind}`}
      >
        {debtStatus(debt.kind, debt.missed, debt.paused)}
      </span>
      {debt.canPay > 0 && (
        <Button variant="secondary" block disabled={busy} className="mt-1" onClick={() => onPay(debt)}>
          {debt.canPay >= debt.balance ? `Pay it off (${money(debt.canPay)})` : `Pay ${money(debt.canPay)} toward it`}
        </Button>
      )}
    </li>
  );
}

/** The Money tab: savings, debts, last year's ledger and your lifestyle. */
export function MoneyTab({ life }: { life: LifeState }) {
  const view = getMoneyView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [confirm, setConfirm] = useState<{ kind: 'pay'; debt: DebtView } | { kind: 'plan' } | null>(null);

  const sheet =
    confirm?.kind === 'pay'
      ? {
          title: `Pay ${money(confirm.debt.canPay)}?`,
          body: `It comes out of your savings and goes toward your ${DEBT_LABELS[confirm.debt.kind].toLowerCase()}.`,
          label: 'Pay',
        }
      : confirm?.kind === 'plan'
        ? {
            title: 'Set up a debt plan?',
            body: 'Your personal loans, medical bills and collections debt become one loan at a lower rate, with a fee. You’ll be back on track.',
            label: 'Set up the plan',
          }
        : null;

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="money-title">
        <h2 id="money-title" className="sr-only">
          Your money
        </h2>
        <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Your money">
          <div className="flex flex-col">
            <dt className="text-sm text-muted">Savings</dt>
            <dd className="text-lg font-bold tabular-nums" data-testid="savings">
              {money(view.savings)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm text-muted">Debt</dt>
            <dd className="text-lg font-bold tabular-nums" data-testid="debt">
              {money(view.debt)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm text-muted">Net worth</dt>
            <dd className="text-lg font-bold tabular-nums">{money(view.netWorth)}</dd>
          </div>
        </dl>
      </Card>

      <LedgerCard life={life} />
      <LifestyleCard life={life} />
      <RetirementCard life={life} />

      <Card role="region" aria-labelledby="debts-title">
        <h2 id="debts-title" className="mb-1 text-lg font-bold">
          Debts
        </h2>
        {view.debts.length === 0 ? (
          <p className="text-muted">You don’t owe anyone anything.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Debts">
            {view.debts.map((d) => (
              <DebtRow key={d.id} debt={d} onPay={(debt) => setConfirm({ kind: 'pay', debt })} />
            ))}
          </ul>
        )}
        {view.debtPlan && (
          <Button variant="secondary" block disabled={busy} className="mt-2" onClick={() => setConfirm({ kind: 'plan' })}>
            Set up a debt plan
          </Button>
        )}
      </Card>

      <ConfirmSheet
        open={sheet !== null}
        title={sheet?.title ?? ''}
        body={sheet?.body ?? ''}
        confirmLabel={sheet?.label ?? ''}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === 'pay') void act('pay_debt', { debtId: c.debt.id });
          else if (c?.kind === 'plan') void act('debt_plan');
        }}
      />
    </div>
  );
}
