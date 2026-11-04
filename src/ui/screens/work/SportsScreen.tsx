import { Shirt } from 'lucide-react';
import { useState } from 'react';
import { content } from '../../../content';
import { SPORT_FOCUSES, SPORT_RETIRE_ROUTES, TRAINING_MODES, type SportRetireRoute, type TrainingMode } from '../../../content/schemas';
import { getEnhancerView, getSportsView, type SportsSeasonView, type SportsView, type TeamOptionView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import type { SheetAction } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { EmptyState } from '../../components/EmptyState';
import { EffectChip, FactChip } from '../../components/FactChip';
import { FeatureScreen } from '../../components/FeatureScreen';
import { FilterChips } from '../../components/FilterChips';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { CompactList, CompactRow, SectionLabel } from '../../components/SectionLabel';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Sheet } from '../../components/Sheet';
import {
  CONTRACT_KIND_LABELS,
  FAME_WORDS,
  FAN_MOOD_WORDS,
  FIT_WORDS,
  IMAGE_WORDS,
  INJURY_SEVERITY_WORDS,
  fansLabel,
  money,
  ODDS_WORDS,
  OFFER_BLOCK_LABELS,
  placeLabel,
  PLAYOFF_RESULT_LABELS,
  RATING_WORDS,
  ROLE_LABELS,
  salaryLabel,
  SKILL_WORDS,
  SPORT_EXIT_LABELS,
  SPORT_FOCUS_BLURBS,
  SPORT_FOCUS_LABELS,
  SPORT_LEVEL_LABELS,
  SPORT_RETIRED_LABELS,
  SPORTS_HUB_LABELS,
  SPORTS_TAB_LABELS,
  STALKER_STAGE_LABELS,
  TEAM_QUALITY_WORDS,
  TRAIN_BLOCK_LABELS,
  TRAINING_MODE_LABELS,
  TRYOUT_BLOCK_LABELS,
} from '../../labels';
import { renameDeep, useTeamText } from '../../useTeamNames';
import { LeaguesSection, WorldSection } from './SportsWorld';
import { DraftSection } from './SportsGrind';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

type SportsTab = 'season' | 'league' | 'history';
const TABS = (['season', 'league', 'history'] as SportsTab[]).map((id) => ({ id, label: SPORTS_TAB_LABELS[id], testId: `sports-tab-${id}` }));

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
    <div className="flex flex-col gap-2" data-testid="standings">
      <SectionLabel>{SPORTS_HUB_LABELS.standings}</SectionLabel>
      <RowList label={`${l.league} teams`}>
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
      {l.more > 0 && <p className="px-1 text-sm text-muted">…and {l.more} more.</p>}
    </div>
  );
}

