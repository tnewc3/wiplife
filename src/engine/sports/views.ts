/**
 * What the Sports screen shows (E6c): the sport's ladder with your rung and
 * the next milestone, your team, position and how well you fit it, your deal,
 * the latest season report (record, standing, key numbers, what the press and
 * the fans made of it), injuries, the draft, awards and totals, the shared
 * fame bars (fame, image, fan mood, commitment, agent) and the ways in before
 * a career and out after one. Read-only; the words are in src/ui/labels.ts.
 */
import { prospectRating } from './rating';
import type { ContentBundle, FameBand, SportLevel, SportRetireRoute, SportRole, TeamTier, Tier, TrainingMode } from '../../content/schemas';
import { SPORT_RETIRE_ROUTES, TRAINING_MODES } from '../../content/schemas';
import { countryIdOfCity, countryOf } from '../country';
import { schoolName } from '../education';
import { grindView, practiceBudget, skillLevel, skillsOf, skillCap } from '../fame/grind';
import { commitmentCeiling, commitmentFloor } from '../fame/effects';
import { enterBlock, openAgents, type AgentBlock, type EnterBlock } from '../fame/ladder';
import { bandOf, fanAlive, isMinorStar, moodBand } from '../fame/query';
import { pathView, type FamePathView } from '../fame/views';
import { isIncarcerated } from '../legal';
import { renderText } from '../text';
import type { Id, LifeState, SportsSeason } from '../types';
import { draftProjection } from './contract';
import { allSports, contractYearsLeft, fitFor, injuryNow, levelNow, mySport, positionOf, sportPath, sportWords } from './query';
import { divisionOf, hasDivisions, marketTeams, rivalOf, teamById } from './league';
import { transferBlock } from './soccer';
import { liveOffers } from './scholarship';
import { hasTeam, trainBlock, trainCost, trainGain, trainingView, type TrainBlock } from './training';
import { teamOptions, tryoutOdds, type TryoutBlock } from './tryout';
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

/** Batch 5: a team you could try out for. */
export interface TeamOptionView {
  key: string;
  level: SportLevel;
  tier: TeamTier | null;
  /** "Varsity", "Elite program"; "Pro camp" for a pro team. */
  tierLabel: string;
  blurb: string;
  name: string;
  city: string;
  qualityBand: number;
  /** How hard to make: the team's bar (rating) and your chance playing it steady, in percent. */
  bar: number;
  odds: number;
  oddsBand: number;
  fee: number;
  club: boolean;
  /** Batch 6: a trial at an academy in a country the game does not model (a UK child commutes). */
  abroad: boolean;
  block: TryoutBlock | null;
}

export interface TrainingSkillView {
  id: string;
  label: string;
  blurb: string;
  /** Where the skill stands (0–100) and the most you can reach without more talent. */
  level: number;
  levelBand: number;
  cap: number;
  /** What one more session adds in each place. */
  gains: Record<TrainingMode, number>;
  blocks: Record<TrainingMode, TrainBlock | null>;
}

export interface TrainingView {
  available: boolean;
  /** Sessions used and the year's budget (more with a stronger commitment). */
  used: number;
  budget: number;
  left: number;
  hasTeam: boolean;
  member: boolean;
  spent: number;
  modes: { id: TrainingMode; cost: number; available: boolean }[];
  skills: TrainingSkillView[];
}

