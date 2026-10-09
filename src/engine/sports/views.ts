/**
 * What the Sports screen shows (E6c): the sport's ladder with your rung and
 * the next milestone, your team, position and how well you fit it, your deal,
 * the latest season report (record, standing, key numbers, what the press and
 * the fans made of it), injuries, the draft, awards and totals, the shared
 * fame bars (fame, image, fan mood, commitment, agent) and the ways in before
 * a career and out after one. Read-only; the words are in src/ui/labels.ts.
 */
import type { ContentBundle, FameBand, SportLevel, SportRetireRoute } from '../../content/schemas';
import { SPORT_RETIRE_ROUTES } from '../../content/schemas';
import { commitmentCeiling, commitmentFloor } from '../fame/effects';
import { enterBlock, openAgents, type AgentBlock, type EnterBlock } from '../fame/ladder';
import { bandOf, fanAlive, isMinorStar, moodBand } from '../fame/query';
import { pathView, type FamePathView } from '../fame/views';
import { isIncarcerated } from '../legal';
import { renderText } from '../text';
import type { Id, LifeState, SportsSeason } from '../types';
import { allSports, contractYearsLeft, fitFor, injuryNow, levelNow, mySport, positionOf, sportPath } from './query';
import { routeBlock } from './retire';
import { recordText, statLine } from './text';

export interface SportsSeasonView {
  year: number;
  team: string;
  level: SportLevel;
  position: string;
  rating: number;
  ratingBand: number;
  played: number;
  record: string;
  rank: number;
  of: number;
  result: SportsSeason['result'];
  stats: { label: string; value: string }[];
  statLine: string;
  salary: number;
  allStar: boolean;
  injury: string | null;
  band: FameBand | null;
  press: string | null;
  fans: string | null;
  fameGain: number | null;
}

export interface SportsView {
  /** Show the card: a career, a finished one, or an age at which one can begin. */
  show: boolean;
  active: boolean;
  retired: { year: number; route: SportRetireRoute | null } | null;
  between: boolean;
  minor: boolean;
  sport: { id: Id; name: string; noun: string; blurb: string; league: string; title: string } | null;
  path: FamePathView | null;
  level: SportLevel | null;
  team: { name: string; level: SportLevel; qualityBand: number; city: string } | null;
  position: { id: Id; label: string; blurb: string; fit: number; fitBand: number } | null;
  positions: { id: Id; label: string; blurb: string; fit: number; fitBand: number; current: boolean; allowed: boolean }[];
  focus: 'skills' | 'conditioning' | 'film';
  contract: { team: string; salary: number; until: number; yearsLeft: number; kind: string; option: string } | null;
  freeAgent: boolean;
  playOut: boolean;
  ask: 'trade' | 'contract' | null;
  canAskTrade: boolean;
  canAskContract: boolean;
  draft: { pick: number; round: number; team: string | null } | null;
  injury: { name: string; severityBand: number; treated: boolean; pain: boolean } | null;
  latest: SportsSeasonView | null;
  seasons: SportsSeasonView[];
  run: { won: number; stage: string } | null;
  awards: { name: string; category: string; year: number; won: boolean }[];
  nominated: { name: string; category: string; due: number } | null;
  totals: { seasons: number; proSeasons: number; playoffs: number; titles: number; allStars: number; injuries: number; trades: number; releases: number; earned: number };
  /** Shared with the Fame screen: fame, image, fan mood, burnout, commitment, agent, endorsement deal, people and headlines. */
  fame: number;
  fameBand: number;
  image: number;
  imageBand: number;
  mood: number;
  moodBand: 0 | 1 | 2;
  fans: number;
  burnout: number;
  burnoutBand: number;
  commitment: 'back' | 'steady' | 'all';
  commitments: { id: 'back' | 'steady' | 'all'; allowed: boolean; block: 'contract' | 'young' | null }[];
  agent: { id: Id; name: string; blurb: string; cut: number; tier: number } | null;
  openAgents: { id: Id; name: string; blurb: string; cut: number; tier: number }[];
  agentBlocks: Record<Id, AgentBlock | null>;
  endorsement: { company: string; until: number; share: number; advance: number } | null;
  people: { super: string[]; hater: string[]; critic: string[] };
  stalker: { name: string; stage: 'watching' | 'reported' | 'ordered' | 'charged' } | null;
  headlines: { year: number; text: string }[];
  income: { gross: number; agent: number } | null;
  entry: { pathId: Id; name: string; blurb: string; routes: { id: Id; label: string; blurb: string; minAge: number; block: EnterBlock | null }[] }[];
  exits: { route: SportRetireRoute; block: string | null }[];
}

