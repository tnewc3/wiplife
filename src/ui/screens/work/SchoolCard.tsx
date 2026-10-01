import { useState } from 'react';
import { content } from '../../../content';
import { getMajorOptions, getSchoolView, type EnrollmentView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import {
  credentialLabel,
  gradeLevelLabel,
  money,
  PROGRAM_LABELS,
  programYearLabel,
  TIER_LABELS,
} from '../../labels';
import { ApplicationSheet } from './ApplicationSheet';
import { MajorPicker } from './MajorPicker';

type Confirm = 'drop_out' | 'decline_admission' | 'return_to_school' | 'take_ged';

/** This school year's tuition and who paid it. */
function BillLines({ bill }: { bill: NonNullable<EnrollmentView['bill']> }) {
  const rows: [string, number][] = [
    ['Tuition', bill.tuition],
    ['Scholarships', bill.scholarship],
    ['Your family', bill.family],
    ['Scholarship money you won', bill.fund],
    ['Student loan', bill.loan],
  ];
  return (
    <dl className="mt-2 flex flex-col text-sm" aria-label="This year’s tuition">
      {rows
        .filter(([label, value]) => value > 0 || label === 'Tuition' || label === 'Student loan')
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{money(value)}</dd>
          </div>
        ))}
    </dl>
  );
}