export interface OfferView {
  tier: Tier;
  school: string;
  share: number;
  year: number;
  block: string | null;
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
  team: { name: string; level: SportLevel; qualityBand: number; quality: number; city: string; place: string | null; away: 'city' | 'country' | null; division: 1 | 2 | null; divisionName: string | null; country: string | null } | null;
  position: { id: Id; label: string; blurb: string; fit: number; fitBand: number } | null;
  positions: { id: Id; label: string; blurb: string; fit: number; fitBand: number; current: boolean; allowed: boolean }[];
  focus: 'skills' | 'conditioning' | 'film';
  contract: { team: string; salary: number; until: number; yearsLeft: number; kind: string; option: string; release: number | null } | null;
  freeAgent: boolean;
  playOut: boolean;
  ask: 'trade' | 'contract' | 'loan' | null;
  canAskTrade: boolean;
  canAskContract: boolean;
  draft: { pick: number; round: number; team: string | null } | null;
  injury: { name: string; severityBand: number; treated: boolean; pain: boolean } | null;
  latest: SportsSeasonView | null;
  seasons: SportsSeasonView[];
  /** C2: your Greatness (this season's rating, or what a coach would say today), and every season you have played, newest first. */
  greatness: number;
  history: SportsSeasonView[];
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
  entry: { pathId: Id; name: string; blurb: string; routes: { id: Id; label: string; blurb: string; minAge: number; block: EnterBlock | null }[]; teams: TeamOptionView[] }[];
  exits: { route: SportRetireRoute; block: string | null }[];
  /** Batch 5. */
  teams: TeamOptionView[];
  tried: { year: number; name: string; landedName: string | null; made: boolean; level: SportLevel }[];
  training: TrainingView;
  club: { name: string; tierLabel: string } | null;
  role: SportRole | null;
  number: number | null;
  captain: boolean;
  teamless: boolean;
  /** Athletic scholarships: the country's rules in words, the offers on the table and the one you hold. */
  aid: { available: boolean; word: string; maxShare: number; system: 'college' | 'university' };
  offers: OfferView[];
  scholarship: { school: string; tier: Tier; share: number; warned: boolean; gpa: number | null; floor: number } | null;
  /** The draft card: where scouts project you, in words (null before a prospect's age), and whether the draft passed you by. */
  prospect: { likely: string; best: string; worst: string; line: string; passed: boolean; combine: number } | null;
  /** A camp, an open tryout or a call for a player with no team: open now. */
  camps: boolean;
  /** Batch 6: the teams you could play for in each sport you are looking at (your sport, or every sport before a career), by name. */
  leagues: { sportId: Id; sport: string; league: string; teams: { id: string; name: string; place: string; division: 1 | 2 | null; yours: boolean; quality: number }[]; more: number }[];
  /** Batch 6: the academy you belong to, a loan (on, or offered), the transfer window, the national side, your club's rival, and what you may ask. */
  soccer: boolean;
  academy: { club: string; abroad: boolean; place: string | null } | null;
  loan: { host: string; parent: string; until: number } | null;
  loanOffer: { host: string; parent: string } | null;
  canAskLoan: boolean;
  transfer: { id: string; club: string; place: string; country: string | null; fee: number; wage: number; years: number; clause: number; abroad: boolean; canPush: boolean; block: string | null }[];
  international: { side: string; tournament: string; caps: number; calledUp: boolean; tournaments: number; titles: number } | null;
  rival: string | null;
  worldTotals: { loans: number; transfers: number; fees: number; graduates: number; abroad: number; caps: number; goneUp: number; goneDown: number };
  /** Batch 6: a change to the teams of this life waits for next season. */
  teamsPending: boolean;
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

function teamViews(state: LifeState, def: NonNullable<ReturnType<typeof mySport>>, content: ContentBundle): TeamOptionView[] {
  const tierText = content.text.sports.tiers;
  return teamOptions(state, def, content).map((o) => {
    const odds = tryoutOdds(state, def, o, content);
    return {
      key: o.key,
      level: o.level,
      tier: o.tier,
      tierLabel: o.tier ? tierText[o.tier].label : content.text.sports.camp.label,
      blurb: o.tier ? tierText[o.tier].blurb : content.text.sports.camp.blurb,
      name: o.name,
      city: content.cities[o.city]?.name ?? '',
      qualityBand: bandOf(o.quality, [35, 50, 65]),
      bar: o.bar,
      odds: Math.round(odds * 100),
      oddsBand: bandOf(odds * 100, [20, 45, 70, 90]),
      fee: o.fee,
      club: o.club,
      abroad: o.abroad === true,
      block: o.block,
    };
  });
}

/** The teams a player could play for in a sport: at home and in the sport's market, the league's name, and a limit on how many are listed. */
const LEAGUE_LIST = 60;
function leagueView(state: LifeState, d: NonNullable<ReturnType<typeof mySport>>, content: ContentBundle): SportsView['leagues'][number] {
  const home = state.character.cityId;
  const all = marketTeams(state, d.id, home, content)
    .map((t) => ({ id: t.id, name: t.name, place: t.cityName ?? content.cities[t.city]?.name ?? '', division: (hasDivisions(d.sport) ? divisionOf(state, t) : null) as 1 | 2 | null, yours: state.sports.team?.id === t.id, quality: Math.round(t.quality) }))
    .sort((a, b) => (a.division ?? 0) - (b.division ?? 0) || (a.name < b.name ? -1 : 1));
  const first = all.slice(0, LEAGUE_LIST);
  // The team you play for is always on the list.
  const mine = all.find((t) => t.yours);
  if (mine && !first.includes(mine)) first.push(mine);
  return { sportId: d.id, sport: sportWords(state, d, content).name, league: d.sport.leagues.pro.name, teams: first, more: Math.max(0, all.length - first.length) };
}

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
  const tierText = content.text.sports.tiers;
  const teams: TeamOptionView[] = def ? teamViews(state, def, content) : [];
  const training = trainingSection(state, content, between);
  const sch = s.scholarship;
  const rules = countryOf(state, content).athletics;
  const prospectProjection = def ? draftProjection(state, def, content) : null;
  const view: SportsView = {
    show: playing || s.retired !== undefined || age >= minAge,
    active: playing,
    retired: s.retired ?? null,
    between,
    minor,
    sport: def ? { id: def.id, name: sportWords(state, def, content).name, noun: sportWords(state, def, content).noun, blurb: def.blurb, league: def.sport.leagues.pro.name, title: def.sport.title } : null,
    path,
    level: levelNow(state, content),
    team: s.team
      ? {
          name: s.team.name,
          level: s.team.level,
          qualityBand: bandOf(teamQuality, [35, 50, 65]),
          quality: Math.round(teamQuality),
          city: content.cities[s.team.city]?.name ?? '',
          place: s.team.place ?? null,
          away: s.team.away ?? null,
          division: s.team.division ?? null,
          divisionName: def && s.team.division !== undefined ? (def.sport.leagues.pro.tiers?.[s.team.division - 1] ?? null) : null,
          country: s.team.country !== undefined ? content.text.sports.countries[s.team.country] : null,
        }
      : null,
    position: here && def ? { id: here.id, label: here.label, blurb: here.blurb, fit: here.fit, fitBand: here.fitBand } : null,
    positions,
    focus: s.focus,
    contract:
      s.contract && def
        ? { team: teamById(state, def.id, s.contract.teamId, content)?.name ?? '', salary: s.contract.salary, until: s.contract.until, yearsLeft: contractYearsLeft(state), kind: s.contract.kind, option: s.contract.option, release: s.contract.release ?? null }
        : null,
    freeAgent: playing && s.pro && s.contract === null,
    playOut: s.playOut,
    ask: s.ask,
    canAskTrade: between && sentinel && f.agent !== null && s.ask === null,
    canAskContract: between && sentinel && f.agent !== null && s.ask === null,
    draft:
      s.draft && def
        ? { pick: s.draft.pick, round: s.draft.round, team: teamById(state, def.id, s.draft.teamId, content)?.name ?? null }
        : null,
    injury: worst && condition ? { name: content.conditions[worst.conditionId]?.noun ?? '', severityBand: bandOf(worst.severity, [25, 50, 75]), treated: condition.treated, pain: s.pain } : null,
    latest: latest ? seasonView(state, latest, content) : null,
    seasons: [...s.seasons].reverse().slice(0, 8).map((x) => seasonView(state, x, content)),
    greatness: latest ? latest.rating : def ? Math.round(prospectRating(state, def, content)) : 0,
    history: [...s.seasons].reverse().slice(0, 40).map((x) => seasonView(state, x, content)),
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
          name: sportWords(state, d, content).name,
          blurb: d.blurb,
          routes: d.routes.map((r) => ({ id: r.id, label: r.label, blurb: r.blurb, minAge: Math.max(r.minAge, d.minAge), block: enterBlock(state, d.id, r.id, content) })),
          teams: teamViews(state, d, content),
        })),
    exits: playing ? SPORT_RETIRE_ROUTES.map((route) => ({ route, block: routeBlock(state, route, content) })) : [],
    teams,
    tried: [...s.tried].reverse().map((t) => ({ year: t.year, name: t.name, landedName: t.landedName, made: t.made, level: t.level })),
    training,
    club: s.club ? { name: s.club.name, tierLabel: s.club.tier ? tierText[s.club.tier].label : '' } : null,
    role: playing ? s.role : null,
    number: s.number,
    captain: s.captain,
    teamless: playing && (s.teamless || (s.pro && s.contract === null)),
    aid: { available: rules.scholarships.available, word: rules.scholarships.word, maxShare: rules.scholarships.maxShare, system: rules.system },
    offers: liveOffers(state).map((o) => ({ tier: o.tier, school: schoolName(state, { program: 'college', tier: o.tier }, content), share: o.share, year: o.year, block: between ? null : 'between' })),
    scholarship: sch ? { school: schoolName(state, { program: 'college', tier: sch.tier }, content), tier: sch.tier, share: sch.share, warned: sch.warned > 0, gpa: state.education.current?.program === 'college' ? state.education.current.gpa : null, floor: content.balance.sports.scholarship.floor } : null,
    prospect:
      prospectProjection && playing
        ? {
            likely: content.text.sports.projection[prospectProjection.likely]?.label ?? '',
            best: content.text.sports.projection[prospectProjection.best]?.label ?? '',
            worst: content.text.sports.projection[prospectProjection.worst]?.label ?? '',
            line: content.text.sports.projection[prospectProjection.likely]?.line ?? '',
            passed: s.passed > 0,
            combine: s.combine,
          }
        : null,
    camps: teams.some((t) => t.level === 'pro'),
    leagues: (def ? [def] : sports).map((d) => leagueView(state, d, content)),
    ...worldView(state, def, playing, between, content),
  };
  return view;
}

