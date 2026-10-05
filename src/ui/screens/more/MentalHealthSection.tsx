import { useState } from 'react';
import type { MentalCareId } from '../../../content/schemas';
import type { CareOption, MentalConditionView, MentalView } from '../../../engine/mental/views';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { StatBar } from '../../components/StatBar';
import { CONDITION_KIND_LABELS, MENTAL_CARE_BLOCK_LABELS, MENTAL_CARE_LABELS, money, REACTION_LABELS, severityLabel, THERAPIST_BLOCK_LABELS } from '../../labels';

interface Pending {
  condition: MentalConditionView;
  option: CareOption;
  on: boolean;
}

/** What starting or stopping a way of caring means, in a sentence for the confirmation. */
function pendingBody(p: Pending, familyPays: boolean): string {
  const { name } = MENTAL_CARE_LABELS[p.option.care];
  if (!p.on) {
    return p.option.care === 'medication'
      ? 'Stopping medication can bring the symptoms back. It is safest to talk to whoever prescribed it first.'
      : `You can stop ${name.toLowerCase()} and start it again whenever you like.`;
  }
  if (p.option.care === 'support') {
    return `This reaches out to ${p.option.people.join(', ')}. Each takes it their own way, and it can wear on them.`;
  }
  const price = familyPays
    ? 'Your family pays.'
    : `The first visit costs about ${money(p.option.intake ?? 0)}, then about ${money(p.option.yearly ?? 0)} a year. What your savings can’t cover becomes medical debt.`;
  return `${price} ${MENTAL_CARE_LABELS[p.option.care].tradeoff}`;
}

/** More → Health → Mind and mood (M1): the conditions that have been named, how to care for them, who has noticed, and a therapist. */
export function MentalHealthSection({ mental }: { mental: MentalView }) {
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [pending, setPending] = useState<Pending | null>(null);
  const [seeing, setSeeing] = useState(false);

  const choose = (condition: MentalConditionView, option: CareOption) => {
    // Starting asks first (it costs something or reaches out to people); stopping medication asks too.
    const p: Pending = { condition, option, on: !option.on };
    if (p.on || option.care === 'medication') setPending(p);
    else void act('set_care', { conditionId: condition.id, care: option.care, on: false });
  };

  return (
    <>
      <Card role="region" aria-labelledby="mind-title">
        <h2 id="mind-title" className="text-lg font-bold">
          Mind and mood
        </h2>
        {mental.conditions.length === 0 ? (
          <p className="mt-1 text-muted" data-testid="no-mental">
            Nothing has been named here. If something feels off, a doctor or a therapist is a good place to start.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Mental health">
            {mental.conditions.map((c) => (
              <li key={c.id} className="flex min-w-0 flex-col gap-2 py-3" data-testid={`mental-${c.id}`}>
                <span className="font-semibold break-words">{c.name}</span>
                <span className="text-sm text-muted">
                  {CONDITION_KIND_LABELS[c.kind]} · {c.kind === 'neuro' ? 'Part of how you are' : severityLabel(c.severity)} · Named in {c.diagnosedYear}
                </span>
                {c.kind === 'mental' && <StatBar label={`${c.name}: how bad it is`} value={c.severity} />}
                <span className="text-sm break-words text-muted">{c.blurb}</span>
                {c.strengths.length > 0 && (
                  <div className="text-sm">
                    <p className="font-semibold">Strengths</p>
                    <ul className="list-disc pl-5 text-muted">
                      {c.strengths.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.challenges.length > 0 && (
                  <div className="text-sm">
                    <p className="font-semibold">Challenges</p>
                    <ul className="list-disc pl-5 text-muted">
                      {c.challenges.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm font-semibold">Ways to care for it</p>
                <ul className="flex flex-col gap-2" aria-label={`Ways to care for ${c.name}`}>
                  {c.care.map((o) => (
                    <li key={o.care} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border p-3">
                      <span className="font-semibold">
                        {MENTAL_CARE_LABELS[o.care].name}
                        {o.on ? ' · On' : ''}
                      </span>
                      <span className="text-sm text-muted">{MENTAL_CARE_LABELS[o.care].tradeoff}</span>
                      {o.yearly !== null && !mental.familyPays && (
                        <span className="text-sm text-muted">About {money(o.yearly)} a year.</span>
                      )}
                      {o.block ? (
                        <span className="text-sm">{MENTAL_CARE_BLOCK_LABELS[o.block]}</span>
                      ) : (
                        <Button variant={o.on ? 'secondary' : 'primary'} disabled={busy} onClick={() => choose(c, o)}>
                          {o.on ? `Stop ${MENTAL_CARE_LABELS[o.care].name.toLowerCase()}` : `Start ${MENTAL_CARE_LABELS[o.care].name.toLowerCase()}`}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted">Doing nothing costs nothing now, and can cost more later.</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {mental.noticed.length > 0 && (
        <Card role="region" aria-labelledby="noticed-title">
          <h2 id="noticed-title" className="text-lg font-bold">
            Who has noticed
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="People who have noticed">
            {mental.noticed.map((n) => (
              <li key={n.id} className="py-2">
                <span className="font-semibold">{n.name}</span>
                <span className="text-sm text-muted"> · {REACTION_LABELS[n.reaction]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card role="region" aria-labelledby="therapist-title">
        <h2 id="therapist-title" className="text-lg font-bold">
          See a therapist
        </h2>
        <p className="mt-1 text-muted">
          {mental.familyPays ? 'Your family takes you and pays.' : `A session costs about ${money(mental.therapist.cost)}.`} A therapist can listen, and may be able to
          put a name to what you’re carrying.
        </p>
        {mental.therapist.block ? (
          <p className="mt-2" data-testid="therapist-status">
            {THERAPIST_BLOCK_LABELS[mental.therapist.block]}
          </p>
        ) : (
          <Button block className="mt-3" disabled={busy} onClick={() => setSeeing(true)}>
            See a therapist
          </Button>
        )}
      </Card>

      <ConfirmSheet
        open={pending !== null}
        title={pending ? `${pending.on ? 'Start' : 'Stop'} ${MENTAL_CARE_LABELS[pending.option.care].name.toLowerCase()}` : 'Care'}
        body={pending ? pendingBody(pending, mental.familyPays) : ''}
        confirmLabel={pending?.on ? 'Start' : 'Stop'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) void act('set_care', { conditionId: p.condition.id, care: p.option.care as MentalCareId, on: p.on });
        }}
      />
      <ConfirmSheet
        open={seeing}
        title="See a therapist"
        body={mental.familyPays ? 'Your family will take you.' : `This will cost about ${money(mental.therapist.cost)}.`}
        confirmLabel="Go"
        onCancel={() => setSeeing(false)}
        onConfirm={() => {
          setSeeing(false);
          void act('see_therapist');
        }}
      />
    </>
  );
}
