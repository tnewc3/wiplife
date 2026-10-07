import { useState } from 'react';
import { content } from '../../../content';
import { getTeenView, type TeenView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import {
  ACTIVITY_BLOCK_LABELS,
  chanceWords,
  FOCUS_BLOCK_LABELS,
  FOCUS_LABELS,
  JOB_BLOCK_LABELS,
  JOIN_BLOCK_LABELS,
  LICENSE_BLOCK_LABELS,
  LICENSE_STAGE_LABELS,
  money,
  NEGOTIATE_BLOCK_LABELS,
  rankWords,
  RULE_LEVEL_LABELS,
  standingWords,
} from '../../labels';

type Confirming = { kind: 'break'; id: string; name: string } | { kind: 'leaveCrowd'; name: string } | { kind: 'quitJob'; name: string } | null;

const row = 'flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-left';

function Heading({ children }: { children: string }) {
  return <h2 className="mb-2 text-lg font-semibold">{children}</h2>;
}

function Why({ children }: { children: string }) {
  return <p className="mt-1 text-sm text-muted">{children}</p>;
}

/** More → Teen years: this year's focus, the crowds at your school, your license, a job, teams and clubs, and the rules at home. */
export function TeenScreen({ life }: { life: LifeState }) {
  const view: TeenView = getTeenView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const disabled = busy || !view.canAct;
  const { license } = view;

  const drivingCard = (
    <Card data-testid="teen-driving">
      <Heading>Driving</Heading>
      <p>
        {LICENSE_STAGE_LABELS[license.stage]}
        {license.stage !== 'licensed' && ` · ${license.lessons} of ${license.maxLessons} lessons`}
      </p>
      {license.stage === 'none' && (
        <>
          <Button className="mt-2" block variant="secondary" disabled={disabled || license.permit.block !== null} onClick={() => void act('get_permit')} data-testid="teen-permit">
            Get a learner’s permit ({money(license.permit.fee)})
          </Button>
          {license.permit.block && <Why>{LICENSE_BLOCK_LABELS[license.permit.block]}</Why>}
        </>
      )}
      {license.stage === 'permit' && (
        <div className="mt-2 flex flex-col gap-2">
          <Button block variant="secondary" disabled={disabled || license.lesson.block !== null} onClick={() => void act('driving_lesson')} data-testid="teen-lesson">
            Take a driving lesson ({money(license.lesson.fee)})
          </Button>
          {license.lesson.block && <Why>{LICENSE_BLOCK_LABELS[license.lesson.block]}</Why>}
          <Button block disabled={disabled || license.test.block !== null} onClick={() => void act('take_license_test')} data-testid="teen-test">
            Take the license test ({money(license.test.fee)}) · {chanceWords(license.test.chance)}
          </Button>
          {license.test.block && <Why>{LICENSE_BLOCK_LABELS[license.test.block]}</Why>}
          {license.fails > 0 && <Why>{`You have failed the test ${license.fails === 1 ? 'once' : `${license.fails} times`}.`}</Why>}
        </div>
      )}
      {license.stage === 'licensed' && <Why>You can buy a car under More → Belongings.</Why>}
    </Card>
  );

  if (!view.teen) {
    return <div className="flex flex-col gap-3">{drivingCard}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {!view.canAct && <Card className="text-muted">Teen choices are made between years.</Card>}
      {view.caught && (
        <Card className="border-danger" data-testid="teen-caught">
          A parent caught you breaking a rule.
        </Card>
      )}
      {view.penalties.length > 0 && (
        <Card data-testid="teen-penalties">
          <Heading>In force</Heading>
          <ul className="flex flex-col gap-1">
            {view.penalties.map((p, i) => (
              <li key={i}>{p.kind === 'grounded' ? 'Grounded' : `No ${p.rule?.toLowerCase() ?? 'privilege'}`} (through {p.until})</li>
            ))}
          </ul>
        </Card>
      )}

      <Card data-testid="teen-focus">
        <Heading>This year’s focus</Heading>
        <p className="mb-2 text-sm text-muted">Where most of your energy goes shifts your grades, your friendships, your money and your talent.</p>
        <div className="flex flex-col gap-2">
          {view.focus.options.map((id) => {
            const chosen = view.focus.next === id;
            return (
              <button
                key={id}
                type="button"
                className={`${row} ${chosen ? 'border-accent bg-surface-2' : ''} disabled:opacity-50`}
                aria-pressed={chosen}
                disabled={disabled || view.focus.block !== null}
                onClick={() => void act('choose_focus', { focus: id })}
                data-testid={`teen-focus-${id}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{FOCUS_LABELS[id].label}</span>
                  <span className="text-sm text-muted">{FOCUS_LABELS[id].blurb}</span>
                </span>
                {chosen && <span className="shrink-0 text-sm font-semibold text-accent">Chosen</span>}
              </button>
            );
          })}
        </div>
        {view.focus.block && <Why>{FOCUS_BLOCK_LABELS[view.focus.block]}</Why>}
        {view.focus.thisYear && <Why>{`This year you put your energy into ${FOCUS_LABELS[view.focus.thisYear].label.toLowerCase()}.`}</Why>}
      </Card>

      <Card data-testid="teen-crowds">
        <Heading>Your crowd</Heading>
        {view.school === null ? (
          <p className="text-muted">You’re not in school, so there is no crowd to join.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">
              {view.school}. {`Your standing: ${standingWords(view.standing)}.`}
            </p>
            {view.mine && (
              <div className="mb-3 rounded-xl border border-accent p-3" data-testid="teen-mine">
                <p className="font-semibold">{view.mine.name}</p>
                <p className="text-sm text-muted">
                  {rankWords(view.mine.rank)} · since {view.mine.since}
                </p>
                {view.mine.clash && <p className="text-sm">At odds with {view.mine.clash}.</p>}
                {!view.mine.clash && view.mine.rival && <p className="text-sm text-muted">Rivals: {view.mine.rival}.</p>}
                <Button className="mt-2" variant="secondary" block disabled={disabled || !view.mine.canLeave} onClick={() => setConfirming({ kind: 'leaveCrowd', name: view.mine!.name })} data-testid="teen-leave-crowd">
                  Leave the crowd
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {view.crowds
                .filter((c) => !c.member)
                .map((c) => (
                  <div key={c.id} className="rounded-xl border border-border p-3" data-testid={`teen-crowd-${c.id}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold">{c.name}</p>
                      {c.invited && <span className="text-sm font-semibold text-accent">Noticed you</span>}
                    </div>
                    <p className="text-sm text-muted">{c.blurb}</p>
                    <p className="mt-1 text-sm">
                      {standingWords(c.standing)}
                      {c.rival && ' · At odds with you'}
                      {c.people.length > 0 && ` · You know ${c.people.join(', ')}`}
                    </p>
                    <Button className="mt-2" block variant="secondary" disabled={disabled || c.block !== null} onClick={() => void act('join_clique', { cliqueId: c.id })} data-testid={`teen-join-${c.id}`}>
                      {view.mine ? 'Switch to this crowd' : 'Try to join'} · {chanceWords(c.chance)}
                    </Button>
                    {c.block && <Why>{JOIN_BLOCK_LABELS[c.block]}</Why>}
                  </div>
                ))}
            </div>
          </>
        )}
      </Card>

      {drivingCard}

      <Card data-testid="teen-job">
        <Heading>A job</Heading>
        {view.job.current ? (
          <>
            <p>
              {view.job.current.name} at {view.job.current.employer}
            </p>
            <p className="text-sm text-muted">
              {view.job.current.hours} hours a week · about {money(view.job.current.pay)} a year
            </p>
            <Button className="mt-2" variant="secondary" block disabled={disabled} onClick={() => setConfirming({ kind: 'quitJob', name: view.job.current!.name })} data-testid="teen-quit-job">
              Quit
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {view.job.options.map((o) => (
              <div key={o.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold capitalize">{o.name}</p>
                <p className="text-sm text-muted">{o.blurb}</p>
                <p className="mt-1 text-sm">
                  {o.hours} hours a week · {money(o.wage)} an hour · about {money(o.pay)} a year
                </p>
                <Button className="mt-2" block variant="secondary" disabled={disabled || o.block !== null} onClick={() => void act('take_teen_job', { teenJobId: o.id })} data-testid={`teen-job-${o.id}`}>
                  Take this job
                </Button>
                {o.block && <Why>{JOB_BLOCK_LABELS[o.block]}</Why>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card data-testid="teen-activities">
        <Heading>Teams and clubs</Heading>
        {view.activities.current.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {view.activities.current.map((a) => (
              <li key={a.id} className="rounded-xl border border-accent p-3">
                <p className="font-semibold">{a.name}</p>
                <p className="text-sm text-muted">{money(a.cost)} a year</p>
                <Button className="mt-2" variant="secondary" block disabled={disabled} onClick={() => void act('leave_activity', { activityId: a.id })} data-testid={`teen-leave-${a.id}`}>
                  Leave
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          {view.activities.options
            .filter((o) => o.block !== 'member')
            .map((o) => (
              <div key={o.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold">{o.name}</p>
                <p className="text-sm text-muted">{o.blurb}</p>
                <p className="mt-1 text-sm">{money(o.cost)} a year</p>
                <Button className="mt-2" block variant="secondary" disabled={disabled || o.block !== null} onClick={() => void act('join_activity', { activityId: o.id })} data-testid={`teen-activity-${o.id}`}>
                  {o.kind === 'team' ? `Try out · ${chanceWords(o.chance)}` : 'Join'}
                </Button>
                {o.block && <Why>{ACTIVITY_BLOCK_LABELS[o.block]}</Why>}
              </div>
            ))}
        </div>
      </Card>

      <Card data-testid="teen-rules">
        <Heading>Rules at home</Heading>
        {view.rules.length === 0 ? (
          <p className="text-muted">Nobody at home has set any rules for you.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {view.rules.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3" data-testid={`teen-rule-${r.id}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <span className="text-sm text-muted">{RULE_LEVEL_LABELS[r.level]}</span>
                </div>
                <p>{r.text}</p>
                <p className="text-sm text-muted">
                  Set by {r.by}
                  {r.caught > 0 && ` · caught ${r.caught === 1 ? 'once' : `${r.caught} times`}`}
                  {!r.applies && ' · doesn’t apply to you right now'}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  <Button block variant="secondary" disabled={disabled || r.negotiate.block !== null} onClick={() => void act('negotiate_rule', { ruleId: r.id })} data-testid={`teen-negotiate-${r.id}`}>
                    Ask {r.by} to ease up · {chanceWords(r.negotiate.chance)}
                  </Button>
                  {r.negotiate.block && <Why>{NEGOTIATE_BLOCK_LABELS[r.negotiate.block]}</Why>}
                  <Button block variant="ghost" disabled={disabled || !r.canBreak} onClick={() => setConfirming({ kind: 'break', id: r.id, name: r.name })} data-testid={`teen-break-${r.id}`}>
                    Break this rule
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {confirming && (
        <ConfirmSheet
          open
          title={confirming.kind === 'break' ? `Break the ${confirming.name.toLowerCase()} rule?` : confirming.kind === 'leaveCrowd' ? `Leave ${confirming.name}?` : `Quit your job as a ${confirming.name}?`}
          body={
            confirming.kind === 'break'
              ? 'It might be worth it. You may get away with it, or a parent may notice, and how they answer depends on who they are and how you two get on.'
              : confirming.kind === 'leaveCrowd'
                ? 'The people in it will notice, and it may not go quietly.'
                : 'You will lose the pay, and you can look for another job later.'
          }
          confirmLabel={confirming.kind === 'break' ? 'Break it' : confirming.kind === 'leaveCrowd' ? 'Leave' : 'Quit'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const c = confirming;
            setConfirming(null);
            if (c.kind === 'break') void act('break_rule', { ruleId: c.id });
            else if (c.kind === 'leaveCrowd') void act('leave_clique');
            else void act('quit_teen_job');
          }}
        />
      )}
    </div>
  );
}