function trainingSection(state: LifeState, content: ContentBundle, between: boolean): TrainingView {
  const def = mySport(state, content);
  const playing = state.fame.active && def !== undefined && state.fame.main === def.id;
  const t = trainingView(state);
  const empty: TrainingView = { available: false, used: 0, budget: 0, left: 0, hasTeam: false, member: t.member, spent: t.spent, modes: [], skills: [] };
  if (!playing || !def) return empty;
  const budget = practiceBudget(state, content);
  const used = grindView(state).practice;
  const path = state.fame.paths[def.id];
  const modeRow = (id: TrainingMode) => {
    const cost = trainCost(state, id, content);
    const block = skillsOf(def).map((s) => trainBlock(state, s.id, id, content));
    return { id, cost, available: between && block.some((b) => b === null) };
  };
  return {
    available: between,
    used,
    budget,
    left: Math.max(0, budget - used),
    hasTeam: hasTeam(state),
    member: t.member,
    spent: t.spent,
    modes: TRAINING_MODES.map(modeRow),
    skills: skillsOf(def).map((sk) => {
      const level = skillLevel(path, sk.id, content);
      const gains = Object.fromEntries(TRAINING_MODES.map((m) => [m, Math.round(trainGain(state, sk.id, m, content) * 10) / 10])) as Record<TrainingMode, number>;
      const blocks = Object.fromEntries(TRAINING_MODES.map((m) => [m, between ? trainBlock(state, sk.id, m, content) : ('budget' as TrainBlock)])) as Record<TrainingMode, TrainBlock | null>;
      return { id: sk.id, label: sk.label, blurb: sk.blurb, level: Math.round(level), levelBand: bandOf(level, [25, 45, 65, 85]), cap: skillCap(state, def, content), gains, blocks };
    }),
  };
}

