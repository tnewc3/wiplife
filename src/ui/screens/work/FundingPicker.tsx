import { useMemo } from 'react';
import { content } from '../../../content';
import { BUSINESS_FUNDING, type BusinessFunding } from '../../../content/schemas';
import type { FundingPlan } from '../../../engine/business/funding';
import { getFundingCheck, getFundingView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { BUSINESS_BLOCK_LABELS, BUSINESS_FUNDING_LABELS, money, rateLabel } from '../../labels';

/** The share of a cost one investor is asked for. */
const ASK = 0.25;

/**
 * W3: how to pay for a business: your savings, a business loan, family and friends, or a co-founder.
 * It shows what each one would do (the loan's size and rate, who could invest and for what stake,
 * who could be a partner and for what share) and whether the plan can be carried out now.
 */
export function FundingPicker({ life, need, defId, plan, onChange }: { life: LifeState; need: number; defId: string | undefined; plan: FundingPlan; onChange: (plan: FundingPlan) => void }) {
  const view = useMemo(() => getFundingView(life, need, defId, content), [life, need, defId]);
  const check = getFundingCheck(life, need, plan, defId, content);
  const set = (source: BusinessFunding) => {
    if (source === 'loan') onChange({ source, loan: view.loan.limit });
    else if (source === 'investors') onChange({ source, investors: [] });
    else onChange({ source });
  };
  const askAmount = (capacity: number) => Math.min(capacity, Math.ceil((need * ASK) / 100) * 100);
  const toggleInvestor = (personId: string, capacity: number) => {
    const list = plan.investors ?? [];
    const next = list.some((i) => i.personId === personId) ? list.filter((i) => i.personId !== personId) : [...list, { personId, amount: askAmount(capacity) }];
    onChange({ source: 'investors', investors: next });
  };
  return (
    <div data-testid="funding-picker">
      <div role="radiogroup" aria-label="Funding" className="flex flex-col gap-2">
        {BUSINESS_FUNDING.map((source) => {
          const checked = plan.source === source;
          const labels = BUSINESS_FUNDING_LABELS[source];
          return (
            <button
              key={source}
              type="button"
              role="radio"
              aria-checked={checked}
              data-testid={`funding-${source}`}
              onClick={() => set(source)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left ${checked ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}
            >
              {labels.name}
              <span className="block text-sm font-normal text-muted">{labels.blurb}</span>
            </button>
          );
        })}
      </div>
      {plan.source === 'loan' && (
        <p className="mt-2 text-sm" data-testid="loan-offer">
          {view.loan.limit > 0 && view.loan.block === null
            ? `The bank would lend up to ${money(view.loan.limit)} at ${rateLabel(view.loan.rate)} over ${view.loan.termYears} years. You put in the rest.`
            : view.loan.block === 'bankruptcy'
              ? 'The bank won’t lend so soon after a bankruptcy.'
              : view.loan.block === 'missed'
                ? 'The bank won’t lend while you are behind on a payment.'
                : 'The bank won’t lend this much on your income right now.'}
        </p>
      )}
      {plan.source === 'investors' && (
        <div className="mt-2" data-testid="investor-list">
          {view.investors.length === 0 ? (
            <p className="text-sm text-muted">Nobody you know has money to put in.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.investors.map((c) => {
                const on = (plan.investors ?? []).some((i) => i.personId === c.personId);
                const amount = askAmount(c.capacity);
                return (
                  <li key={c.personId}>
                    <button type="button" role="checkbox" aria-checked={on} disabled={!c.willing} data-testid={`investor-${c.personId}`} onClick={() => toggleInvestor(c.personId, c.capacity)} className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${on ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
                      {c.name}
                      <span className="block text-sm font-normal text-muted">
                        {c.willing ? `Could put in up to ${money(c.capacity)}. Asking ${money(amount)} buys a ${Math.max(1, Math.floor((100 * amount) / (need * content.balance.business.funding.investors.premoney)))}% share.` : 'Isn’t close enough to you to invest.'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">Up to {view.maxInvestors} people. They remember what happens to their money.</p>
        </div>
      )}
      {plan.source === 'cofounder' && (
        <div className="mt-2" data-testid="cofounder-list">
          {view.cofounders.length === 0 ? (
            <p className="text-sm text-muted">Nobody you know could be a partner.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.cofounders.map((c) => {
                const on = plan.cofounder?.personId === c.personId;
                return (
                  <li key={c.personId}>
                    <button type="button" role="radio" aria-checked={on} disabled={!c.willing} data-testid={`cofounder-${c.personId}`} onClick={() => onChange({ source: 'cofounder', cofounder: { personId: c.personId, share: plan.cofounder?.share ?? view.cofounderShares[0]! } })} className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${on ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
                      {c.name}
                      <span className="block text-sm font-normal text-muted">{c.willing ? 'Willing to build it with you.' : 'Isn’t close enough to you to join in.'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {plan.cofounder && (
            <div role="radiogroup" aria-label="Their share" className="mt-2 flex flex-wrap gap-2">
              {view.cofounderShares.map((share) => (
                <button key={share} type="button" role="radio" aria-checked={plan.cofounder!.share === share} data-testid={`share-${share}`} onClick={() => onChange({ source: 'cofounder', cofounder: { personId: plan.cofounder!.personId, share } })} className={`min-h-11 min-w-11 rounded-xl border px-3 ${plan.cofounder!.share === share ? 'border-accent bg-surface-2 font-semibold' : 'border-border'}`}>
                  {share}%
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-sm" data-testid="funding-summary" role="status">
        {check.block === null
          ? `You pay ${money(check.own)} from savings${check.loan > 0 ? `, borrow ${money(check.loan)}` : ''}${check.others > 0 ? `, and others put in ${money(check.others)}` : ''}. Savings now: ${money(life.finances.savings)}.`
          : BUSINESS_BLOCK_LABELS[check.block] ?? 'This can’t be done now.'}
      </p>
    </div>
  );
}
