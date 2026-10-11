import { content } from '../../../content';
import { getBusinessMoney } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Card } from '../../components/Card';
import { money } from '../../labels';

/** W3: business money on the Money tab: what each business paid you or cost you this year, what you owe on its loans and what your share is worth. */
export function BusinessMoneyCard({ life }: { life: LifeState }) {
  const view = getBusinessMoney(life, content);
  if (!view) return null;
  return (
    <Card role="region" aria-labelledby="business-money-title" data-testid="business-money">
      <h2 id="business-money-title" className="mb-1 text-lg font-bold">
        Your businesses
      </h2>
      {view.businesses.length === 0 ? (
        <p className="text-muted">You don’t own a business now.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {view.businesses.map((b) => (
              <li key={b.id} className="border-b border-border pb-2 last:border-0" data-testid={`business-money-${b.id}`}>
                <p className="font-semibold break-words">{b.name}</p>
                <dl className="text-sm">
                  <div className="flex justify-between gap-3 py-0.5">
                    <dt>{b.profit === null ? 'No full year yet' : b.profit >= 0 ? 'Profit last year' : 'Loss last year'}</dt>
                    <dd className="tabular-nums">{b.profit === null ? '—' : money(b.profit)}</dd>
                  </div>
                  {b.draw > 0 && (
                    <div className="flex justify-between gap-3 py-0.5">
                      <dt>Paid to you</dt>
                      <dd className="tabular-nums">{money(b.draw)}</dd>
                    </div>
                  )}
                  {b.injected > 0 && (
                    <div className="flex justify-between gap-3 py-0.5">
                      <dt>You put in</dt>
                      <dd className="tabular-nums">{money(-b.injected)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 py-0.5">
                    <dt>Your share is worth</dt>
                    <dd className="tabular-nums">{money(b.equity)}</dd>
                  </div>
                  {b.owed > 0 && (
                    <div className="flex justify-between gap-3 py-0.5">
                      <dt>Owed on its loans</dt>
                      <dd className="tabular-nums">{money(b.owed)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">What a business pays you counts as income, and is taxed with the rest. What you put in to cover a loss comes out of your savings.</p>
        </>
      )}
    </Card>
  );
}
