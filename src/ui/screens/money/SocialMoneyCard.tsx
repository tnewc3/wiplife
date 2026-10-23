import { content } from '../../../content';
import { getSocialView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Card } from '../../components/Card';
import { money, SOCIAL_MODEL_LABELS } from '../../labels';

/** Batch 8: what the platforms paid this year, by platform and the way it pays, on the Money tab. */
export function SocialMoneyCard({ life }: { life: LifeState }) {
  const view = getSocialView(life, content);
  if (view.accounts.length === 0 && view.incomeThisYear === 0) return null;
  return (
    <Card role="region" aria-labelledby="social-money-title" data-testid="social-money">
      <h2 id="social-money-title" className="mb-1 text-lg font-bold">
        Your accounts
      </h2>
      {view.incomeByPlatform.length === 0 ? (
        <p className="text-muted">No platform has paid you this year.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" aria-label="Platform income">
          {view.incomeByPlatform.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-2 py-2">
              <span>
                {i.name} <span className="text-sm text-muted">· {SOCIAL_MODEL_LABELS[i.model] ?? i.model}</span>
              </span>
              <span className="font-semibold">{money(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-muted">What the platforms pay counts as income and is taxed with the rest. Under 18, a parent banks part of it for you.</p>
    </Card>
  );
}
