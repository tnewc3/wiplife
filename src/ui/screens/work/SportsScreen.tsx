import { Shirt } from 'lucide-react';
import { useState } from 'react';
import { content } from '../../../content';
import { FAME_COMMITMENTS, SPORT_FOCUSES, SPORT_RETIRE_ROUTES, type SportRetireRoute } from '../../../content/schemas';
import { getEnhancerView, getSportsView, type SportsSeasonView, type SportsView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CollapsibleGroup } from '../../components/CollapsibleGroup';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import {
  BURNOUT_WORDS,
  COMMITMENT_BLOCK_LABELS,
  COMMITMENT_BLURBS,
  COMMITMENT_LABELS,
  CONTRACT_KIND_LABELS,
  CONTRACT_OPTION_LABELS,
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
  SPORTS_HUB_LABELS,
  SPORTS_TAB_LABELS,
} from '../../labels';
import { renameDeep, useTeamText } from '../../useTeamNames';
import { LeaguesSection, WorldSection } from './SportsWorld';
import { Ladder } from './FameScreen';
import { DraftSection, ScholarshipSection, Section, TeamsList, TeamStanding, TrainingSection } from './SportsGrind';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

type SportsTab = 'overview' | 'season' | 'league' | 'history';
const TABS = (Object.keys(SPORTS_TAB_LABELS) as SportsTab[]).map((id) => ({ id, label: SPORTS_TAB_LABELS[id], testId: `sports-tab-${id}` }));

/** A jersey's color: one of the category tokens, picked from the team's name. */
const JERSEY = ['family', 'love', 'friends', 'people', 'work', 'school', 'money', 'health', 'mind', 'fame', 'sports', 'home', 'travel', 'pets'] as const;
function jerseyColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `var(--wl-cat-${JERSEY[h % JERSEY.length]})`;
}

/** The league: every team of your sport with its jersey and a strength bar, strongest first (yours marked). */
function LeagueTable({ view }: { view: SportsView }) {
  const l = view.leagues[0];
  if (!l) return null;
  const teams = [...l.teams].sort((a, b) => b.quality - a.quality || (a.name < b.name ? -1 : 1));
  return (
    <Section title={SPORTS_HUB_LABELS.standings} testId="standings">
      <RowList label={`${l.league} teams`} className="mt-1">
        {teams.map((t, i) => (
          <ListRow
            key={t.id}
            lead={<Shirt aria-hidden="true" size={28} style={{ color: jerseyColor(t.name) }} fill="currentColor" />}
            title={`${i + 1}. ${t.name}${t.yours ? ` (${SPORTS_HUB_LABELS.yourTeam.toLowerCase()})` : ''}`}
            subtitle={`${t.place}${t.division === 2 ? ' · second league' : ''}`}
            value={<MiniBar label={`${t.name} strength`} value={t.quality} />}
            testId={`league-team-${t.id}`}
          />
        ))}
      </RowList>
      {l.more > 0 && <p className="py-1 text-sm text-muted">…and {l.more} more.</p>}
    </Section>
  );
}