/** One compact row per season (team, Greatness bar, a trophy for a championship); a tap shows that season's summary. */
function HistoryRows({ seasons }: { seasons: SportsSeasonView[] }) {
  const [open, setOpen] = useState<SportsSeasonView | null>(null);
  return (
    <div className="flex flex-col gap-2" data-testid="season-history">
      <SectionLabel>{SPORTS_HUB_LABELS.history}</SectionLabel>
      {seasons.length === 0 ? (
        <EmptyState text={SPORTS_HUB_LABELS.historyEmpty} />
      ) : (
        <RowList label={SPORTS_HUB_LABELS.history}>
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
    </div>
  );
}

type Picker = 'practice' | 'team' | 'deal' | 'offers' | 'position' | null;

/** A fact about the season as a compact row. */
function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <CompactRow label={label} value={value} {...(testId ? { testId } : {})} />;
}

/**
 * Sports (E6c, rebuilt in U3 on the feature screen template): a full screen with a hero (role and team, Greatness, standing,
 * record), tiles for Practice, Try out, your deal or offers and Recover, and the tabs Season, League and History. Switching
 * sport, asking for a trade, performance enhancers, leaving a team and retiring are in the ⋯ menu. How hard you work at it is
 * on the Schedule. The rules are behind ⓘ.
 */
export function SportsScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const teamText = useTeamText();
  const view = renameDeep(getSportsView(life, content), teamText);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const openHealth = useAppStore((s) => s.openHealth);
  const [confirm, setConfirm] = useState<SportRetireRoute | 'quit' | 'leave_team' | null>(null);
  const [tab, setTab] = useState<SportsTab>('season');
  const [enhance, setEnhance] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [mode, setMode] = useState<TrainingMode | null>(null);
  const enhancers = getEnhancerView(life, content);
  const minorAge = life.character.age < content.balance.careers.hub.youthAge && view.active;
  const disabled = busy || !view.between;
  const latest = view.latest;
  const act1 = (id: Parameters<typeof act>[0], params?: Parameters<typeof act>[1]) => {
    setPicker(null);
    void act(id, params);
  };

  const exitsOpen = SPORT_RETIRE_ROUTES.filter((route) => (view.exits.find((x) => x.route === route)?.block ?? null) === null);
  const actions: SheetAction[] = view.active
    ? [
        ...(minorAge ? [{ id: 'switch', label: SPORTS_HUB_LABELS.youthSwitch, disabled, testId: 'switch-sport', onSelect: () => setPicker('team') }, { id: 'quit', label: SPORTS_HUB_LABELS.youthQuit, danger: true, disabled, testId: 'quit-sport', onSelect: () => setConfirm('quit') }] : []),
        ...(view.contract ? [{ id: 'trade', label: view.soccer ? 'Find me a new club' : 'Request a trade', detail: view.agent ? undefined : 'You need an agent for that.', disabled: disabled || !view.canAskTrade, testId: 'ask-trade', onSelect: () => void act('ask_trade') }] : []),
        { id: 'enhancers', label: enhancers.on ? SPORTS_HUB_LABELS.enhancersStop : SPORTS_HUB_LABELS.enhancers, detail: enhancers.on ? undefined : (enhancers.startBlock ? SPORTS_HUB_LABELS.enhancersBlock[enhancers.startBlock] : SPORTS_HUB_LABELS.enhancersOff), disabled: disabled || (enhancers.on ? enhancers.stopBlock !== null : enhancers.startBlock !== null), testId: enhancers.on ? 'enhancers-stop' : 'enhancers-start', onSelect: () => (enhancers.on ? void act('stop_enhancers') : setEnhance(true)) },
        ...(view.club ? [{ id: 'club', label: 'Leave the club team', disabled, testId: 'leave-club', onSelect: () => void act('leave_club') }] : []),
        ...(view.team && view.level !== 'pro' ? [{ id: 'team', label: 'Leave your team', danger: true, disabled, testId: 'leave-team', onSelect: () => setConfirm('leave_team') }] : []),
        ...exitsOpen.map((route) => ({ id: route, label: SPORT_EXIT_LABELS[route].label, detail: SPORT_EXIT_LABELS[route].blurb, danger: true, disabled, testId: `exit-${route}`, onSelect: () => setConfirm(route) })),
      ]
    : [];

  const info = (
    <>
      <p>Words and bars show how you are doing. Greatness is how good you are for the level you play at.</p>
      {view.minor && view.active && <p>You are not in the pros until you are grown: a parent signs for you where it counts.</p>}
      {minorAge && <p>{SPORTS_HUB_LABELS.youthNote}</p>}
      <p>{SPORTS_HUB_LABELS.bigMomentsNote}</p>
      <p>Moving to another position costs a little of the craft you have built.</p>
      <p>Pick a team and play the scrimmage. Each team has its own bar, and a cut is not the end: the next team down may take you.</p>
      <p>Athletes peak young. When you are ready, there are ways out that are not a cliff.</p>
      <p>{SPORTS_HUB_LABELS.enhancersWarn}</p>
    </>
  );

  const t = view.training;
  const trainMode: TrainingMode = mode ?? (t.hasTeam ? 'team' : 'gym');
  const trainRow = t.modes.find((m) => m.id === trainMode);
  const tabs = TABS;

  const overlays = view.active && view.sport ? (
    <>
      <OptionPickerSheet open={picker === 'practice'} title={SPORTS_HUB_LABELS.practice} icon="flexed_biceps" line={`${t.left} of ${t.budget} sessions left`} onClose={() => setPicker(null)} testId="practice-picker">
        <FilterChips
          label="Where to train"
          value={trainMode}
          onChange={setMode}
          chips={TRAINING_MODES.filter((id) => id !== 'team' || t.hasTeam).map((id) => ({ id, label: TRAINING_MODE_LABELS[id], testId: `train-mode-${id}` }))}
        />
        {t.skills.map((s) => {
          const block = s.blocks[trainMode];
          return (
            <OptionCard
              key={s.id}
              name={`Train ${s.label.toLowerCase()}`}
              chips={
                <>
                  <EffectChip tone="good">+ {s.label}</EffectChip>
                  <FactChip>{SKILL_WORDS[s.levelBand]}</FactChip>
                </>
              }
              price={trainRow && trainRow.cost > 0 ? money(trainRow.cost) : 'Free'}
              reason={disabled ? 'Not now' : block ? TRAIN_BLOCK_LABELS[block] : undefined}
              testId={`train-${s.id}`}
              onClick={() => act1('train', { skillId: s.id, trainMode })}
            />
          );
        })}
        {SPORT_FOCUSES.map((id) => (
          <OptionCard
            key={id}
            name={`Focus: ${SPORT_FOCUS_LABELS[id]}`}
            chips={<FactChip>{SPORT_FOCUS_BLURBS[id]}</FactChip>}
            reason={view.focus === id ? 'Now' : disabled ? 'Not now' : undefined}
            testId={`focus-${id}`}
            onClick={() => act1('set_focus', { sportFocus: id })}
          />
        ))}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'team'} title={minorAge ? SPORTS_HUB_LABELS.youthSwitch : 'Try out for a team'} icon="flexed_biceps" line={view.tried[0] ? `${view.tried[0].year}: ${view.tried[0].made ? `made ${view.tried[0].name}` : `cut from ${view.tried[0].name}`}` : undefined} onClose={() => setPicker(null)} testId="team-picker">
        {view.teams.length === 0 && <EmptyState text="No team is holding a tryout for you right now." />}
        {view.teams.map((team) => (
          <TeamOption key={team.key} team={team} pathId={view.sport!.id} disabled={disabled} onDo={() => act1('try_out', { pathId: view.sport!.id, teamKey: team.key })} />
        ))}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'position'} title="Position" icon="flexed_biceps" onClose={() => setPicker(null)} testId="position-picker">
        {view.positions.map((p) => (
          <OptionCard key={p.id} name={p.label} chips={<FactChip>{FIT_WORDS[p.fitBand]}</FactChip>} reason={p.current ? 'Now' : !p.allowed ? 'Not open' : disabled ? 'Not now' : undefined} testId={`position-${p.id}`} onClick={() => act1('set_position', { positionId: p.id })} />
        ))}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'deal'} title={SPORTS_HUB_LABELS.contract} icon="money_bag" line={view.contract ? `${view.contract.team} · until ${view.contract.until}` : SPORTS_HUB_LABELS.noContract} onClose={() => setPicker(null)} testId="deal-picker">
        <OptionCard name={view.soccer ? 'Ask your agent to find you a new club' : 'Ask your agent for a trade'} reason={!view.contract ? 'No deal' : !view.agent ? 'Needs an agent' : !view.canAskTrade || disabled ? 'Not now' : undefined} testId="ask-trade-card" onClick={() => act1('ask_trade')} />
        <OptionCard name="Ask your agent for a new deal" reason={!view.contract ? 'No deal' : !view.agent ? 'Needs an agent' : !view.canAskContract || disabled ? 'Not now' : undefined} testId="ask-contract" onClick={() => act1('ask_contract')} />
        {view.ask && <OptionCard name="Call it off" reason={disabled ? 'Not now' : undefined} onClick={() => act1('cancel_ask')} />}
        {view.openAgents.map((a) => (
          <OptionCard key={a.id} name={a.name} chips={<FactChip>{a.blurb}</FactChip>} price={`takes ${Math.round(a.cut * 100)}%`} reason={disabled ? 'Not now' : undefined} testId={`hire-${a.id}`} onClick={() => act1('hire_agent', { agentId: a.id })} />
        ))}
        {view.agent && <OptionCard name="Part ways with your agent" reason={disabled ? 'Not now' : undefined} onClick={() => act1('drop_agent')} />}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'offers'} title="Scholarship offers" icon="graduation_cap" line={view.scholarship ? `Your ${view.aid.word} at ${view.scholarship.school}` : undefined} onClose={() => setPicker(null)} testId="offers-picker">
        {view.scholarship ? (
          <FactChip>
            {Math.round(view.scholarship.share * 100)}% of tuition{view.scholarship.warned ? ' · on warning' : ''}
          </FactChip>
        ) : (
          view.offers.map((o) => (
            <OptionCard key={o.tier} name={o.school} chips={<FactChip>A {view.aid.word}</FactChip>} price={`${Math.round(o.share * 100)}% of tuition`} reason={o.block ? (OFFER_BLOCK_LABELS[o.block as keyof typeof OFFER_BLOCK_LABELS] ?? 'Not now') : disabled ? 'Not now' : undefined} testId={`accept-${o.tier}`} onClick={() => act1('accept_scholarship', { tier: o.tier })} />
          ))
        )}
        {view.offers.length > 0 && !view.scholarship && <OptionCard name="Turn the offers down" testId="decline-offers" reason={disabled ? 'Not now' : undefined} onClick={() => act1('decline_scholarship')} />}
      </OptionPickerSheet>
    </>
  ) : null;

  const confirms = (
    <>
      <ConfirmSheet open={enhance} title={SPORTS_HUB_LABELS.enhancers} body={SPORTS_HUB_LABELS.enhancersWarn} confirmLabel={SPORTS_HUB_LABELS.enhancersStart} busy={busy} onCancel={() => setEnhance(false)} onConfirm={() => { setEnhance(false); void act('start_enhancers'); }} />
      <ConfirmSheet
        open={confirm !== null}
        title={confirm === 'quit' ? `${SPORTS_HUB_LABELS.youthQuit}?` : confirm === 'leave_team' ? 'Leave your team?' : confirm ? `${SPORT_EXIT_LABELS[confirm].label}?` : ''}
        body={confirm === 'quit' ? 'Your skills wait for you, but you are out of the sport.' : confirm === 'leave_team' ? 'You will have no team until you try out for another.' : 'Your playing days end. Your team, your deal and your agent go; fame turns into royalties that fade. This is not something you can take back.'}
        confirmLabel={confirm === 'quit' ? 'Quit' : confirm === 'leave_team' ? 'Leave' : confirm ? SPORT_EXIT_LABELS[confirm].label : 'Leave'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c === 'quit') void act('quit_sport');
          else if (c === 'leave_team') void act('leave_team');
          else if (c) void act('retire_sports', { routeKey: c });
        }}
      />
    </>
  );

  return (
    <FeatureScreen open={open} title={view.sport?.name ?? 'Sports'} onBack={onClose} info={info} actions={actions} testId="sports-screen" overlays={<>{overlays}{confirms}</>}>
      {!view.between && <p className="px-1 text-sm text-muted">Choices wait until the year is over.</p>}

      {view.active && view.path && view.sport && (
        <>
          <HeroCard
            lead={<Shirt aria-hidden="true" size={44} style={{ color: jerseyColor(view.team?.name ?? view.sport.name) }} fill="currentColor" />}
            title={view.position?.label ?? view.sport.name}
            status={view.team ? `${view.team.name}${view.team.city ? ` · ${view.team.city}` : ''}` : view.freeAgent ? 'No team. Your agent is making calls.' : 'No team this year'}
            testId="sports-role-row"
          >
            <StatCell label={SPORTS_HUB_LABELS.greatness} value={`${Math.round(view.greatness)}%`} bar={view.greatness} />
            <StatCell label="Standing" value={latest ? placeLabel(latest.rank) : '–'} sub={latest ? `of ${latest.of}` : 'No season yet'} />
            <StatCell label="Record" value={latest?.record ?? '–'} />
          </HeroCard>

          <ActionTileRow>
            <ActionTile label={SPORTS_HUB_LABELS.practice} icon="flexed_biceps" tone="sports" status={t.available ? `${t.left} of ${t.budget}` : 'Not yet'} disabled={disabled || (!t.available && t.skills.length === 0)} onClick={() => setPicker('practice')} testId="tile-practice" />
            <ActionTile label="Try out" icon="busts_in_silhouette" tone="people" status={view.teams.length > 0 ? `${view.teams.length} teams` : 'None open'} disabled={disabled} onClick={() => setPicker('team')} testId="tile-team" />
            {view.offers.length > 0 || view.scholarship ? (
              <ActionTile label="Offers" icon="graduation_cap" tone="school" status={view.scholarship ? 'Yours' : `${view.offers.length} open`} onClick={() => setPicker('offers')} testId="tile-offers" />
            ) : (
              <ActionTile label={SPORTS_HUB_LABELS.contract} icon="money_bag" tone="money" status={view.contract ? money(view.contract.salary) : 'None'} disabled={disabled} onClick={() => setPicker('deal')} testId="tile-deal" />
            )}
            {view.injury && <ActionTile label="Recover" icon="stethoscope" tone="health" status={view.injury.treated ? 'Treated' : 'Hurt'} onClick={() => openHealth()} testId="tile-recover" />}
          </ActionTileRow>

          <SegmentedTabs sticky tabs={tabs} value={tab} onChange={setTab} label="Sports" />

          {tab === 'season' && (
            <div className="flex flex-col gap-3" data-testid="sports-season">
              {(view.run || view.nominated || view.injury || view.ask) && (
                <>
                  <SectionLabel>Coming up</SectionLabel>
                  <CompactList label="Coming up">
                    {view.run && <CompactRow label={`In the playoffs: ${view.run.won} won; next is ${view.run.stage}`} testId="run-line" />}
                    {view.nominated && <CompactRow label={`Nominated for ${view.nominated.name} (${view.nominated.category})`} testId="nominated" />}
                    {view.injury && <CompactRow label={`${INJURY_SEVERITY_WORDS[view.injury.severityBand]} ${view.injury.name}${view.injury.treated ? ', treated' : ', not yet treated'}${view.injury.pain ? '. Playing through it' : ''}`} testId="injury-line" />}
                    {view.ask && <CompactRow label={view.ask === 'trade' ? (view.soccer ? 'Your agent is shopping you around' : 'Your agent is working on a trade') : view.ask === 'loan' ? 'You have asked your club for a loan' : 'Your agent is pushing for a new deal'} testId="ask-line" />}
                  </CompactList>
                </>
              )}
              <SectionLabel>This season</SectionLabel>
              {latest ? (
                <CompactList label="Latest season">
                  <Fact label={`${latest.year} · ${latest.team}`} value={`${latest.record} · ${placeLabel(latest.rank)} of ${latest.of}`} testId="season-record" />
                  <Fact label={PLAYOFF_RESULT_LABELS[latest.result]} value={`${RATING_WORDS[latest.ratingBand]} play${latest.played < 100 ? `, ${latest.played}% of games` : ''}`} testId="season-play" />
                  {latest.stats.map((x) => (
                    <Fact key={x.label} label={x.label} value={x.value} />
                  ))}
                  {latest.allStar && <CompactRow label="An all-star season" />}
                  {latest.salary > 0 && <Fact label="Paid before the cuts" value={money(latest.salary)} />}
                </CompactList>
              ) : (
                <EmptyState text={SPORTS_HUB_LABELS.seasonEmpty} />
              )}
              <SectionLabel>Your role</SectionLabel>
              <CompactList label="Your role">
                <CompactRow label={`${view.position?.label ?? 'Position'}${view.position ? ` · ${FIT_WORDS[view.position.fitBand]!.toLowerCase()}` : ''}`} value="Change" onClick={disabled ? undefined : () => setPicker('position')} testId="position-line" />
                {view.team && view.role && <CompactRow label={`${ROLE_LABELS[view.role]}${view.number !== null ? ` · number ${view.number}` : ''}${view.captain ? ' · captain' : ''}`} testId="standing-line" />}
                {view.team && <CompactRow label={`${view.team.name} · ${SPORT_LEVEL_LABELS[view.team.level].toLowerCase()} · ${TEAM_QUALITY_WORDS[view.team.qualityBand]!.toLowerCase()}`} testId="team-line" />}
                {view.club && <CompactRow label={`Alongside: ${view.club.name} (${view.club.tierLabel.toLowerCase()})`} testId="club-line" />}
              </CompactList>
              {(view.contract || view.agent || view.endorsement || view.draft) && (
                <>
                  <SectionLabel>Your deal</SectionLabel>
                  <CompactList label="Your deal">
                    {view.contract && <CompactRow label={`${view.contract.team}: ${CONTRACT_KIND_LABELS[view.contract.kind as keyof typeof CONTRACT_KIND_LABELS].toLowerCase()}, until ${view.contract.until}`} value={salaryLabel(view.contract.salary)} testId="contract-line" />}
                    {view.agent && <CompactRow label={`Agent: ${view.agent.name}`} value={`${Math.round(view.agent.cut * 100)}%`} testId="agent-line" />}
                    {view.endorsement && <CompactRow label={`${cap(view.endorsement.company)} · until ${view.endorsement.until}`} value={`${Math.round(view.endorsement.share * 100)}% theirs`} testId="endorsement-line" />}
                    {view.draft && <CompactRow label={view.draft.pick > 0 ? `You went ${view.draft.pick}${view.draft.team ? ` to ${view.draft.team}` : ''}` : view.draft.team ? `Undrafted, offer from ${view.draft.team}` : 'Undrafted'} testId="draft-line" />}
                  </CompactList>
                </>
              )}
              <DraftSection view={view} />
              {view.fame > 0 && (
                <>
                  <SectionLabel>How you stand</SectionLabel>
                  <div className="flex gap-2" data-testid="standing">
                    <StatCell label="Fame" value={FAME_WORDS[view.fameBand]!} bar={view.fame} testId="screen-fame" />
                    <StatCell label="Image" value={IMAGE_WORDS[view.imageBand]!} bar={view.image} testId="screen-image" />
                    <StatCell label="Fans" value={FAN_MOOD_WORDS[view.moodBand]!} bar={view.mood} sub={`about ${fansLabel(view.fans)}`} testId="screen-mood" />
                  </div>
                </>
              )}
              {view.headlines.length > 0 && (
                <>
                  <SectionLabel>In the papers</SectionLabel>
                  <CompactList label="Headlines">
                    {view.headlines.map((h, i) => (
                      <CompactRow key={i} label={h.text} value={String(h.year)} />
                    ))}
                  </CompactList>
                </>
              )}
              <WorldSection view={view} disabled={disabled} act={act} />
            </div>
          )}

          {tab === 'league' && (
            <div className="flex flex-col gap-3" data-testid="sports-league">
              <LeagueTable view={view} />
              <LeaguesSection view={view} />
            </div>
          )}

          {tab === 'history' && (
            <div className="flex flex-col gap-3" data-testid="sports-history">
              <HistoryRows seasons={view.history} />
              <SectionLabel>Awards and totals</SectionLabel>
              <CompactList label="Totals">
                {view.nominated && <CompactRow label={`Nominated for ${view.nominated.name}`} />}
                {view.awards.map((a, i) => (
                  <CompactRow key={i} label={`${a.won ? 'Won' : 'Nominated'}: ${a.name}, ${a.category}`} value={String(a.year)} />
                ))}
                <CompactRow label="Seasons" value={view.totals.seasons} />
                <CompactRow label="Playoff runs" value={view.totals.playoffs} />
                <CompactRow label="Titles" value={view.totals.titles} />
                <CompactRow label="All-star seasons" value={view.totals.allStars} />
                <CompactRow label="Injuries" value={view.totals.injuries} />
                <CompactRow label="Paid by teams" value={money(view.totals.earned)} />
              </CompactList>
              {view.people.super.length + view.people.hater.length + view.people.critic.length > 0 && (
                <>
                  <SectionLabel>People who came with it</SectionLabel>
                  <CompactList label="Fans and critics">
                    {view.people.super.length > 0 && <CompactRow label="Superfans" value={view.people.super.join(', ')} />}
                    {view.people.hater.length > 0 && <CompactRow label="Haters" value={view.people.hater.join(', ')} />}
                    {view.people.critic.length > 0 && <CompactRow label="Critics" value={view.people.critic.join(', ')} />}
                  </CompactList>
                </>
              )}
              {view.stalker && (
                <p className="px-1 font-semibold text-danger" data-testid="stalker">
                  {view.stalker.name}: {STALKER_STAGE_LABELS[view.stalker.stage]}.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {!view.active && view.retired && (
        <div className="flex flex-col gap-3" data-testid="after">
          <HeroCard lead={<Icon id="trophy" size={44} />} title="After the game" status={view.retired.route ? SPORT_RETIRED_LABELS[view.retired.route] : 'Your playing days are over.'}>
            <StatCell label="Seasons" value={view.totals.seasons} />
            <StatCell label="Titles" value={view.totals.titles} />
            <StatCell label="Earned" value={money(view.totals.earned)} />
          </HeroCard>
          {view.latest && (
            <CompactList label="Seasons">
              {view.seasons.slice(0, 5).map((s) => (
                <CompactRow key={`${s.year}-${s.team}`} label={`${s.year} · ${s.team}`} value={s.record} testId="season-row" />
              ))}
            </CompactList>
          )}
        </div>
      )}

      {!view.active && !view.retired && (
        <div className="flex flex-col gap-3" data-testid="entry">
          {view.entry.map((e) => (
            <div key={e.pathId} className="flex flex-col gap-2">
              <SectionLabel>{e.name}</SectionLabel>
              {e.teams.length === 0 && <EmptyState text="No team is holding a tryout for you right now." />}
              {e.teams.map((team) => (
                <TeamOption key={team.key} team={team} pathId={e.pathId} disabled={disabled} onDo={() => void act('try_out', { pathId: e.pathId, teamKey: team.key })} />
              ))}
            </div>
          ))}
          <LeaguesSection view={view} />
        </div>
      )}
    </FeatureScreen>
  );
}

/** A team you could try out for, as an option card: its level and quality, the odds, the fee. */
function TeamOption({ team, pathId, disabled, onDo }: { team: TeamOptionView; pathId: string; disabled: boolean; onDo: () => void }) {
  const camp = team.level === 'pro';
  return (
    <OptionCard
      name={team.name}
      chips={
        <>
          <FactChip>{camp ? 'Pro camp' : team.tierLabel}</FactChip>
          <FactChip>{TEAM_QUALITY_WORDS[team.qualityBand]}</FactChip>
          <EffectChip tone="good">{ODDS_WORDS[team.oddsBand]} to make it</EffectChip>
          {team.club && <FactChip>Alongside school</FactChip>}
          {team.abroad && <FactChip>Trial abroad</FactChip>}
        </>
      }
      price={team.fee > 0 ? `${money(team.fee)} a year` : camp ? 'Go to camp' : 'Try out'}
      reason={team.block ? TRYOUT_BLOCK_LABELS[team.block] : disabled ? 'Not now' : undefined}
      testId={`tryout-${pathId}-${team.key}`}
      onClick={onDo}
    />
  );
}