/** The school view on the Work/School tab: where you are, your grades, your places, diplomas and degrees, and what you can do. */
export function SchoolCard({ life }: { life: LifeState }) {
  const view = getSchoolView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [applying, setApplying] = useState(false);
  const [changingMajor, setChangingMajor] = useState(false);
  const [newMajor, setNewMajor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const cur = view.current;
  const disabled = busy || !view.between;

  const heading = cur ? (cur.gradeLevel !== null ? PROGRAM_LABELS[cur.program] : cur.schoolName) : 'School';
  const sheet = (() => {
    switch (confirm) {
      case 'drop_out':
        return {
          title: `Drop out of ${cur?.program === 'high' ? 'high school' : cur?.schoolName}?`,
          body:
            cur?.program === 'high'
              ? 'You’ll leave without a diploma. You can go back while you’re young enough to finish, or get a GED later.'
              : 'You’ll leave without finishing. Your progress is kept, so you can go back later.',
          label: 'Drop out',
        };
      case 'decline_admission':
        return { title: `Turn down ${view.admission?.schoolName}?`, body: 'You’ll give up your place. You can apply again another year.', label: 'Turn it down' };
      case 'return_to_school':
        return {
          title: `Go back to ${view.left?.program === 'high' ? 'high school' : view.left?.schoolName}?`,
          body: 'You’ll pick up where you left off when the next year begins.',
          label: 'Go back',
        };
      case 'take_ged':
        return {
          title: 'Take the GED?',
          body: `The exam costs ${money(view.ged?.fee ?? 0)}. Pass it and it counts as a high school diploma. You can try once a year.`,
          label: 'Take the exam',
        };
      default:
        return null;
    }
  })();

  return (
    <Card role="region" aria-labelledby="school-title">
      <h2 id="school-title" className="text-lg font-bold break-words">
        {heading}
      </h2>

      {cur ? (
        <div data-testid="school-status">
          <p className="mt-1">
            {cur.gradeLevel !== null ? gradeLevelLabel(cur.gradeLevel) : `${cur.tier ? `${TIER_LABELS[cur.tier]} · ` : ''}${programYearLabel(cur.year, cur.lengthYears)}`}
            {cur.gradeLevel !== null && cur.program !== 'elementary' && cur.program !== 'middle' && ` · ${cur.schoolName}`}
          </p>
          {cur.studying && <p className="mt-1 text-muted">Studying {cur.studying}</p>}
          <p className="mt-1 font-semibold" data-testid="school-grades">
            Grades: {cur.letter}
          </p>
          {cur.repeats > 0 && <p className="mt-1 text-sm text-muted">You were held back a year.</p>}
          {cur.final && cur.program !== 'elementary' && cur.program !== 'middle' && <p className="mt-1 text-sm text-muted">Your last year.</p>}
          {cur.bill && <BillLines bill={cur.bill} />}
        </div>
      ) : view.age < view.startAge ? (
        <p className="mt-1 text-muted" data-testid="school-status">
          You start school at {view.startAge}.
        </p>
      ) : (
        <p className="mt-1 text-muted" data-testid="school-status">
          You’re not in school.
        </p>
      )}

      {view.admission && (
        <p className="mt-3 font-semibold" data-testid="admission-line">
          {view.admission.returning ? 'You go back to' : 'You start at'} {view.admission.program === 'high' ? 'high school' : view.admission.schoolName} next year
          {view.admission.studying ? `, studying ${view.admission.studying}` : ''}.
        </p>
      )}
      {view.left && !cur && !view.admission && (
        <p className="mt-3 text-muted">
          You left {view.left.program === 'high' ? 'high school' : view.left.schoolName} before finishing.
        </p>
      )}
      {view.decisions.length > 0 && (
        <ul className="mt-2 flex flex-col text-sm" aria-label="This year’s applications">
          {view.decisions.map((d) => (
            <li key={d.option}>
              {d.name}: {d.accepted ? 'accepted' : 'turned you down'}
            </li>
          ))}
        </ul>
      )}
      {view.ged?.result === false && <p className="mt-2 text-sm">You didn’t pass the GED this year.</p>}
      {view.fund > 0 && <p className="mt-2 text-sm text-muted">Scholarship money waiting for tuition: {money(view.fund)}</p>}

      {view.canApply && life.career.job && <p className="mt-3 text-sm text-muted">Starting school means leaving your job when the year begins.</p>}
      <div className="mt-3 flex flex-col gap-2" role="group" aria-label="School actions">
        {view.canApply && (
          <Button block disabled={disabled} onClick={() => setApplying(true)}>
            {cur?.program === 'high' ? 'Apply to college or trade school' : 'Apply to school'}
          </Button>
        )}
        {cur?.canChangeMajor && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setChangingMajor(true)}>
            Change major
          </Button>
        )}
        {view.left?.canReturn && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('return_to_school')}>
            Go back to {view.left.program === 'high' ? 'high school' : view.left.schoolName}
          </Button>
        )}
        {view.ged?.available && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('take_ged')}>
            Take the GED · {money(view.ged.fee)}
          </Button>
        )}
        {view.admission && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('decline_admission')}>
            Turn down your place
          </Button>
        )}
        {cur?.canDropOut && (
          <Button block variant="secondary" disabled={disabled} onClick={() => setConfirm('drop_out')}>
            Drop out
          </Button>
        )}
      </div>

      {view.credentials.length > 0 && (
        <section className="mt-4" aria-labelledby="credentials-title">
          <h3 id="credentials-title" className="font-bold">
            Diplomas and degrees
          </h3>
          <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Diplomas and degrees">
            {view.credentials.map((c, i) => (
              <li key={i} className="flex min-w-0 flex-col py-2">
                <span className="font-semibold break-words">{credentialLabel(c)}</span>
                <span className="text-sm text-muted">
                  {c.year}
                  {c.tier ? ` · ${TIER_LABELS[c.tier]}` : ''}
                  {c.letter ? ` · Grades: ${c.letter}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ApplicationSheet life={life} open={applying} onClose={() => setApplying(false)} />

      <Sheet
        open={changingMajor}
        title="Change your major"
        onClose={() => {
          setChangingMajor(false);
          setNewMajor(null);
        }}
        footer={
          <>
            <Button
              block
              disabled={busy || newMajor === null}
              onClick={() => {
                const majorId = newMajor;
                setChangingMajor(false);
                setNewMajor(null);
                if (majorId) void act('choose_major', { majorId });
              }}
            >
              Switch major
            </Button>
            <Button
              variant="secondary"
              block
              onClick={() => {
                setChangingMajor(false);
                setNewMajor(null);
              }}
            >
              Cancel
            </Button>
          </>
        }
      >
        <p className="mb-2 text-muted">{cur?.changeAddsYear ? 'Switching this late adds a year to your degree.' : 'You can switch for free this early on.'}</p>
        <MajorPicker majors={getMajorOptions(content)} selected={newMajor} current={cur?.majorId ?? null} onPick={setNewMajor} />
      </Sheet>

      <ConfirmSheet
        open={sheet !== null}
        title={sheet?.title ?? ''}
        body={sheet?.body ?? ''}
        confirmLabel={sheet?.label ?? ''}
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
