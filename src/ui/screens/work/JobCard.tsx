import { useState } from 'react';
import { content } from '../../../content';
import { getWorkView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { StatBar } from '../../components/StatBar';
import { capitalized, money, performanceLabel, SEARCH_BLOCK_LABELS, workConfirmation, yearsLabel } from '../../labels';
import { JobSearchSheet } from './JobSearchSheet';

/** The Work tab's job card: your job, how it's going, and what you can do (look for work, ask for a raise, quit, retire). */
export function JobCard({ life }: { life: LifeState }) {
  const view = getWorkView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [searching, setSearching] = useState(false);
  const [confirm, setConfirm] = useState<'quit_job' | 'retire' | null>(null);
  const job = view.job;
  const disabled = busy || !view.between;
  const sheet = confirm
    ? workConfirmation(confirm, {
        ...(job ? { employer: job.employer } : {}),
        retirementAge: content.balance.economy.retirement.age,
        age: life.character.age,
      })
    : null;

  return (
    <Card role="region" aria-labelledby="job-title">
      <h2 id="job-title" className="text-lg font-bold break-words">
        {job ? capitalized(job.title) : 'Work'}
      </h2>
      {job ? (
        <div data-testid="job-status">
          <p className="mt-1 break-words">
            {job.employer} · {job.trackName}
          </p>
          <p className="mt-1 text-sm text-muted">
            Level {job.level} of {job.levels} · {yearsLabel(job.years)}
            {job.nextTitle ? ` · Next: ${job.nextTitle}` : ' · Top of the ladder'}
          </p>
          <p className="mt-1 font-semibold" data-testid="job-salary">
            {money(job.salary)} a year
          </p>
          {job.bossName && <p className="mt-1 text-sm text-muted">Your boss: {job.bossName}</p>}
          <div className="mt-3">
            <StatBar label="Performance" value={job.performance} />
            <p className="mt-1 text-sm text-muted" data-testid="job-performance">
              {performanceLabel(job.performance)}
            </p>
          </div>
        </div>
      ) : view.retired ? (
        <p className="mt-1 text-muted" data-testid="job-status">
          You’re retired.
        </p>
      ) : view.searchBlock ? (
        <p className="mt-1 text-muted" data-testid="job-status">
          {view.searchBlock === 'age' ? `You can get a job from ${view.minAge}.` : SEARCH_BLOCK_LABELS[view.searchBlock]}
        </p>
      ) : (
        <p className="mt-1 text-muted" data-testid="job-status">
          You don’t have a job. {view.openings === 0 ? 'Nothing you qualify for is hiring this year.' : view.openings === 1 ? '1 opening fits you.' : `${view.openings} openings fit you.`}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Work actions">
        {view.searchBlock === null && (
          <Button block variant={job ? 'secondary' : 'primary'} disabled={disabled} onClick={() => setSearching(true)}>
            {job ? 'Look for a new job' : view.retired ? 'Go back to work' : 'Look for work'}
          </Button>
        )}
        {job && (
          <Button block variant="secondary" disabled={disabled || !job.canAskRaise} onClick={() => void act('ask_raise')}>
            {job.askedRaise ? 'You asked for a raise this year' : 'Ask for a raise'}
          </Button>
        )}
        {job && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('quit_job')}>
            Quit
          </Button>
        )}
        {view.canRetire && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('retire')}>
            Retire
          </Button>
        )}
      </div>

      <JobSearchSheet life={life} open={searching} onClose={() => setSearching(false)} />
      <ConfirmSheet
        open={sheet !== null}
        title={sheet?.title ?? ''}
        body={sheet?.body ?? ''}
        confirmLabel={sheet?.confirm ?? ''}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action) void act(action);
        }}
      />
    </Card>
  );
}
