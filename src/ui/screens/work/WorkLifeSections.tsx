import { useState } from 'react';
import { content } from '../../../content';
import { getWorkLifeView, type WorkPersonLine } from '../../../engine/work/views';
import type { LifeState } from '../../../engine/types';
import { PersonPortrait } from '../../portraits/PersonPortrait';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { WORK_ACTION_BLOCK_LABELS } from '../../labels';

function Row({ person, title }: { person: WorkPersonLine; title: string }) {
  const open = useAppStore((s) => s.openInteractions);
  const busy = useAppStore((s) => s.aging);
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 py-1" data-testid={`work-person-${person.id}`}>
      <PersonPortrait personId={person.id} name={person.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words">{person.name}</span>
        <span className="block text-sm text-muted">
          {title} · {person.age}
        </span>
        {person.friends.length > 0 && <span className="block text-sm text-muted">Friends with {person.friends.join(', ')}</span>}
        {person.rivals.length > 0 && <span className="block text-sm text-muted">At odds with {person.rivals.join(', ')}</span>}
      </span>
      <Button variant="secondary" disabled={busy} onClick={() => open(person.id)} aria-label={`Talk to ${person.name}`} data-testid={`talk-${person.id}`}>
        Talk
      </Button>
    </li>
  );
}

/** The job card's people and work actions (Batch 3): your boss and coworkers, each opening the interaction menu, and what you can do at work this year. */
export function WorkLifeSections({ life }: { life: LifeState }) {
  const view = getWorkLifeView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [target, setTarget] = useState('');
  if (!view) return null;
  const disabled = busy || life.phase !== 'yearStart';
  const reporting = target || view.coworkers[0]?.id || '';

  const button = (key: 'hard' | 'slack' | 'socialize' | 'party', label: string, id: Parameters<typeof act>[0]) => (
    <div>
      <Button block variant="secondary" disabled={disabled || view.blocks[key] !== null} onClick={() => void act(id)} data-testid={`work-${key}`}>
        {label}
      </Button>
      {view.blocks[key] !== null && view.blocks[key] !== 'job' && <p className="mt-1 text-sm text-muted">{WORK_ACTION_BLOCK_LABELS[view.blocks[key]!]}</p>}
    </div>
  );

  return (
    <>
      <section className="mt-4" aria-labelledby="coworkers-title" data-testid="work-people">
        <h3 id="coworkers-title" className="font-bold">
          The people you work with
        </h3>
        <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Boss and coworkers">
          {view.boss && <Row person={view.boss} title="Boss" />}
          {view.coworkers.map((c) => (
            <Row key={c.id} person={c} title="Coworker" />
          ))}
        </ul>
        {view.coworkers.length === 0 && <p className="mt-1 text-sm text-muted">You haven’t met anyone at your level yet.</p>}
        <p className="mt-1 text-sm text-muted">A workplace like yours has up to {view.maxCoworkers} coworkers.</p>
      </section>

      <section className="mt-4" aria-labelledby="work-year-title" data-testid="work-year">
        <h3 id="work-year-title" className="font-bold">
          At work this year
        </h3>
        <p className="mt-1 text-sm text-muted" data-testid="work-year-status">
          {view.effort === 'hard' ? 'You’re putting in extra effort.' : view.effort === 'slack' ? 'You’re taking it easy at work.' : 'You haven’t settled on how hard to work yet.'}
          {view.socialized > 0 && ` You’ve spent time with coworkers ${view.socialized === 1 ? 'once' : `${view.socialized} times`}.`}
          {view.party && ' You went to the office party.'}
          {view.reported > 0 && ' You reported a coworker.'}
        </p>
        <div className="mt-2 flex flex-col gap-2" role="group" aria-label="Work actions this year">
          {button('hard', 'Work harder', 'work_harder')}
          {button('slack', 'Slack off', 'slack_at_work')}
          {button('socialize', 'Spend time with coworkers', 'socialize_at_work')}
          {button('party', 'Go to the office party', 'office_party')}
          {view.coworkers.length > 0 && (
            <div>
              <label className="flex flex-col gap-1 text-sm">
                Report a coworker
                <select className="min-h-11 rounded-xl border border-border bg-surface px-3" value={reporting} onChange={(e) => setTarget(e.target.value)} aria-label="Coworker to report" data-testid="work-report-target">
                  {view.coworkers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button className="mt-2" block variant="secondary" disabled={disabled || view.reportBlock !== null} onClick={() => void act('report_coworker', { coworkerId: reporting })} data-testid="work-report">
                Report to the boss
              </Button>
              {view.reportBlock !== null && view.reportBlock !== 'job' && <p className="mt-1 text-sm text-muted">{WORK_ACTION_BLOCK_LABELS[view.reportBlock]}</p>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
