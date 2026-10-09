import type { ArchivedLife } from '../../engine/types';
import { andMore, FUNERAL_LABELS, spokenBy } from '../labels';
import { Card } from './Card';

function GuestList({ label, guests, testId }: { label: string; guests: { name: string; relation: string; reason: string }[]; testId: string }) {
  return (
    <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={label} data-testid={testId}>
      {guests.map((g) => (
        <li key={`${g.name}-${g.relation}`} className="py-2">
          <span className="block font-semibold break-words [overflow-wrap:anywhere]">
            {g.name} <span className="font-normal text-muted">· {g.relation}</span>
          </span>
          <span className="block text-sm break-words text-muted [overflow-wrap:anywhere]">{g.reason}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The funeral of a life that ended (W1): the eulogy, then who chose not to
 * come, then who could not. Used on the funeral screen and in the archive.
 * `headingLevel` is the level of the card headings.
 */
export function FuneralCards({ life, headingLevel = 2 }: { life: ArchivedLife; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const funeral = life.funeral;
  if (life.unfinished) return null;
  if (!funeral) {
    return (
      <Card data-testid="funeral-none">
        <Heading className="text-lg font-bold">{FUNERAL_LABELS.screen}</Heading>
        <p className="mt-1 text-muted">{FUNERAL_LABELS.noFuneral}</p>
      </Card>
    );
  }
  const { eulogy } = funeral;
  return (
    <>
      <Card role="region" aria-label={FUNERAL_LABELS.eulogy} data-testid="eulogy">
        <Heading className="text-lg font-bold">{FUNERAL_LABELS.eulogy}</Heading>
        {eulogy ? (
          <>
            <p className="mt-1 text-sm text-muted" data-testid="eulogy-speaker">
              {spokenBy(eulogy.speakerName, eulogy.relation)}
            </p>
            <div className="mt-3 flex flex-col gap-3 leading-relaxed" data-testid="eulogy-text">
              {eulogy.paragraphs.map((p, i) => (
                <p key={i} className="break-words [overflow-wrap:anywhere]">
                  {p}
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1" data-testid="eulogy-none">
            {FUNERAL_LABELS.noSpeaker}
          </p>
        )}
      </Card>
      <Card role="region" aria-label={FUNERAL_LABELS.absent} data-testid="funeral-absent">
        <Heading className="text-lg font-bold">{FUNERAL_LABELS.absent}</Heading>
        {funeral.notAttending.length === 0 ? (
          <p className="mt-1 text-muted" data-testid="funeral-absent-none">
            {FUNERAL_LABELS.everyoneCame}
          </p>
        ) : (
          <>
            <GuestList label="People who chose not to come" guests={funeral.notAttending} testId="funeral-absent-list" />
            {funeral.moreNotAttending > 0 && <p className="mt-2 text-sm text-muted">{andMore(funeral.moreNotAttending)}</p>}
          </>
        )}
      </Card>
      {funeral.couldNotAttend.length > 0 && (
        <Card role="region" aria-label={FUNERAL_LABELS.unable} data-testid="funeral-unable">
          <Heading className="text-lg font-bold">{FUNERAL_LABELS.unable}</Heading>
          <p className="mt-1 text-sm text-muted">{FUNERAL_LABELS.unableNote}</p>
          <GuestList label="People who could not come" guests={funeral.couldNotAttend} testId="funeral-unable-list" />
        </Card>
      )}
    </>
  );
}
