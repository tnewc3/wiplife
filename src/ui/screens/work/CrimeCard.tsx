import { content } from '../../../content';
import { getCrimeView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { Card } from '../../components/Card';
import { CRIME_HOW_LABELS, HEAT_BLURBS, HEAT_WORDS, RIVALRY_WORDS, STANDING_WORDS } from '../../labels';

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 font-semibold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/**
 * E6a: your crime career on the Work tab: the crew, your rank, how the crew
 * thinks of you, the heat on you and the rival crew, all as words; or, once
 * you are out, how it ended. It sits beside a legal job, never instead of its
 * card.
 */
export function CrimeCard({ life }: { life: LifeState }) {
  const view = getCrimeView(life, content);
  if (!view.show) return null;
  return (
    <Card role="region" aria-labelledby="crime-title" data-testid="crime-card">
      <h2 id="crime-title" className="text-lg font-bold">
        {view.member ? view.crew.replace(/^the /, 'The ') : 'Crime'}
      </h2>
      {view.member && (
        <>
          <p className="mt-1 text-muted">{view.blurb}</p>
          <dl className="mt-2 flex flex-col" aria-label="Your place in the crew">
            <Row label="Your rank" value={view.rankTitle[0]!.toUpperCase() + view.rankTitle.slice(1)} testId="crime-rank" />
            <Row label="Standing" value={STANDING_WORDS[view.standingBand]!} testId="crime-standing" />
            <Row label="Police attention" value={HEAT_WORDS[view.heatBand]!} testId="crime-heat" />
            {view.rival !== null && view.rivalryBand !== null && <Row label={`With ${view.rival}`} value={RIVALRY_WORDS[view.rivalryBand]!} testId="crime-rivalry" />}
          </dl>
          <p className="mt-2 text-sm text-muted" data-testid="crime-heat-blurb">
            {HEAT_BLURBS[view.heatBand]}
          </p>
          {view.investigated && (
            <p className="mt-2 font-semibold text-danger" data-testid="crime-investigated">
              The police are looking into you.
            </p>
          )}
          {view.nextTitle !== null && (
            <p className="mt-2 text-sm" data-testid="crime-next">
              {view.readyForNext ? `The crew is thinking about making you a ${view.nextTitle}.` : `Next: ${view.nextTitle}. It takes trust, and time at your rank.`}
            </p>
          )}
          {view.members.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-semibold">People in the crew</h3>
              <ul className="flex flex-col divide-y divide-border" aria-label="People in the crew">
                {view.members.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 break-words">{m.name}</span>
                    {m.leads && <span className="text-sm text-muted">Runs the crew</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {!view.member && view.past && (
        <div data-testid="crime-past">
          <p className="mt-1">
            {CRIME_HOW_LABELS[view.past.how as keyof typeof CRIME_HOW_LABELS]}: {view.past.crew}. You reached {view.past.topTitle}.
          </p>
          <dl className="mt-2 flex flex-col" aria-label="What follows you">
            <Row label="Police attention" value={HEAT_WORDS[view.heatBand]!} testId="crime-heat" />
          </dl>
          <p className="mt-2 text-sm text-muted">The past can still find you.</p>
        </div>
      )}
      {!view.member && !view.past && (
        <dl className="mt-2 flex flex-col" aria-label="What follows you">
          <Row label="Police attention" value={HEAT_WORDS[view.heatBand]!} testId="crime-heat" />
        </dl>
      )}
    </Card>
  );
}
