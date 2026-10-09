import { useState } from 'react';
import { content } from '../../../content';
import { getSportsView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FAME_WORDS, FAN_MOOD_WORDS, SPORT_LEVEL_LABELS, SPORT_RETIRED_LABELS } from '../../labels';
import { SportsScreen } from './SportsScreen';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/**
 * E6c: your sports career on the Work tab, as a summary: the sport, where you
 * stand on the ladder, your team and how fans feel, with the button that opens
 * the Sports screen. Before a career it offers the ways in; after leaving the
 * game it says so. Nothing shows for anyone too young to begin.
 */
export function SportsCard({ life }: { life: LifeState }) {
  const [open, setOpen] = useState(false);
  const view = getSportsView(life, content);
  if (!view.show) return null;
  const path = view.path;
  return (
    <Card role="region" aria-labelledby="sports-title" data-testid="sports-card">
      <h2 id="sports-title" className="text-lg font-bold">
        Sports
      </h2>
      {view.active && path && view.sport ? (
        <>
          <dl className="mt-2 flex flex-col">
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt className="min-w-0 break-words">{view.sport.name}</dt>
              <dd className="shrink-0 font-semibold" data-testid="sports-rung">
                {cap(path.rungTitle)}
              </dd>
            </div>
            {view.team && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <dt>{SPORT_LEVEL_LABELS[view.team.level]}</dt>
                <dd className="min-w-0 break-words text-right font-semibold" data-testid="sports-team">
                  {view.team.name}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt>Fame</dt>
              <dd className="shrink-0 font-semibold" data-testid="sports-fame">
                {FAME_WORDS[view.fameBand]}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <dt>Your fans</dt>
              <dd className="shrink-0 font-semibold" data-testid="sports-mood">
                {FAN_MOOD_WORDS[view.moodBand]}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted" data-testid="sports-next">
            {path.next ? `Next: ${path.next.title}. ${path.next.milestone}.` : 'You are at the top of the ladder.'}
          </p>
        </>
      ) : view.retired ? (
        <p className="mt-1 text-muted" data-testid="sports-retired">
          {view.retired.route ? SPORT_RETIRED_LABELS[view.retired.route] : 'Your playing days are over.'} The seasons are in the record.
        </p>
      ) : (
        <p className="mt-1 text-muted" data-testid="sports-prompt">
          Basketball, football, soccer, baseball and hockey. Talent and Fitness decide how far you get; the rest is seasons, luck and your body holding up.
        </p>
      )}
      <Button variant={view.active ? 'secondary' : 'primary'} block className="mt-3" onClick={() => setOpen(true)} data-testid="sports-open">
        {view.active ? 'Open Sports' : view.retired ? 'Look back' : 'See the ways in'}
      </Button>
      <SportsScreen life={life} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
