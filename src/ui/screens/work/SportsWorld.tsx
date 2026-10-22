import type { LifeActionId, LifeActionParams } from '../../../engine/actions';
import type { SportsView } from '../../../engine/selectors';
import { Button } from '../../components/Button';
import { money, SPORTS_WORLD_WORDS } from '../../labels';
import { Section } from './SportsGrind';

type TakeAction = (actionId: LifeActionId, params?: LifeActionParams) => Promise<void>;

/**
 * Batch 6: where your team plays and what you commute to, a youth academy, a loan (on, or offered), the transfer window with its
 * offers, and the national side. Amounts are shown in the money you use; the fee is between the clubs and your share is paid to you.
 */
export function WorldSection({ view, disabled, act }: { view: SportsView; disabled: boolean; act: TakeAction }) {
  const t = view.team;
  const away = t?.away ?? null;
  const showAny = away !== null || view.academy !== null || view.loan !== null || view.loanOffer !== null || view.transfer.length > 0 || view.canAskLoan || view.rival !== null || (view.international?.caps ?? 0) > 0 || view.international?.calledUp === true || view.teamsPending;
  if (!showAny) return null;
  return (
    <Section title={SPORTS_WORLD_WORDS.title} testId="world">
      {t && away !== null && (
        <p className="mt-1" data-testid="away-line">
          {away === 'country' ? SPORTS_WORLD_WORDS.awayCountry(t.place ?? t.city, t.country ?? '', t.city) : SPORTS_WORLD_WORDS.awayCity(t.place ?? t.city, t.city)}
        </p>
      )}
      {t?.divisionName && (
        <p className="mt-1" data-testid="league-line">
          {t.divisionName}
        </p>
      )}
      {view.rival && (
        <p className="mt-1" data-testid="rival-line">
          {SPORTS_WORLD_WORDS.rival(view.rival)}
        </p>
      )}
      {view.academy && (
        <p className="mt-1" data-testid="academy-line">
          {SPORTS_WORLD_WORDS.academy(view.academy.club, view.academy.abroad)}
        </p>
      )}
      {view.loan && (
        <p className="mt-1" data-testid="loan-line">
          {SPORTS_WORLD_WORDS.onLoan(view.loan.host, view.loan.parent, view.loan.until)}
        </p>
      )}
      {view.loanOffer && (
        <div className="mt-2 flex flex-col gap-2" data-testid="loan-offer">
          <p>{SPORTS_WORLD_WORDS.loanOffer(view.loanOffer.parent, view.loanOffer.host)}</p>
          <Button variant="secondary" disabled={disabled} onClick={() => void act('take_loan')} data-testid="take-loan">
            Go on loan to {view.loanOffer.host}
          </Button>
          <Button variant="ghost" disabled={disabled} onClick={() => void act('refuse_loan')} data-testid="refuse-loan">
            Say no (the club decides)
          </Button>
        </div>
      )}
      {view.canAskLoan && (
        <Button className="mt-2" variant="secondary" disabled={disabled} onClick={() => void act('ask_loan')} data-testid="ask-loan">
          Ask your club for a loan
        </Button>
      )}
      {view.ask === 'loan' && <p className="mt-1 text-sm">You have asked your club for a loan. It decides when the season begins.</p>}
      {view.transfer.length > 0 && (
        <div className="mt-3" data-testid="transfer-window">
          <h4 className="text-sm font-bold">{SPORTS_WORLD_WORDS.window}</h4>
          <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Transfer offers">
            {view.transfer.map((o) => (
              <li key={o.id} className="flex min-w-0 flex-col gap-1 py-2" data-testid={`offer-${o.id}`}>
                <span className="font-semibold break-words">{o.club}</span>
                <span className="text-sm text-muted">
                  {o.place}
                  {o.country ? `, ${o.country}` : ''}
                  {o.abroad ? ' · a move abroad' : ''}
                </span>
                <span className="text-sm" data-testid={`offer-terms-${o.id}`}>
                  {SPORTS_WORLD_WORDS.terms(money(o.wage), o.years, money(o.fee), o.clause > 0 ? money(o.clause) : null)}
                </span>
                {o.block === null ? (
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" disabled={disabled} onClick={() => void act('accept_transfer', { offerId: o.id })} data-testid={`accept-${o.id}`}>
                      Sign for {o.club}
                    </Button>
                    {o.canPush && (
                      <Button variant="ghost" disabled={disabled} onClick={() => void act('accept_transfer', { offerId: o.id, push: true })} data-testid={`push-${o.id}`}>
                        Let your agent negotiate it
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted">{SPORTS_WORLD_WORDS.blocked[o.block] ?? 'Not now.'}</span>
                )}
              </li>
            ))}
          </ul>
          <Button className="mt-2" variant="ghost" disabled={disabled} onClick={() => void act('decline_transfers')} data-testid="decline-transfers">
            Turn them all down
          </Button>
        </div>
      )}
      {view.international && (view.international.caps > 0 || view.international.calledUp) && (
        <p className="mt-2" data-testid="national-line">
          {SPORTS_WORLD_WORDS.national(view.international.side, view.international.caps, view.international.tournaments, view.international.titles)}
        </p>
      )}
      {view.worldTotals.transfers + view.worldTotals.loans > 0 && (
        <p className="mt-1 text-sm text-muted" data-testid="world-totals">
          {SPORTS_WORLD_WORDS.totals(view.worldTotals.transfers, view.worldTotals.loans, money(view.worldTotals.fees))}
        </p>
      )}
      {view.teamsPending && <p className="mt-1 text-sm text-muted">Changes to the world of teams reach you next season.</p>}
    </Section>
  );
}

/** Batch 6: the teams of the sports you are looking at, by name (the ones you could play for). */
export function LeaguesSection({ view }: { view: SportsView }) {
  if (view.leagues.length === 0) return null;
  return (
    <Section title="Teams you could play for" testId="leagues">
      <div className="mt-1 flex flex-col gap-2">
        {view.leagues.map((l) => (
          <details key={l.sportId} className="rounded-xl border border-border px-3 py-2" data-testid={`league-${l.sportId}`}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">
              {l.sport}: {l.league}
            </summary>
            <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`${l.sport} league teams`}>
              {l.teams.map((t) => (
                <li key={t.id} className="flex flex-col py-1.5" data-testid={`league-team-${t.id}`}>
                  <span className={`break-words ${t.yours ? 'font-semibold' : ''}`}>
                    {t.name}
                    {t.yours ? ' (yours)' : ''}
                  </span>
                  <span className="text-sm text-muted">
                    {t.place}
                    {t.division === 2 ? ' · second league' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {l.more > 0 && <p className="py-1 text-sm text-muted">…and {l.more} more.</p>}
          </details>
        ))}
      </div>
    </Section>
  );
}
