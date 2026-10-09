/**
 * The event sandbox's sports state (E6c): gives a previewed life the sport,
 * level, team, deal, season, playoff run, injury, draft or retirement an event's
 * requirements ask for. Not used by the game itself.
 */
import type { Condition, ContentBundle, EventDef, SportsCondition } from '../../content/schemas';
import { emptyFame, rungDef } from '../fame/query';
import { bound } from '../fame/sample';
import type { Id, LifeState, SportsSeason } from '../types';
import { addCondition } from '../health';
import { bestPosition, emptySports, levelOfRung, sportPath } from './query';
import { amateurTeam, draftingTeam, proTeam } from './team';

function wanted(condition: Condition | undefined): SportsCondition {
  const out: SportsCondition = {};
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('sports' in c) Object.assign(out, c.sports);
  };
  walk(condition);
  return out;
}

const SPORTS_WORDS = /\{(sport|team|league|position|stage|trophy|pick|draftRound|draftTeam|record|statLine|opponent|injury|salary|season)\}/;

export function giveSampleSports(state: LifeState, def: EventDef, _cast: Record<string, Id>, content: ContentBundle): void {
  const want = wanted(def.requires);
  const text = JSON.stringify(def);
  const usesFame = JSON.stringify(def.requires ?? {}).includes('"sport":true');
  const uses = def.category.startsWith('sports') || SPORTS_WORDS.test(text) || Object.keys(want).length > 0 || usesFame;
  if (!uses || def.category === 'sportsentry' || want.active === false) return;
  const sportId = want.sport?.[0] ?? 'basketball';
  const path = sportPath(content, sportId);
  if (!path) return;
  const year = state.currentYear;
  const age = state.character.age;
  const adult = age >= content.balance.relationships.adultAge;
  const level = want.level?.[0] ?? (want.amateur === true || !adult ? (age >= 18 ? 'college' : age >= 13 ? 'school' : 'youth') : 'pro');
  const rung = level === 'pro' ? path.sport.proRung : level === 'college' ? 3 : level === 'school' ? 2 : 1;
  const final = Math.min(path.rungs.length, level === 'pro' ? Math.max(rung, path.sport.proRung) : rung);
  const old = state.fame;
  const f: LifeState['fame'] = { ...emptyFame(), ...old, active: true, main: sportId, second: null, paths: {} };
  state.fame = f;
  f.paths[sportId] = { rung: final, peak: final, fame: Math.min(99, rungDef(path, final).fame + 3), craft: 45, since: year - 4, last: year - 1, recent: [rungDef(path, final).quality + 5], breakYear: 0 };
  f.plan = null;
  const s = (state.sports = emptySports());
  s.sport = sportId;
  s.position = bestPosition(state, path.sport).id;
  s.pro = levelOfRung(path.sport, final) === 'pro';
  s.team = s.pro ? proTeam(draftingTeam(path.sport, 3, content)) : amateurTeam(state, path.sport, levelOfRung(path.sport, final) as 'youth' | 'school' | 'college', 50, content, state.rng);
  if (s.pro) state.character.cityId = s.team.city;
  if (s.pro && want.freeAgent !== true) {
    s.contract = { teamId: s.team.id!, since: year - 1, until: want.contractYear === true ? year : year + 2, salary: rungDef(path, final).income, kind: 'standard', option: 'none' };
  } else if (s.pro) {
    s.team = null;
  }
  s.totals.seasons = 4;
  s.totals.proSeasons = s.pro ? 3 : 0;
  s.totals.titles = bound(want.titles) ?? 0;
  s.totals.allStars = bound(want.allStars) ?? 0;
  // A season this year, if the text or the requirements ask for one.
  const season: SportsSeason | null =
    want.result !== undefined || want.rating !== undefined || want.run === true || /\{(record|statLine|season)\}/.test(text) || JSON.stringify(def.requires ?? {}).includes('"released":true')
      ? {
          year,
          sport: sportId,
          level: levelOfRung(path.sport, final),
          team: s.team?.name ?? 'the team',
          position: s.position,
          rating: bound(want.rating) ?? 62,
          played: 100,
          wins: 49,
          draws: 0,
          losses: 33,
          rank: 3,
          of: 12,
          result: want.result?.[0] ?? (want.run === true ? 'out' : 'out'),
          stats: Object.fromEntries((path.sport.positions.find((p) => p.id === s.position) ?? path.sport.positions[0]!).stats.map((x) => [x.id, Math.round((x.low + x.high) / 2)])),
          salary: s.contract?.salary ?? 0,
          allStar: false,
        }
      : null;
  if (season) {
    s.seasons.push(season);
    f.projects.push({ year, path: sportId, kind: path.kinds[0]!.id, title: 'The season', style: 'commercial', risk: 'safe', tour: false, press: false, quality: season.rating, critics: 60, fans: 60, band: 'hit', gain: 4, earned: season.salary });
  }
  if (want.run === true) {
    const round = bound(want.round) ?? 1;
    s.run = { year, won: Math.max(0, round - 1), alive: true, strength: 62, rival: 55 };
  }
  if (want.injured === true || /\{injury\}/.test(text)) {
    const injury = path.sport.injuries[0]!;
    addCondition(state, injury.id, 50, content);
  }
  if (want.pain === true) s.pain = true;
  if (want.drafted === true || want.undrafted === true || want.offered === true || /\{(pick|draftRound|draftTeam)\}/.test(text)) {
    const pick = bound(want.pick) ?? (want.undrafted === true ? 0 : 5);
    s.draft = { year, pick, round: pick === 0 ? 0 : Math.ceil(pick / path.sport.leagues.pro.teams.length), teamId: draftingTeam(path.sport, Math.max(1, pick), content).id };
  }
  if (want.traded === true) s.traded = year;
  if (want.released === true) s.released = year;
  if (want.agedOut === true) s.agedOut = year;
  if (want.suspended === true) s.suspended = year;
  if (want.retired === true) {
    f.active = false;
    f.retired = year - 1;
    s.retired = { year, route: null };
    s.team = null;
    s.contract = null;
  }
}
