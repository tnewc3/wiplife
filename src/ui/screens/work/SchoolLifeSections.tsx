import { useState } from 'react';
import { content } from '../../../content';
import { getTeenView } from '../../../engine/selectors';
import { getSchoolLifeView, type SchoolPersonLine } from '../../../engine/school/views';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { ACTIVITY_BLOCK_LABELS, chanceWords, EXAM_BAND_WORDS, GRADE_BAND_WORDS, money, SCHOOL_ACTION_BLOCK_LABELS, SCHOOL_PATH_HINTS } from '../../labels';

function PersonRows({ people, testId }: { people: SchoolPersonLine[]; testId: string }) {
  const open = useAppStore((s) => s.openInteractions);
  const busy = useAppStore((s) => s.aging);
  return (
    <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={testId}>
      {people.map((p) => (
        <li key={p.id} className="flex min-w-0 items-center justify-between gap-3 py-1" data-testid={`${testId}-${p.id}`}>
          <span className="min-w-0">
            <span className="block font-semibold break-words">{p.name}</span>
            <span className="block text-sm text-muted">
              {p.title} · {p.age}
            </span>
          </span>
          <Button variant="secondary" disabled={busy} onClick={() => open(p.id)} aria-label={`Talk to ${p.name}`} data-testid={`talk-${p.id}`}>
            Talk
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The School card's school-life parts (Batch 3): the report card, what you can do this year, your class and
 * teachers, the exams you have sat, the choice at the end of compulsory school, and teams and clubs.
 */
export function SchoolLifeSections({ life }: { life: LifeState }) {
  const view = getSchoolLifeView(life, content);
  const teen = getTeenView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [subject, setSubject] = useState('');
  const [trade, setTrade] = useState('');
  const disabled = busy || life.phase !== 'yearStart';
  const savings = life.finances.savings;
  const inSchool = life.education.current !== null;
  const clubs = inSchool && life.character.age < content.balance.relationships.adultAge;

  const action = (key: 'study' | 'slack' | 'tutor' | 'cheat' | 'skip', label: string, id: Parameters<typeof act>[0], params?: Parameters<typeof act>[1]) => (
    <div>
      <Button block variant="secondary" disabled={disabled || view.blocks[key] !== null} onClick={() => void act(id, params)} data-testid={`school-${key}`}>
        {label}
      </Button>
      {view.blocks[key] !== null && view.blocks[key] !== 'school' && <p className="mt-1 text-sm text-muted">{SCHOOL_ACTION_BLOCK_LABELS[view.blocks[key]!]}</p>}
    </div>
  );

  return (
    <>
      {view.hasCard && (
        <section className="mt-4" aria-labelledby="report-title" data-testid="report-card">
          <h3 id="report-title" className="font-bold">
            Report card
          </h3>
          <dl className="mt-1 flex flex-col text-sm">
            {view.card.map((s) => (
              <div key={s.id} className="flex justify-between gap-3 py-0.5" data-testid={`report-${s.id}`}>
                <dt>{s.name}</dt>
                <dd className="tabular-nums">
                  {GRADE_BAND_WORDS[s.band]} · {s.grade}
                </dd>
              </div>
            ))}
          </dl>
          {view.weakest && <p className="mt-1 text-sm text-muted">Your weakest subject is {view.weakest}.</p>}
        </section>
      )}

      {inSchool && life.education.current && (
        <section className="mt-4" aria-labelledby="year-title" data-testid="school-year">
          <h3 id="year-title" className="font-bold">
            This school year
          </h3>
          <p className="mt-1 text-sm text-muted" data-testid="school-year-status">
            {view.year.effort === 'study'
              ? `You’re studying harder${view.year.subject ? `, especially ${view.subjects.find((s) => s.id === view.year.subject)?.name ?? 'one subject'}` : ''}.`
              : view.year.effort === 'slack'
                ? 'You’re taking it easy this year.'
                : 'You haven’t settled on how hard to work yet.'}
            {view.year.tutor > 0 && ` A tutor cost ${money(view.year.tutor)}${life.education.current && life.character.age < content.balance.economy.independenceAge ? ', which your family paid' : `; you have ${money(savings)} left`}.`}
            {view.year.cheated > 0 && ` You cheated on ${view.year.cheated === 1 ? 'a test' : `${view.year.cheated} tests`}${view.year.caught ? ' and were caught' : ''}.`}
            {view.year.skipped > 0 && ` You skipped class ${view.year.skipped === 1 ? 'once' : `${view.year.skipped} times`}${view.year.caught && view.year.cheated === 0 ? ' and were noticed' : ''}.`}
          </p>
          {view.subjects.length > 0 && (
            <label className="mt-2 flex flex-col gap-1 text-sm">
              Study harder at
              <select
                className="min-h-11 rounded-xl border border-border bg-surface px-3"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Subject to study harder at"
                data-testid="school-subject"
              >
                <option value="">Everything</option>
                {view.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-2 flex flex-col gap-2" role="group" aria-label="School year actions">
            {action('study', subject ? 'Study harder at this subject' : 'Study harder', 'study_harder', subject ? { subject } : {})}
            {action('slack', 'Slack off', 'slack_off')}
            {action('tutor', `Get a tutor · ${money(view.tutorCost)}`, 'get_tutor')}
            {life.character.age >= content.balance.school.actions.cheat.minAge && action('cheat', 'Cheat on a test', 'cheat_on_test')}
            {life.character.age >= content.balance.school.actions.skip.minAge && action('skip', 'Skip class', 'skip_class')}
          </div>
        </section>
      )}

      {view.choice && (
        <section className="mt-4" aria-labelledby="choice-title" data-testid="school-choice">
          <h3 id="choice-title" className="font-bold">
            What comes after {view.choice.exam}
          </h3>
          <p className="mt-1 text-sm text-muted">Choose before the results. The result decides which of these are open to you.</p>
          <div className="mt-2 flex flex-col gap-2" role="group" aria-label="Your choice">
            {view.choice.options.map((o) => (
              <div key={o.path}>
                <Button
                  block
                  variant={view.choice!.made === o.path ? 'primary' : 'secondary'}
                  disabled={disabled || (o.path === 'apprenticeship' && view.choice!.trades.length > 0 && !trade && view.choice!.tradeId === null)}
                  aria-pressed={view.choice!.made === o.path}
                  onClick={() => void act('choose_path', o.path === 'apprenticeship' ? { path: o.path, tradeId: trade || view.choice!.trades[0]!.id } : { path: o.path })}
                  data-testid={`choice-${o.path}`}
                >
                  {o.name}
                </Button>
                <p className="mt-1 text-sm text-muted">{SCHOOL_PATH_HINTS[o.path]}</p>
                {o.path === 'apprenticeship' && (
                  <label className="mt-1 flex flex-col gap-1 text-sm">
                    Trade
                    <select className="min-h-11 rounded-xl border border-border bg-surface px-3" value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade to train in" data-testid="choice-trade">
                      <option value="">Pick a trade</option>
                      {view.choice!.trades.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {view.conditional && (
        <p className="mt-3 text-sm" data-testid="school-conditional">
          Your place at {view.conditional.school} depends on {view.conditional.exam}.
        </p>
      )}

      {view.exams.length > 0 && (
        <section className="mt-4" aria-labelledby="exams-title" data-testid="school-exams">
          <h3 id="exams-title" className="font-bold">
            Exams
          </h3>
          <ul className="mt-1 flex flex-col text-sm">
            {view.exams.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-0.5">
                <span className="capitalize">{e.name}</span>
                <span>{EXAM_BAND_WORDS[e.band]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view.staff.length > 0 || view.classmates.length > 0) && (
        <section className="mt-4" aria-labelledby="class-title" data-testid="school-class">
          <h3 id="class-title" className="font-bold">
            Your class
          </h3>
          {view.staff.length > 0 && <PersonRows people={view.staff} testId="teacher" />}
          {view.classmates.length > 0 && <PersonRows people={view.classmates} testId="classmate" />}
        </section>
      )}

      {clubs && (teen.activities.current.length > 0 || teen.activities.options.some((o) => o.block !== 'member' && o.block !== 'age')) && (
        <section className="mt-4" aria-labelledby="clubs-title" data-testid="school-clubs">
          <h3 id="clubs-title" className="font-bold">
            Clubs and teams
          </h3>
          {teen.activities.current.map((a) => (
            <div key={a.id} className="mt-2 flex items-center justify-between gap-3">
              <span className="min-w-0 font-semibold break-words">{a.name}</span>
              <Button variant="secondary" disabled={disabled} onClick={() => void act('leave_activity', { activityId: a.id })} data-testid={`school-leave-${a.id}`}>
                Leave
              </Button>
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            {teen.activities.options
              .filter((o) => o.block !== 'member' && o.block !== 'age')
              .map((o) => (
                <div key={o.id} className="rounded-xl border border-border p-3">
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-sm text-muted">{o.blurb}</p>
                  <p className="mt-1 text-sm">{money(o.cost)} a year</p>
                  <Button className="mt-2" block variant="secondary" disabled={disabled || o.block !== null} onClick={() => void act('join_activity', { activityId: o.id })} data-testid={`school-activity-${o.id}`}>
                    {o.kind === 'team' ? `Try out · ${chanceWords(o.chance)}` : 'Join'}
                  </Button>
                  {o.block && <p className="mt-1 text-sm text-muted">{ACTIVITY_BLOCK_LABELS[o.block]}</p>}
                </div>
              ))}
          </div>
        </section>
      )}
    </>
  );
}