/** One compact row per season (team, Greatness bar, a trophy for a championship); a tap shows that season's summary. */
function HistoryRows({ seasons }: { seasons: SportsSeasonView[] }) {
  const [open, setOpen] = useState<SportsSeasonView | null>(null);
  return (
    <Section title={SPORTS_HUB_LABELS.history} testId="season-history">
      {seasons.length === 0 ? (
        <p className="mt-1 text-muted">{SPORTS_HUB_LABELS.historyEmpty}</p>
      ) : (
        <RowList label={SPORTS_HUB_LABELS.history} className="mt-1">
          {seasons.map((s) => (
            <ListRow
              key={`${s.year}-${s.team}`}
              icon={s.result === 'champion' ? 'trophy' : undefined}
              title={`${s.year} · ${s.team}`}
              subtitle={`${s.record} · ${placeLabel(s.rank)} of ${s.of}`}
              value={<MiniBar label={`${s.year} ${SPORTS_HUB_LABELS.greatness}`} value={s.rating} />}
              ending="chevron"
              onClick={() => setOpen(s)}
              testId="season-row"
            />
          ))}
        </RowList>
      )}
      <Sheet open={open !== null} title={open ? `${open.year} · ${open.team}` : ''} onClose={() => setOpen(null)}>
        {open && (
          <div data-testid="season-summary" className="flex flex-col gap-1">
            <p className="text-sm text-muted">
              {SPORT_LEVEL_LABELS[open.level]} · {open.position}
            </p>
            <p>
              {open.record}, {placeLabel(open.rank)} of {open.of}. {PLAYOFF_RESULT_LABELS[open.result]}.
            </p>
            <p>
              {RATING_WORDS[open.ratingBand]} play{open.played < 100 ? `, in ${open.played}% of the games` : ''}.{open.allStar ? ' An all-star.' : ''}
              {open.injury ? ` Hurt: ${open.injury}.` : ''}
            </p>
            {open.stats.length > 0 && <p className="text-sm">{open.statLine}</p>}
            {open.salary > 0 && <p className="text-sm text-muted">Paid {money(open.salary)} before the cuts.</p>}
          </div>
        )}
      </Sheet>
    </Section>
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
  const teamText = useTeamText();
  const view = renameDeep(getSportsView(life, content), teamText);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [confirm, setConfirm] = useState<SportRetireRoute | null>(null);
  const [tab, setTab] = useState<SportsTab>('overview');
  const [enhance, setEnhance] = useState(false);
  const enhancers = getEnhancerView(life, content);
  const minorAge = life.character.age < content.balance.careers.hub.youthAge && view.active;
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
              <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Sports" />

              {tab === 'overview' && (
                <div className="flex flex-col gap-2" data-testid="sports-overview">
                  <RowList label="Your sports career" className="mt-3">
                    <ListRow icon="trophy" title={`${view.position?.label ?? view.sport.name} · ${view.sport.name}`} subtitle={view.sport.league} value={<MiniBar label={SPORTS_HUB_LABELS.greatness} value={view.greatness} />} testId="sports-role-row" />
                    <ListRow
                      icon="busts_in_silhouette"
                      title={view.team?.name ?? SPORTS_HUB_LABELS.team}
                      subtitle={view.team ? `${SPORT_LEVEL_LABELS[view.team.level]}${view.team.city ? ` · ${view.team.city}` : ''}` : view.freeAgent ? 'No team. Your agent is making calls.' : 'No team this year'}
                      value={view.team ? <MiniBar label={SPORTS_HUB_LABELS.strength} value={view.team.quality} /> : undefined}
                      testId="sports-team-row"
                    />
                    <ListRow icon="money_bag" title={SPORTS_HUB_LABELS.contract} subtitle={view.contract ? `${view.contract.team} · until ${view.contract.until}` : SPORTS_HUB_LABELS.noContract} value={view.contract ? `${money(view.contract.salary)}` : undefined} testId="sports-contract-row" />
                    <ListRow icon="handshake" title={SPORTS_HUB_LABELS.agent} subtitle={view.agent ? view.agent.name : SPORTS_HUB_LABELS.noAgent} value={view.agent ? `${Math.round(view.agent.cut * 100)}%` : undefined} testId="sports-agent-row" />
                  </RowList>
                  {view.injury && (
                    <p className="text-sm" data-testid="injury-line">
                      {INJURY_SEVERITY_WORDS[view.injury.severityBand]} {view.injury.name}
                      {view.injury.treated ? ', treated' : ', not yet treated'}.{view.injury.pain ? ' You are playing through it.' : ''}
                    </p>
                  )}
                  {minorAge && (
                    <div className="rounded-2xl border border-border bg-surface px-3 py-2" data-testid="youth-note">
                      <p className="text-sm text-muted">{SPORTS_HUB_LABELS.youthNote}</p>
                      <Button variant="ghost" className="mt-1" disabled={disabled} onClick={() => void act('quit_sport')} data-testid="quit-sport">
                        {SPORTS_HUB_LABELS.youthQuit}
                      </Button>
                    </div>
                  )}
                  <CollapsibleGroup id="sports.team" title="Position and team" defaultOpen={false} testId="grp-team">
              <Section title="Your ladder">
                <Ladder path={view.path} />
              </Section>
              <Section title="Your team" testId="team">
                {view.team ? (
                  <p className="mt-1" data-testid="team-line">
                    {view.team.name} · {SPORT_LEVEL_LABELS[view.team.level].toLowerCase()}
                    {view.team.place ? ` · ${view.team.place}` : view.team.city ? ` · ${view.team.city}` : ''} · {TEAM_QUALITY_WORDS[view.team.qualityBand]!.toLowerCase()}
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
                <TeamStanding view={view} disabled={disabled} act={act} />
              </Section>
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.join" title={minorAge ? SPORTS_HUB_LABELS.youthSwitch : 'Try out for a team'} defaultOpen={false} testId="grp-join">
              <Section title="Try out for a team" testId="teams">
                <p className="mt-1 text-sm text-muted">Pick a team and play the scrimmage. Each team has its own bar, and a cut is not the end: the next team down may take you.</p>
                <TeamsList teams={view.teams} pathId={view.sport.id} disabled={disabled} act={act} label="Teams" />
                {view.tried.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Your tryouts" data-testid="tryout-history">
                    {view.tried.slice(0, 3).map((t, i) => (
                      <li key={`${t.year}-${i}`} className="break-words">
                        {t.year}: {t.made ? `made ${t.name}` : t.landedName ? `cut from ${t.name}, took a place with ${t.landedName}` : `cut from ${t.name}`}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.training" title={SPORTS_HUB_LABELS.practice} defaultOpen={false} testId="grp-training">
              <TrainingSection view={view} disabled={disabled} act={act} />
              <ScholarshipSection view={view} disabled={disabled} act={act} />
              <DraftSection view={view} />
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
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.deal" title="Contract and agent" defaultOpen={false} testId="grp-deal">
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
                    {view.ask === 'trade' ? (view.soccer ? 'Your agent is shopping you around for the next window.' : 'Your agent is working on a trade.') : view.ask === 'loan' ? 'You have asked your club for a loan.' : 'Your agent is pushing for a new deal.'}
                  </p>
                )}
                {view.contract && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Button variant="secondary" disabled={disabled || !view.canAskTrade} onClick={() => void act('ask_trade')} data-testid="ask-trade">
                      {view.soccer ? 'Ask your agent to find you a new club' : 'Ask your agent for a trade'}
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
                                <WorldSection view={view} disabled={disabled} act={act} />
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.commit" title="How much you give it" defaultOpen={false} testId="grp-commit">
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
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.enhancers" title={SPORTS_HUB_LABELS.enhancers} defaultOpen={false} testId="grp-enhancers">
                    <Section title={SPORTS_HUB_LABELS.enhancers} testId="enhancers">
                      <p className="mt-1 text-sm text-muted">{SPORTS_HUB_LABELS.enhancersWarn}</p>
                      <p className="mt-1 text-sm" data-testid="enhancers-status">
                        {enhancers.on ? SPORTS_HUB_LABELS.enhancersOn : SPORTS_HUB_LABELS.enhancersOff} · {SPORTS_HUB_LABELS.enhancersRecord(enhancers.tests, enhancers.positives)}
                      </p>
                      {enhancers.on ? (
                        <Button variant="secondary" className="mt-2" disabled={disabled || enhancers.stopBlock !== null} onClick={() => void act('stop_enhancers')} data-testid="enhancers-stop">
                          {SPORTS_HUB_LABELS.enhancersStop}
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" className="mt-2" disabled={disabled || enhancers.startBlock !== null} onClick={() => setEnhance(true)} data-testid="enhancers-start">
                            {SPORTS_HUB_LABELS.enhancersStart}
                          </Button>
                          {enhancers.startBlock && <p className="mt-1 text-sm text-muted">{SPORTS_HUB_LABELS.enhancersBlock[enhancers.startBlock]}</p>}
                        </>
                      )}
                    </Section>
                  </CollapsibleGroup>
                  <CollapsibleGroup id="sports.exit" title={SPORTS_HUB_LABELS.retire} defaultOpen={false} testId="grp-exit">
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
                  </CollapsibleGroup>
                </div>
              )}

              {tab === 'season' && (
                <div className="flex flex-col gap-2" data-testid="sports-season">
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
                  <Section title={SPORTS_HUB_LABELS.bigMoments} testId="big-moments">
                    <p className="mt-1 text-sm text-muted">{SPORTS_HUB_LABELS.bigMomentsNote}</p>
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
                    <StatBar label="Burnout" value={view.burnout} kind="bad" />
                    <p className="text-sm" data-testid="screen-burnout">
                      {BURNOUT_WORDS[view.burnoutBand]}
                    </p>
                  </div>
                </div>
              </Section>
              {view.injury && (
                <Section title="Your body" testId="injury">
                  <p className="mt-1" data-testid="injury-line">
                    {INJURY_SEVERITY_WORDS[view.injury.severityBand]} {view.injury.name}
                    {view.injury.treated ? ', treated' : ', not yet treated'}.{view.injury.pain ? ' You are playing through it.' : ''}
                  </p>
                </Section>
              )}
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
                </div>
              )}

              {tab === 'league' && (
                <div className="flex flex-col gap-2" data-testid="sports-league">
                  <LeagueTable view={view} />
              <LeaguesSection view={view} />
                </div>
              )}

              {tab === 'history' && (
                <div className="flex flex-col gap-2" data-testid="sports-history">
                  <HistoryRows seasons={view.history} />
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
                </div>
              )}
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
                  <TeamsList teams={e.teams} pathId={e.pathId} disabled={disabled} act={act} label={`${e.name} teams`} />
                </Card>
              ))}
            </Section>
          )}
          {!view.active && !view.retired && <LeaguesSection view={view} />}
        </div>
      </Sheet>
      <ConfirmSheet
        open={enhance}
        title={SPORTS_HUB_LABELS.enhancers}
        body={SPORTS_HUB_LABELS.enhancersWarn}
        confirmLabel={SPORTS_HUB_LABELS.enhancersStart}
        busy={busy}
        onCancel={() => setEnhance(false)}
        onConfirm={() => {
          setEnhance(false);
          void act('start_enhancers');
        }}
      />
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
