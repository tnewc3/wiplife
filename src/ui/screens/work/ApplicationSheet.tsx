import { useState, type ReactNode } from 'react';
import { content } from '../../../content';
import { getApplicationOptions, type ApplyOptionView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { APPLY_BLOCK_LABELS, money, oddsLabel, TIER_LABELS } from '../../labels';
import { MajorPicker } from './MajorPicker';

type Step =
  | { kind: 'choose' }
  | { kind: 'major'; key: string }
  | { kind: 'confirm'; key: string; majorId: string | null }
  | { kind: 'result'; key: string };

/** What a year would cost you: tuition, and what's left to borrow after aid. */
function costLine(o: ApplyOptionView): string {
  const aid = o.bill.scholarship + o.bill.family + o.bill.fund;
  const parts = [`${money(o.bill.tuition)} a year`];
  if (aid > 0) parts.push(`${money(aid)} covered`);
  parts.push(o.bill.loan > 0 ? `borrow about ${money(o.bill.loan)}` : 'no loans');
  return parts.join(' · ');
}

function OptionButton({ option, onPick }: { option: ApplyOptionView; onPick: () => void }) {
  const status =
    option.result === true ? 'Accepted' : option.result === false ? 'Turned down this year' : option.block ? APPLY_BLOCK_LABELS[option.block] : oddsLabel(option.chance);
  const years = option.years === 1 ? '1 year' : `${option.years} years`;
  return (
    <li>
      <button
        type="button"
        disabled={option.block !== null}
        onClick={onPick}
        className="flex min-h-11 w-full min-w-0 flex-col py-3 text-left active:bg-surface-2 disabled:opacity-60"
      >
        <span className="font-semibold break-words">{option.name}</span>
        <span className="text-sm text-muted">
          {option.tier ? `${TIER_LABELS[option.tier]} · ` : ''}
          {years}
        </span>
        {option.blurb && <span className="text-sm break-words text-muted">{option.blurb}</span>}
        <span className="text-sm text-muted">{costLine(option)}</span>
        <span className={`text-sm ${option.result === true ? 'font-semibold text-accent' : 'text-muted'}`}>{status}</span>
      </button>
    </li>
  );
}

function Section({ title, options, onPick }: { title: string; options: ApplyOptionView[]; onPick: (o: ApplyOptionView) => void }) {
  if (options.length === 0) return null;
  return (
    <section aria-label={title} className="mt-2">
      <h3 className="text-lg font-bold">{title}</h3>
      <ul className="flex flex-col divide-y divide-border" aria-label={title}>
        {options.map((o) => (
          <OptionButton key={o.key} option={o} onPick={() => onPick(o)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The application and choice sheet: pick a college (then a major), a trade
 * or a grad program; see what it costs and your odds in words; apply; see
 * the answer.
 */
export function ApplicationSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const options = getApplicationOptions(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const all = [...options.college, ...options.trade, ...options.grad];
  const find = (key: string) => all.find((o) => o.key === key);

  const close = () => {
    setStep({ kind: 'choose' });
    onClose();
  };

  const pick = (o: ApplyOptionView) => setStep(o.program === 'college' ? { kind: 'major', key: o.key } : { kind: 'confirm', key: o.key, majorId: null });

  const apply = async (o: ApplyOptionView, majorId: string | null) => {
    if (o.program === 'college') await act('apply_school', { program: 'college', tier: o.tier!, majorId: majorId! });
    else if (o.program === 'trade') await act('apply_school', { program: 'trade', tradeId: o.id! });
    else await act('apply_school', { program: 'grad', gradProgramId: o.id! });
    setStep({ kind: 'result', key: o.key });
  };

  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const option = step.kind === 'choose' ? undefined : find(step.key);

  let title = 'Apply to school';
  let body: ReactNode;
  let footer: ReactNode;
  if (step.kind === 'choose' || !option) {
    body = (
      <>
        <p className="text-muted">Each application costs {money(options.fee)}. You hear back right away, and a place starts next year.</p>
        <Section title="College" options={options.college} onPick={pick} />
        <Section title="Trade school" options={options.trade} onPick={pick} />
        {options.grad.some((o) => o.block !== 'bachelor') && <Section title="Grad school" options={options.grad} onPick={pick} />}
      </>
    );
    footer = (
      <Button variant="secondary" block onClick={close}>
        Close
      </Button>
    );
  } else if (step.kind === 'major') {
    title = 'Choose a major';
    body = (
      <>
        <p className="mb-2 text-muted">At {option.name}. You can switch later, at the cost of an extra year once you’re a few years in.</p>
        <MajorPicker majors={options.majors} selected={selectedMajor} onPick={setSelectedMajor} />
      </>
    );
    footer = (
      <>
        <Button block disabled={selectedMajor === null} onClick={() => setStep({ kind: 'confirm', key: option.key, majorId: selectedMajor })}>
          Next
        </Button>
        <Button variant="secondary" block onClick={() => setStep({ kind: 'choose' })}>
          Back
        </Button>
      </>
    );
  } else if (step.kind === 'confirm') {
    const major = options.majors.find((m) => m.id === step.majorId);
    title = `Apply to ${option.name}?`;
    body = (
      <dl className="flex flex-col gap-1" aria-label="Application">
        {major && (
          <div className="flex justify-between gap-3">
            <dt>Major</dt>
            <dd className="text-right font-semibold">{major.name}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt>Tuition</dt>
          <dd className="tabular-nums">{money(option.bill.tuition)} a year</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Scholarships</dt>
          <dd className="tabular-nums">{money(option.bill.scholarship)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Your family</dt>
          <dd className="tabular-nums">{money(option.bill.family)}</dd>
        </div>
        {option.bill.fund > 0 && (
          <div className="flex justify-between gap-3">
            <dt>Scholarship money you won</dt>
            <dd className="tabular-nums">{money(option.bill.fund)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold">
          <dt>Student loan</dt>
          <dd className="tabular-nums">{money(option.bill.loan)} a year</dd>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <dt>Your odds</dt>
          <dd className="font-semibold">{oddsLabel(option.chance)}</dd>
        </div>
      </dl>
    );
    footer = (
      <>
        <Button block disabled={busy} onClick={() => void apply(option, step.majorId)}>
          Apply · {money(options.fee)}
        </Button>
        <Button variant="secondary" block disabled={busy} onClick={() => setStep(option.program === 'college' ? { kind: 'major', key: option.key } : { kind: 'choose' })}>
          Back
        </Button>
      </>
    );
  } else {
    const accepted = option.result === true;
    title = accepted ? 'You got in!' : 'Not this time';
    body = (
      <p data-testid="application-result">
        {accepted
          ? `${option.name} accepted you. You start next year.`
          : `${option.name} turned down your application. You can try again next year, or apply somewhere else.`}
      </p>
    );
    footer = (
      <>
        <Button block onClick={() => setStep({ kind: 'choose' })}>
          See other options
        </Button>
        <Button variant="secondary" block onClick={close}>
          Done
        </Button>
      </>
    );
  }

  return (
    <Sheet open={open} title={title} onClose={close} footer={footer}>
      {body}
    </Sheet>
  );
}