/** Batch 6: soccer's academy, loan and transfer window, the national side and the rival. */
function worldView(state: LifeState, def: ReturnType<typeof mySport>, playing: boolean, between: boolean, content: ContentBundle): Pick<SportsView, 'soccer' | 'academy' | 'loan' | 'loanOffer' | 'canAskLoan' | 'transfer' | 'international' | 'rival' | 'worldTotals' | 'teamsPending'> {
  const s = state.sports;
  const name = (id: string | null | undefined): string => (def && id ? (teamById(state, def.id, id, content)?.name ?? '') : '');
  const soccer = def !== undefined && hasDivisions(def.sport);
  const home = countryIdOfCity(state.character.cityId, content);
  const mine = def && s.team?.id ? teamById(state, def.id, s.team.id, content) : undefined;
  const rival = def && mine ? rivalOf(state, def.id, mine, content) : undefined;
  return {
    soccer,
    academy: s.academy && def ? { club: name(s.academy.clubId), abroad: s.academy.abroad, place: teamById(state, def.id, s.academy.clubId, content)?.cityName ?? null } : null,
    loan: s.loan ? { host: name(s.loan.hostId), parent: name(s.loan.parentId), until: s.loan.until } : null,
    loanOffer: s.loanOffer && s.contract ? { host: name(s.loanOffer.hostId), parent: name(s.contract.teamId) } : null,
    canAskLoan: playing && between && soccer && s.pro && s.contract !== null && s.loan === null && s.loanOffer === null && s.ask === null,
    transfer: (s.transfer?.offers ?? []).map((o) => {
      const club = def ? teamById(state, def.id, o.clubId, content) : undefined;
      return {
        id: o.id,
        club: club?.name ?? '',
        place: club ? (club.cityName ?? content.cities[club.city]?.name ?? '') : '',
        country: club ? (club.country !== undefined ? content.text.sports.countries[club.country] : (content.countries[countryIdOfCity(club.city, content)]?.name ?? null)) : null,
        fee: o.fee,
        wage: o.wage,
        years: o.years,
        clause: o.clause,
        abroad: club ? countryIdOfCity(club.city, content) !== home : false,
        canPush: state.fame.agent !== null,
        block: between && playing ? transferBlock(state, o.id, content) : 'between',
      };
    }),
    international: def ? { side: def.sport.international.side, tournament: def.sport.international.tournament, caps: s.totals.caps, calledUp: s.calledUp === state.currentYear, tournaments: s.totals.tournaments, titles: s.totals.tournamentTitles } : null,
    rival: rival?.name ?? null,
    worldTotals: { loans: s.totals.loans, transfers: s.totals.transfers, fees: s.totals.fees, graduates: s.totals.graduates, abroad: s.totals.abroad, caps: s.totals.caps, goneUp: s.totals.goneUp, goneDown: s.totals.goneDown },
    teamsPending: state.league.pending !== null,
  };
}