function seasonView(state: LifeState, season: SportsSeason, content: ContentBundle): SportsSeasonView {
  const def = sportPath(content, season.sport);
  const position = def ? positionOf(def.sport, season.position) : undefined;
  const project = state.fame.projects.find((p) => p.year === season.year && p.path === season.sport);
  const stats = def
    ? Object.entries(season.stats).flatMap(([id, value]) => {
        const stat = def.sport.stats.find((x) => x.id === id);
        return stat ? [{ label: stat.label, value: `${stat.decimals === 0 ? Math.round(value) : value.toFixed(stat.decimals)}${stat.per ? ` ${stat.per}` : ''}` }] : [];
      })
    : [];
  const values = { team: season.team, sport: def?.noun ?? '' };
  const pickLine = (lines: readonly string[]): string => renderText(lines[(season.year + season.rating + season.wins) % lines.length]!, { values });
  return {
    year: season.year,
    team: season.team,
    level: season.level,
    position: position?.label ?? '',
    rating: season.rating,
    ratingBand: bandOf(season.rating, [35, 50, 65, 80]),
    played: season.played,
    record: recordText(season),
    rank: season.rank,
    of: season.of,
    result: season.result,
    stats,
    statLine: statLine(season, content),
    salary: season.salary,
    allStar: season.allStar,
    injury: season.injury ? (content.conditions[season.injury]?.noun ?? null) : null,
    band: project?.band ?? null,
    press: project ? pickLine(content.text.sports.press[project.band]) : null,
    fans: project ? pickLine(content.text.sports.fans[project.band]) : null,
    fameGain: project ? project.gain : null,
  };
}

const name = (state: LifeState, id: Id): string => {
  const p = state.people[id];
  return p ? `${p.name.first} ${p.name.last}` : '';
};

