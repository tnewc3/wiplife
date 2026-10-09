import { useState } from 'react';
import { content } from '../../../content';
import { FAME_COMMITMENTS, SPORT_FOCUSES, SPORT_RETIRE_ROUTES, type SportRetireRoute } from '../../../content/schemas';
import { getSportsView, type SportsSeasonView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import {
  BURNOUT_WORDS,
  COMMITMENT_BLOCK_LABELS,
  COMMITMENT_BLURBS,
  COMMITMENT_LABELS,
  CONTRACT_KIND_LABELS,
  CONTRACT_OPTION_LABELS,
  FAME_ENTER_BLOCK_LABELS,
  FAME_WORDS,
  FAN_MOOD_WORDS,
  FIT_WORDS,
  IMAGE_WORDS,
  INJURY_SEVERITY_WORDS,
  money,
  placeLabel,
  PLAYOFF_RESULT_LABELS,
  RATING_WORDS,
  SEASON_BAND_LABELS,
  SPORT_EXIT_BLOCK_LABELS,
  SPORT_EXIT_LABELS,
  SPORT_FOCUS_BLURBS,
  SPORT_FOCUS_LABELS,
  SPORT_LEVEL_LABELS,
  SPORT_RETIRED_LABELS,
  STALKER_STAGE_LABELS,
  TEAM_QUALITY_WORDS,
  fansLabel,
  salaryLabel,
} from '../../labels';
import { Ladder } from './FameScreen';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function SeasonLine({ s }: { s: SportsSeasonView }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 py-2" data-testid="season-row">
      <span className="font-semibold break-words">
        {s.year} · {s.team}
      </span>
      <span className="text-sm text-muted">
        {SPORT_LEVEL_LABELS[s.level]} · {s.position} · {s.record} · {placeLabel(s.rank)} of {s.of}
      </span>
      <span className="text-sm">
        {RATING_WORDS[s.ratingBand]} play. {PLAYOFF_RESULT_LABELS[s.result]}.{s.allStar ? ' An all-star.' : ''}
      </span>
    </li>
  );
}

/**
 * E6c: the Sports screen from the Work tab: the ladder with your rung and the
 * next milestone, your team and position, your deal, the latest season report,
 * injuries, awards, and the fame bars shared with the Fame screen. Words and
 * bars, never numbers for the scores; everything tappable is 44px or more.
 */
