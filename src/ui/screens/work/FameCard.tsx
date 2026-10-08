import { useState } from 'react';
import { content } from '../../../content';
import { getFameView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FAME_WORDS, FAN_MOOD_WORDS } from '../../labels';
import { FameScreen } from './FameScreen';

/**
 * E6b: your career in arts and media on the Work tab, as a summary: where you
 * stand on the ladder, the next milestone and how fans feel, with the button
 * that opens the Fame screen. Before a career it offers the ways in; after
 * retiring it says so. Nothing shows for anyone too young for any path.
 */
export function FameCard({ life }: { life: LifeState }) {
  const [open, setOpen] = useState(false);
  const view = getFameView(life, content);
  if (!view.show) return null;
  const main = view.paths[0];
  return (
    <Card role="region" aria-labelledby="fame-title" data-testid="fame-card">
      <h2 id="fame-title" className="text-lg font-bold">
        Fame
      </h2>
      {view.active && main ? (
        <>
          <dl className="mt-2 flex flex-col">
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="min-w-0 break-words">{main.name}</dt>
              <dd className="shrink-0 font-semibold" data-testid="fame-rung">
                {main.rungTitle[0]!.toUpperCase() + main.rungTitle.slice(1)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt>Fame</dt>
              <dd className="shrink-0 font-semibold" data-testid="fame-band">
                {FAME_WORDS[main.fameBand]}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt>Your fans</dt>
              <dd className="shrink-0 font-semibold" data-testid="fame-mood">
                {FAN_MOOD_WORDS[view.moodBand]}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted" data-testid="fame-next">
            {main.next ? `Next: ${main.next.title}. ${main.next.milestone}.` : 'You are at the top of the ladder.'}
          </p>
        </>
      ) : view.retired ? (
        <p className="mt-1 text-muted" data-testid="fame-retired">
          You stepped away from the spotlight. The royalties still come in, and the door is not locked.
        </p>
      ) : (
        <p className="mt-1 text-muted" data-testid="fame-prompt">
          Music, acting, social media, writing and art. Everyone starts as a nobody; a few don’t stay that way.
        </p>
      )}
      <Button variant={view.active ? 'secondary' : 'primary'} block className="mt-3" onClick={() => setOpen(true)} data-testid="fame-open">
        {view.active ? 'Open Fame' : view.retired ? 'Look back' : 'See the ways in'}
      </Button>
      <FameScreen life={life} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