export function getSportsView(state: LifeState, content: ContentBundle): SportsView {
  const s = state.sports;
  const f = state.fame;
  const age = state.character.age;
  const sports = allSports(content);
  const minAge = sports.length === 0 ? 99 : Math.min(...sports.map((d) => d.minAge));
  const def = mySport(state, content);
  const playing = f.active && def !== undefined && f.main === def.id;
  const path = def && f.paths[def.id] ? pathView(state, def.id, content) : null;
  const between = state.phase === 'yearStart' && !isIncarcerated(state);
  const minor = isMinorStar(state, content);
  const ceiling = commitmentCeiling(state, content);
  const floor = commitmentFloor(state, content);
  const order = { back: 0, steady: 1, all: 2 } as const;
  const worst = def ? injuryNow(state, def.sport) : null;
  const condition = worst ? state.health.conditions.find((c) => c.conditionId === worst.conditionId) : undefined;
  const agent = f.agent ? content.fameAgents[f.agent.agentId] : undefined;
  const company = f.contract ? content.fameCompanies[f.contract.company] : undefined;
  const latest = s.seasons.at(-1);
  const mainPath = def ? f.paths[def.id] : undefined;
  const sentinel = playing && s.pro && s.contract !== null;
  const positions = def
    ? def.sport.positions.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, fit: Math.round(100 * fitFor(state, p)), fitBand: bandOf(100 * fitFor(state, p), [40, 52, 64]), current: p.id === s.position, allowed: playing && between && p.id !== s.position }))
    : [];
  const here = positions.find((p) => p.current);
  const teamQuality = s.team?.quality ?? 0;
  const year = state.currentYear;
  const view: SportsView = {
    show: playing || s.retired !== undefined || age >= minAge,
    active: playing,
    retired: s.retired ?? null,
    between,
    minor,
    sport: def ? { id: def.id, name: def.name, noun: def.noun, blurb: def.blurb, league: def.sport.leagues.pro.name, title: def.sport.title } : null,
    path,
    level: levelNow(state, content),
    team: s.team ? { name: s.team.name, level: s.team.level, qualityBand: bandOf(teamQuality, [35, 50, 65]), city: content.cities[s.team.city]?.name ?? '' } : null,
    position: here && def ? { id: here.id, label: here.label, blurb: here.blurb, fit: here.fit, fitBand: here.fitBand } : null,
    positions,
    focus: s.focus,
    contract:
      s.contract && def
        ? { team: def.sport.leagues.pro.teams.find((t) => t.id === s.contract!.teamId)?.name ?? '', salary: s.contract.salary, until: s.contract.until, yearsLeft: contractYearsLeft(state), kind: s.contract.kind, option: s.contract.option }
        : null,
    freeAgent: playing && s.pro && s.contract === null,
    playOut: s.playOut,
    ask: s.ask,
    canAskTrade: between && sentinel && f.agent !== null && s.ask === null,
    canAskContract: between && sentinel && f.agent !== null && s.ask === null,
    draft:
      s.draft && def
        ? { pick: s.draft.pick, round: s.draft.round, team: def.sport.leagues.pro.teams.find((t) => t.id === s.draft!.teamId)?.name ?? null }
        : null,
    injury: worst && condition ? { name: content.conditions[worst.conditionId]?.noun ?? '', severityBand: bandOf(worst.severity, [25, 50, 75]), treated: condition.treated, pain: s.pain } : null,
    latest: latest ? seasonView(state, latest, content) : null,
    seasons: [...s.seasons].reverse().slice(0, 8).map((x) => seasonView(state, x, content)),
    run: s.run && s.run.alive && def ? { won: s.run.won, stage: def.sport.stages[Math.min(2, s.run.won)] ?? '' } : null,
    awards: f.awards
      .filter((a) => def !== undefined && a.path === def.id)
      .reverse()
      .map((a) => ({ name: content.fameAwards[a.awardId]?.name ?? '', category: content.fameAwards[a.awardId]?.category ?? '', year: a.year, won: a.won })),
    nominated: f.nominated && def && content.fameAwards[f.nominated.awardId]?.path === def.id ? { name: content.fameAwards[f.nominated.awardId]?.name ?? '', category: content.fameAwards[f.nominated.awardId]?.category ?? '', due: f.nominated.due } : null,
    totals: {
      seasons: s.totals.seasons,
      proSeasons: s.totals.proSeasons,
      playoffs: s.totals.playoffs,
      titles: s.totals.titles,
      allStars: s.totals.allStars,
      injuries: s.totals.injuries,
      trades: s.totals.trades,
      releases: s.totals.releases,
      earned: s.totals.earned,
    },
    fame: Math.round(mainPath?.fame ?? 0),
    fameBand: bandOf(mainPath?.fame ?? 0, [10, 30, 55, 80]),
    image: f.image,
    imageBand: bandOf(f.image, [20, 40, 60, 80]),
    mood: f.mood,
    moodBand: moodBand(f.mood),
    fans: f.fans,
    burnout: f.burnout,
    burnoutBand: bandOf(f.burnout, [30, 55, 75]),
    commitment: f.commitment,
    commitments: (['back', 'steady', 'all'] as const).map((id) => ({
      id,
      allowed: f.active && between && id !== f.commitment && order[id] <= order[ceiling] && order[id] >= order[floor],
      block: order[id] > order[ceiling] ? 'young' : order[id] < order[floor] ? 'contract' : null,
    })),
    agent: agent ? { id: agent.id, name: agent.name, blurb: agent.blurb, cut: agent.cut, tier: agent.tier } : null,
    openAgents: playing ? openAgents(state, content).map((a) => ({ id: a.id, name: a.name, blurb: a.blurb, cut: a.cut, tier: a.tier })) : [],
    agentBlocks: {},
    endorsement: f.contract && company ? { company: company.name, until: f.contract.until, share: f.contract.share, advance: f.contract.advance } : null,
    people: {
      super: f.people.super.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
      hater: f.people.hater.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
      critic: f.people.critic.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
    },
    stalker: f.stalker && fanAlive(state, f.stalker.id) ? { name: name(state, f.stalker.id), stage: f.stalker.stage } : null,
    headlines: [...f.headlines].reverse().map((h) => ({ year: h.year, text: h.text })),
    income: f.income.year === year || f.income.year === year - 1 ? { gross: f.income.gross, agent: f.income.agent } : null,
    entry: f.active
      ? []
      : sports.map((d) => ({
          pathId: d.id,
          name: d.name,
          blurb: d.blurb,
          routes: d.routes.map((r) => ({ id: r.id, label: r.label, blurb: r.blurb, minAge: Math.max(r.minAge, d.minAge), block: enterBlock(state, d.id, r.id, content) })),
        })),
    exits: playing ? SPORT_RETIRE_ROUTES.map((route) => ({ route, block: routeBlock(state, route, content) })) : [],
  };
  return view;
}