export function SportsScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getSportsView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [confirm, setConfirm] = useState<SportRetireRoute | null>(null);
  const disabled = busy || !view.between;
  const latest = view.latest;
  return (
    <>
      <Sheet open={open} title="Sports" onClose={onClose}>
        <div data-testid="sports-screen">
          {!view.between && <p className="mt-1 text-sm text-muted">Choices wait until the year is over.</p>}
          {view.minor && view.active && <p className="mt-1 text-sm">You are not in the pros until you are grown: a parent signs for you where it counts.</p>}

          {view.active && view.path && view.sport && (
            <>
              <Section title="Your ladder">
                <Ladder path={view.path} />
              </Section>

              <Section title="Your team" testId="team">
                {view.team ? (
                  <p className="mt-1" data-testid="team-line">
                    {view.team.name} · {SPORT_LEVEL_LABELS[view.team.level].toLowerCase()}
                    {view.team.city ? ` · ${view.team.city}` : ''} · {TEAM_QUALITY_WORDS[view.team.qualityBand]!.toLowerCase()}
                    {view.team.level === 'pro' ? ` · ${view.sport.league}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-muted" data-testid="team-line">
                    {view.freeAgent ? 'No team. Your agent is making calls.' : 'No team this year.'}
                  </p>
                )}
                {view.position && (
                  <p className="mt-1" data-testid="position-line">
                    {view.position.label} · {FIT_WORDS[view.position.fitBand]!.toLowerCase()}
                  </p>
                )}
                <div role="radiogroup" aria-label="Position" className="mt-2 flex flex-col gap-2">
                  {view.positions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={p.current}
                      disabled={disabled || (!p.current && !p.allowed)}
                      onClick={() => void act('set_position', { positionId: p.id })}
                      data-testid={`position-${p.id}`}
                      className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${p.current ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
                    >
                      <span className="font-semibold">
                        {p.label} <span className="font-normal text-muted">· {FIT_WORDS[p.fitBand]!.toLowerCase()}</span>
                      </span>
                      <span className="text-sm text-muted">{p.blurb}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-sm text-muted">Moving to another position costs a little of the craft you have built.</p>
              </Section>

              <Section title="This year’s training" testId="focus">
                <div role="radiogroup" aria-label="Training focus" className="mt-2 flex flex-col gap-2">
                  {SPORT_FOCUSES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={view.focus === id}
                      disabled={disabled || view.focus === id}
                      onClick={() => void act('set_focus', { sportFocus: id })}
                      data-testid={`focus-${id}`}
                      className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${view.focus === id ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
                    >
                      <span className="font-semibold">{SPORT_FOCUS_LABELS[id]}</span>
                      <span className="text-sm text-muted">{SPORT_FOCUS_BLURBS[id]}</span>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Your deal" testId="deal">
                {view.contract ? (
                  <p className="mt-1" data-testid="contract-line">
                    {view.contract.team}: {CONTRACT_KIND_LABELS[view.contract.kind as keyof typeof CONTRACT_KIND_LABELS].toLowerCase()}, {salaryLabel(view.contract.salary)}, until {view.contract.until} ({view.contract.yearsLeft} {view.contract.yearsLeft === 1 ? 'year' : 'years'} left), with{' '}
                    {CONTRACT_OPTION_LABELS[view.contract.option as keyof typeof CONTRACT_OPTION_LABELS]}.
                  </p>
                ) : (
                  <p className="mt-1 text-muted" data-testid="contract-line">
                    {view.level === 'pro' ? 'No deal at the moment.' : 'Amateur play pays nothing. The pros take a draft or a signing.'}
                  </p>
                )}
                {view.draft && (
                  <p className="mt-1" data-testid="draft-line">
                    {view.draft.pick > 0 ? `You went ${view.draft.pick}${view.draft.team ? ` to ${view.draft.team}` : ''}.` : view.draft.team ? `Undrafted, with an offer from ${view.draft.team}.` : 'Undrafted.'}
                  </p>
                )}
                {view.playOut && <p className="mt-1 text-sm text-muted">You are playing out your deal to test the market.</p>}
                {view.ask && (
                  <p className="mt-1 text-sm" data-testid="ask-line">
                    {view.ask === 'trade' ? 'Your agent is working on a trade.' : 'Your agent is pushing for a new deal.'}
                  </p>
                )}
                {view.contract && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Button variant="secondary" disabled={disabled || !view.canAskTrade} onClick={() => void act('ask_trade')} data-testid="ask-trade">
                      Ask your agent for a trade
                    </Button>
                    <Button variant="secondary" disabled={disabled || !view.canAskContract} onClick={() => void act('ask_contract')} data-testid="ask-contract">
                      Ask your agent for a new deal
                    </Button>
                    {view.ask && (
                      <Button variant="ghost" disabled={disabled} onClick={() => void act('cancel_ask')}>
                        Call it off
                      </Button>
                    )}
                    {!view.agent && <p className="text-sm text-muted">You need an agent for that.</p>}
                  </div>
                )}
              </Section>

              {view.injury && (
                <Section title="Your body" testId="injury">
                  <p className="mt-1" data-testid="injury-line">
                    {INJURY_SEVERITY_WORDS[view.injury.severityBand]} {view.injury.name}
                    {view.injury.treated ? ', treated' : ', not yet treated'}.{view.injury.pain ? ' You are playing through it.' : ''}
                  </p>
                </Section>
              )}

              <Section title="Latest season" testId="latest">
                {latest ? (
                  <div className="mt-1" data-testid="season-report">
                    <p className="font-semibold">
                      {latest.year} · {latest.team}
                    </p>
                    <p className="text-sm text-muted">
                      {SPORT_LEVEL_LABELS[latest.level]} · {latest.position}
                    </p>
                    <p data-testid="season-record">
                      {latest.record}, {placeLabel(latest.rank)} of {latest.of}. {PLAYOFF_RESULT_LABELS[latest.result]}.
                    </p>
                    <p data-testid="season-play">
                      {RATING_WORDS[latest.ratingBand]} play{latest.played < 100 ? `, in ${latest.played}% of the games` : ''}.{latest.band ? ` ${SEASON_BAND_LABELS[latest.band]}.` : ''}
                      {latest.allStar ? ' An all-star.' : ''}
                      {latest.injury ? ` Hurt: ${latest.injury}.` : ''}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Key numbers" data-testid="season-stats">
                      {latest.stats.map((x) => (
                        <li key={x.label}>
                          <span className="text-muted">{x.label}:</span> <span className="font-semibold">{x.value}</span>
                        </li>
                      ))}
                    </ul>
                    {latest.press && <p className="mt-2 text-sm italic">{latest.press}</p>}
                    {latest.fans && <p className="text-sm italic">{latest.fans}</p>}
                    {latest.salary > 0 && <p className="mt-1 text-sm text-muted">Paid {money(latest.salary)} before the cuts, through your yearly ledger.</p>}
                  </div>
                ) : (
                  <p className="mt-1 text-muted">No season yet. It plays as the year begins.</p>
                )}
                {view.run && (
                  <p className="mt-2" data-testid="run-line">
                    In the playoffs: {view.run.won} {view.run.won === 1 ? 'series' : 'series'} won; next is {view.run.stage}.
                  </p>
                )}
                {view.seasons.length > 1 && (
                  <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Seasons">
                    {view.seasons.slice(1, 6).map((s) => (
                      <SeasonLine key={`${s.year}-${s.team}`} s={s} />
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="How you stand" testId="standing">
                <div className="mt-2 flex flex-col gap-3">
                  <div>
                    <StatBar label="Fame" value={view.fame} />
                    <p className="text-sm" data-testid="screen-fame">
                      {FAME_WORDS[view.fameBand]}
                    </p>
                  </div>
                  <div>
                    <StatBar label="Public image" value={view.image} />
                    <p className="text-sm" data-testid="screen-image">
                      {IMAGE_WORDS[view.imageBand]}
                    </p>
                  </div>
                  <div>
                    <StatBar label="Fan mood" value={view.mood} />
                    <p className="text-sm" data-testid="screen-mood">
                      {FAN_MOOD_WORDS[view.moodBand]} · about {fansLabel(view.fans)} fans
                    </p>
                  </div>
                  <div>
                    <StatBar label="Burnout" value={view.burnout} />
                    <p className="text-sm" data-testid="screen-burnout">
                      {BURNOUT_WORDS[view.burnoutBand]}
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="How much you give it" testId="commitment">
                <div role="radiogroup" aria-label="Commitment" className="mt-2 flex flex-col gap-2">
                  {FAME_COMMITMENTS.map((id) => {
                    const c = view.commitments.find((x) => x.id === id)!;
                    const checked = view.commitment === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled || (!checked && !c.allowed)}
                        onClick={() => void act('set_commitment', { commitment: id })}
                        data-testid={`commitment-${id}`}
                        className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${checked ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
                      >
                        <span className="font-semibold">{COMMITMENT_LABELS[id]}</span>
                        <span className="text-sm text-muted">{c.block ? COMMITMENT_BLOCK_LABELS[c.block] : COMMITMENT_BLURBS[id]}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Agent and endorsements" testId="business">
                <p className="mt-1" data-testid="agent-line">
                  {view.agent ? `${view.agent.name} · takes ${Math.round(view.agent.cut * 100)}%` : 'No agent.'}
                </p>
                {view.agent && (
                  <Button variant="ghost" disabled={disabled} onClick={() => void act('drop_agent')}>
                    Part ways with your agent
                  </Button>
                )}
                {view.openAgents.length > 0 && (
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Agents who would take you on">
                    {view.openAgents.map((a) => (
                      <li key={a.id} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold break-words">
                          {a.name} · takes {Math.round(a.cut * 100)}%
                        </span>
                        <span className="text-sm text-muted">{a.blurb}</span>
                        <Button variant="secondary" disabled={disabled} onClick={() => void act('hire_agent', { agentId: a.id })} data-testid={`hire-${a.id}`}>
                          Take them on
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3" data-testid="endorsement-line">
                  {view.endorsement ? `${cap(view.endorsement.company)} · until ${view.endorsement.until} · they keep ${Math.round(view.endorsement.share * 100)}% of what you earn from them` : 'No endorsement deal. Brands come to players people know.'}
                </p>
              </Section>

              <Section title="Awards and totals" testId="awards">
                {view.nominated && (
                  <p className="mt-1" data-testid="nominated">
                    Nominated for {view.nominated.name} ({view.nominated.category}). The night is next year.
                  </p>
                )}
                {view.awards.length === 0 && !view.nominated ? (
                  <p className="mt-1 text-muted">An empty shelf. Good seasons get nominated.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1" aria-label="Awards shelf">
                    {view.awards.map((a, i) => (
                      <li key={i} className="break-words">
                        {a.won ? 'Won' : 'Nominated'}: {a.name}, {a.category} ({a.year})
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="mt-2 flex flex-col text-sm" data-testid="totals">
                  <div className="flex justify-between gap-3">
                    <dt>Seasons</dt>
                    <dd>{view.totals.seasons}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Playoff runs</dt>
                    <dd>{view.totals.playoffs}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Titles</dt>
                    <dd>{view.totals.titles}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>All-star seasons</dt>
                    <dd>{view.totals.allStars}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Injuries</dt>
                    <dd>{view.totals.injuries}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Paid by teams</dt>
                    <dd>{money(view.totals.earned)}</dd>
                  </div>
                </dl>
              </Section>

              <Section title="People who came with it" testId="fan-people">
                {view.people.super.length + view.people.hater.length + view.people.critic.length === 0 ? (
                  <p className="mt-1 text-muted">No one stands out yet.</p>
                ) : (
                  <dl className="mt-1 flex flex-col gap-1">
                    {(
                      [
                        ['Superfans', view.people.super],
                        ['Haters', view.people.hater],
                        ['Critics', view.people.critic],
                      ] as const
                    ).map(([label, names]) =>
                      names.length === 0 ? null : (
                        <div key={label} className="flex justify-between gap-3">
                          <dt>{label}</dt>
                          <dd className="min-w-0 break-words text-right">{names.join(', ')}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
                {view.stalker && (
                  <p className="mt-2 font-semibold text-danger" data-testid="stalker">
                    {view.stalker.name}: {STALKER_STAGE_LABELS[view.stalker.stage]}.
                  </p>
                )}
              </Section>

              {view.headlines.length > 0 && (
                <Section title="In the papers" testId="headlines">
                  <ul className="mt-1 flex flex-col gap-1" aria-label="Headlines">
                    {view.headlines.map((h, i) => (
                      <li key={i} className="break-words">
                        {h.text} <span className="text-sm text-muted">({h.year})</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Leaving the game" testId="exits">
                <p className="mt-1 text-sm text-muted">Athletes peak young. When you are ready, there are ways out that are not a cliff.</p>
                <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Ways to leave">
                  {SPORT_RETIRE_ROUTES.map((route) => {
                    const exit = view.exits.find((x) => x.route === route);
                    const block = exit?.block ?? null;
                    return (
                      <li key={route} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold">{SPORT_EXIT_LABELS[route].label}</span>
                        <span className="text-sm text-muted">{SPORT_EXIT_LABELS[route].blurb}</span>
                        {block ? (
                          <span className="text-sm text-muted">{SPORT_EXIT_BLOCK_LABELS[block as keyof typeof SPORT_EXIT_BLOCK_LABELS] ?? 'Not open to you.'}</span>
                        ) : (
                          <Button variant="ghost" disabled={disabled} onClick={() => setConfirm(route)} data-testid={`exit-${route}`}>
                            {SPORT_EXIT_LABELS[route].label}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            </>
          )}

          {!view.active && view.retired && (
            <Section title="After the game" testId="after">
              <p className="mt-1" data-testid="after-line">
                {view.retired.route ? SPORT_RETIRED_LABELS[view.retired.route] : 'Your playing days are over.'}
              </p>
              <p className="mt-1 text-sm text-muted">
                {view.totals.seasons} seasons, {view.totals.titles} {view.totals.titles === 1 ? 'title' : 'titles'}, {view.totals.allStars} all-star {view.totals.allStars === 1 ? 'season' : 'seasons'}. Teams paid you {money(view.totals.earned)} before the cuts.
              </p>
              {view.latest && (
                <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Seasons">
                  {view.seasons.slice(0, 5).map((s) => (
                    <SeasonLine key={`${s.year}-${s.team}`} s={s} />
                  ))}
                </ul>
              )}
            </Section>
          )}

          {!view.active && !view.retired && (
            <Section title="Ways in" testId="entry">
              {view.minor && <p className="mt-1 text-sm">A parent has to sign for you.</p>}
              {view.entry.map((e) => (
                <Card key={e.pathId} className="mt-2">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-sm text-muted">{e.blurb}</p>
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`${e.name} routes`}>
                    {e.routes.map((r) => (
                      <li key={r.id} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold break-words">{r.label}</span>
                        <span className="text-sm text-muted">{r.blurb}</span>
                        {r.block ? (
                          <span className="text-sm text-muted">{r.block === 'age' ? `From age ${r.minAge}.` : FAME_ENTER_BLOCK_LABELS[r.block]}</span>
                        ) : (
                          <Button variant="secondary" disabled={disabled} onClick={() => void act('enter_fame', { pathId: e.pathId, routeId: r.id })} data-testid={`enter-${e.pathId}-${r.id}`}>
                            Start
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </Section>
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm !== null}
        title={confirm ? `${SPORT_EXIT_LABELS[confirm].label}?` : ''}
        body="Your playing days end. Your team, your deal and your agent go; fame turns into royalties that fade. This is not something you can take back."
        confirmLabel={confirm ? SPORT_EXIT_LABELS[confirm].label : 'Leave'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const route = confirm;
          setConfirm(null);
          if (route) void act('retire_sports', { routeKey: route });
        }}
      />
    </>
  );
}
