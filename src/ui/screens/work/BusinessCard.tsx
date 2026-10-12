import { useState } from 'react';
import { content } from '../../../content';
import { getBusinessScreen } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { BUSINESS_TITLES, money } from '../../labels';
import { BusinessScreen } from './BusinessScreen';

/**
 * W3: your businesses on the Work tab, as a summary (what each earned last year), with the button that opens the
 * Business screen. Before you can run one it says from when.
 */
export function BusinessCard({ life }: { life: LifeState }) {
  const [open, setOpen] = useState(false);
  const view = getBusinessScreen(life, content);
  if (life.character.age < content.balance.business.limits.minAge - 2) return null;
  return (
    <Card role="region" aria-labelledby="business-title" data-testid="business-card">
      <h2 id="business-title" className="text-lg font-bold">
        {BUSINESS_TITLES.card}
      </h2>
      {view.owned.length > 0 ? (
        <ul className="mt-2 flex flex-col" data-testid="business-summary">
          {view.owned.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3 py-1">
              <span className="min-w-0 break-words">{b.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{b.report ? `${b.report.numbers.profit >= 0 ? 'Profit' : 'Loss'} ${money(Math.abs(b.report.numbers.profit))}` : 'New'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted" data-testid="business-prompt">
          {view.blocked === 'age' ? `You can run a business from ${content.balance.business.limits.minAge}.` : 'A café, a bakery, a shop, a salon, a plumbing company, a cleaning crew. Start one, or buy one that’s for sale.'}
        </p>
      )}
      <Button variant={view.owned.length > 0 ? 'secondary' : 'primary'} block className="mt-3" onClick={() => setOpen(true)} data-testid="business-open">
        {view.owned.length > 0 ? 'Open Business' : 'See the options'}
      </Button>
      <BusinessScreen life={life} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
