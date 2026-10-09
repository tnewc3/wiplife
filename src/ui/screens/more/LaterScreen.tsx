import { useState } from 'react';
import { content } from '../../../content';
import { getLaterView, type LaterPersonView } from '../../../engine/selectors';
import type { HospiceChoice, Id, LifeState, ServiceStyle } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { OWN_CARE_LABELS, HOSPICE_LABELS, laterPersonLine, LATER_TITLES, money, SERVICE_LABELS } from '../../labels';

/** A choice among a few options, each at least 44px tall, nothing depending on hover. */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { id: T; name: string; blurb: string }[];
  value: T | null;
  onChange: (id: T | null) => void;
  testId: string;
}) {
  return (
    <fieldset className="mt-3" data-testid={testId}>
      <legend className="font-semibold">{label}</legend>
      <div className="mt-1 flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            data-testid={`${testId}-${o.id}`}
            onClick={() => onChange(value === o.id ? null : o.id)}
            className={`flex min-h-11 w-full flex-col rounded-xl border px-3 py-2 text-left ${value === o.id ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
          >
            <span className="font-semibold">{o.name}</span>
            <span className="text-sm text-muted">{o.blurb}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A list of people to pick from (several, up to a limit). */
function PeoplePicker({
  label,
  people,
  picked,
  limit,
  onToggle,
  testId,
}: {
  label: string;
  people: LaterPersonView[];
  picked: Id[];
  limit: number;
  onToggle: (id: Id) => void;
  testId: string;
}) {
  return (
    <fieldset className="mt-3" data-testid={testId}>
      <legend className="font-semibold">
        {label} <span className="font-normal text-muted">(up to {limit})</span>
      </legend>
      <ul className="mt-1 flex flex-col gap-2">
        {people.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!on && picked.length >= limit}
                data-testid={`${testId}-${p.id}`}
                onClick={() => onToggle(p.id)}
                className={`flex min-h-11 w-full flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${on ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
              >
                <span className="font-semibold break-words [overflow-wrap:anywhere]">{p.name}</span>
                <span className="text-sm text-muted">{laterPersonLine(p)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * More → Later life (L1): your grandchildren, how you are looked after near the
 * end, and, when you have been told a death is coming, your final wishes:
 * where you spend your last months, the service you want, who you want with
 * you, who you write to and who you ask to speak. The will has its own page.
 */
export function LaterScreen({ life }: { life: LifeState }) {
  const view = getLaterView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openPerson = useAppStore((s) => s.openPerson);
  const setTab = useAppStore((s) => s.setTab);
  const openWill = useAppStore((s) => s.openWill);
  const [message, setMessage] = useState<string | null>(null);
  const t = view.terminal;
  const [hospice, setHospice] = useState<HospiceChoice | null>(t?.hospice ?? null);
  const [service, setService] = useState<ServiceStyle | null>(t?.service ?? null);
  const [speaker, setSpeaker] = useState<Id | null>(t?.speakerId ?? null);
  const [letters, setLetters] = useState<Id[]>(t?.letters ?? []);
  const [visitors, setVisitors] = useState<Id[]>(t?.visitors.map((v) => v.id) ?? []);

  const toggle = (list: Id[], set: (next: Id[]) => void) => (id: Id) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const seePerson = (id: Id) => {
    setTab('people');
    openPerson(id);
  };

  const saveWishes = () => {
    setMessage(null);
    void act('set_final_wishes', { wishes: { hospice, service, speakerId: speaker, letters, visitors } }).then(() => setMessage('Your wishes are set. The people you asked have answered.'));
  };
  const arrange = (option: 'family' | 'paid' | 'assisted', carerId?: Id) => {
    setMessage(null);
    void act('choose_care', { careOption: option, ...(carerId !== undefined ? { carerId } : {}) }).then(() => setMessage('Your care is arranged.'));
  };

  if (!view.active) {
    return (
      <Card role="region" aria-labelledby="later-title">
        <h2 id="later-title" className="text-2xl leading-tight font-bold">
          Later life
        </h2>
        <p className="mt-2 text-muted">Nothing here yet.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(view.grandchildren.length > 0 || view.raising.length > 0) && (
        <Card role="region" aria-labelledby="later-grandchildren">
          <h2 id="later-grandchildren" className="text-lg font-bold">
            {view.raising.length > 0 ? LATER_TITLES.raising : LATER_TITLES.grandchildren}
          </h2>
          <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={LATER_TITLES.grandchildren} data-testid="later-grandchildren">
            {[...view.raising, ...view.grandchildren].map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => seePerson(p.id)} className="flex min-h-11 w-full min-w-0 flex-col py-3 text-left active:bg-surface-2">
                  <span className="font-semibold break-words [overflow-wrap:anywhere]">{p.name}</span>
                  <span className="text-sm text-muted">{laterPersonLine(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view.care && (
        <Card role="region" aria-labelledby="later-care" data-testid="later-care">
          <h2 id="later-care" className="text-lg font-bold">
            {LATER_TITLES.care}
          </h2>
          <p className="mt-1" data-testid="later-care-status">
            {view.care.option === null
              ? 'You need looking after, and nothing is arranged yet.'
              : view.care.option === 'family' && view.care.provider
                ? `${view.care.provider.name} looks after you.`
                : `Arranged: ${OWN_CARE_LABELS[view.care.option].name.toLowerCase()}.`}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {view.care.family.map((p) => (
              <Button key={p.id} variant="secondary" block disabled={busy || view.care!.option === 'family' && view.care!.provider?.id === p.id} data-testid={`care-family-${p.id}`} onClick={() => arrange('family', p.id)}>
                Let {p.name.split(' ')[0]} look after you{p.returning ? ' (estranged, but willing)' : ''}
              </Button>
            ))}
            <Button variant="secondary" block disabled={busy || view.care.option === 'paid'} data-testid="care-paid" onClick={() => arrange('paid')}>
              {OWN_CARE_LABELS.paid.name} · {money(view.care.paidCost)} a year
            </Button>
            {view.care.canAssisted && (
              <Button variant="secondary" block disabled={busy || view.care.option === 'assisted'} data-testid="care-assisted" onClick={() => arrange('assisted')}>
                {OWN_CARE_LABELS.assisted.name} · {money(view.care.assistedCost)} a year
              </Button>
            )}
          </div>
        </Card>
      )}

      {t && (
        <Card role="region" aria-labelledby="later-wishes" data-testid="later-wishes">
          <h2 id="later-wishes" className="text-lg font-bold">
            {LATER_TITLES.wishes}
          </h2>
          <p className="mt-1 text-muted">
            You were told your time is short. Where you spend it, who is with you and what comes after are yours to decide, and what you choose shapes your funeral and who comes.
          </p>
          <Choice
            label="Where you spend your last months"
            testId="wish-hospice"
            value={hospice}
            onChange={setHospice}
            options={t.hospiceOptions.map((o) => ({ id: o.id, name: `${HOSPICE_LABELS[o.id].name} · ${money(o.cost)} a year`, blurb: HOSPICE_LABELS[o.id].blurb }))}
          />
          <Choice
            label="The service"
            testId="wish-service"
            value={service}
            onChange={setService}
            options={t.serviceOptions.map((o) => ({ id: o.id, name: `${SERVICE_LABELS[o.id].name} · about ${money(o.funeral)}`, blurb: SERVICE_LABELS[o.id].blurb }))}
          />
          <PeoplePicker label="Who you want with you" testId="wish-visitors" people={t.people} picked={visitors} limit={t.maxVisitors} onToggle={toggle(visitors, setVisitors)} />
          <PeoplePicker label="Who you write a last letter to" testId="wish-letters" people={t.people} picked={letters} limit={t.maxLetters} onToggle={toggle(letters, setLetters)} />
          <Choice
            label="Who speaks at your funeral"
            testId="wish-speaker"
            value={speaker}
            onChange={setSpeaker}
            options={t.people.filter((p) => p.canSpeak).slice(0, 8).map((p) => ({ id: p.id, name: p.name, blurb: laterPersonLine(p) }))}
          />
          <div className="mt-4 flex flex-col gap-2">
            <Button block disabled={busy || !t.canSet} data-testid="wishes-save" onClick={saveWishes}>
              {t.wishesSet ? 'Update my wishes' : 'Set my wishes'}
            </Button>
            <Button variant="secondary" block onClick={openWill} data-testid="later-open-will">
              {view.hasWill ? (view.willOutOfDate ? 'Update your will (it is out of date)' : 'See your will') : 'Write your will'}
            </Button>
          </div>
          {t.visitors.length > 0 && (
            <p className="mt-3 text-sm" data-testid="wish-answers">
              Asked to be with you: {t.visitors.map((v) => `${life.people[v.id]!.name.first} ${v.came ? 'said yes' : 'did not come'}`).join(', ')}.
            </p>
          )}
        </Card>
      )}

      {message && (
        <p role="status" className="text-sm" data-testid="later-message">
          {message}
        </p>
      )}
    </div>
  );
}
