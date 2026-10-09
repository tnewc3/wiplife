/**
 * Values sports events and history lines can use in their text (E6c):
 * {sport} and {position}, {team} and {league}, {stage} (the playoff series
 * about to be played, as it reads in a sentence), {trophy} (what the title is
 * called), {pick} and {draftRound}, {record} (wins and losses), {statLine}
 * (your key numbers), {opponent}, {injury} and {salary}. The content build
 * checks that an event using one requires what it names
 * (tools/content/sports.ts). Reads only: nothing here draws from the generator.
 */
import { SPORTS_TEXT_VALUES, type ContentBundle, type SportsHistoryKey } from '../../content/schemas';
import { wholeDollars } from '../finance';
import { writeFromGroup } from '../systems/history';
import type { LifeState, SportsSeason } from '../types';
import { ordinal, positionOf, sportPath, thisSeason } from './query';

export { SPORTS_TEXT_VALUES };

/** Writes one of the sports history lines. */
export function sportsHistory(state: LifeState, key: SportsHistoryKey, content: ContentBundle, extra: Record<string, string> = {}): void {
  writeFromGroup(state, content.text.sports.history[key], ['sports', key], { values: { ...sportsTextValues(state, content), ...extra } }, content);
}

function number(v: number, decimals: number): string {
  return decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals);
}

/** "21.4 points and 7.1 rebounds a game" style line, from the position's key stats. */
export function statLine(season: SportsSeason, content: ContentBundle): string {
  const def = sportPath(content, season.sport);
  if (!def) return '';
  const parts = Object.entries(season.stats).flatMap(([id, value]) => {
    const stat = def.sport.stats.find((s) => s.id === id);
    return stat ? [`${number(value, stat.decimals)} ${stat.label.toLowerCase()}${stat.per ? ` ${stat.per}` : ''}`] : [];
  });
  return parts.join(', ');
}

export function recordText(season: SportsSeason): string {
  return season.draws > 0 ? `${season.wins}-${season.draws}-${season.losses}` : `${season.wins}-${season.losses}`;
}

export function sportsTextValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const s = state.sports;
  const def = sportPath(content, s.sport);
  const season = thisSeason(state) ?? s.seasons.at(-1);
  const run = s.run;
  // The other side in a series: a pro team of the league, or a school or club of the same league's level.
  const rivalName = (): string => {
    if (!def) return '';
    const spin = state.currentYear + (run?.won ?? 0) + (season?.rating ?? 0);
    if (s.team && s.team.level !== 'pro') {
      const nicks = def.sport.leagues[s.team.level].nicknames;
      return `the ${nicks[spin % nicks.length]!}`;
    }
    const teams = def.sport.leagues.pro.teams.filter((t) => t.id !== s.team?.id);
    return teams.length === 0 ? '' : teams[spin % teams.length]!.name;
  };
  const injury = def ? state.health.conditions.find((c) => def.sport.injuries.some((i) => i.id === c.conditionId)) : undefined;
  const draft = s.draft;
  return {
    sport: def?.noun ?? '',
    position: def ? (positionOf(def.sport, s.position)?.label.toLowerCase() ?? '') : '',
    team: s.team?.name ?? season?.team ?? '',
    league: def && s.team ? (s.team.level === 'pro' ? def.sport.leagues.pro.name : def.sport.leagues[s.team.level].name) : '',
    stage: def ? (def.sport.stages[Math.min(2, run?.won ?? 0)] ?? '') : '',
    trophy: def?.sport.title ?? '',
    pick: draft && draft.pick > 0 ? ordinal(draft.pick) : '',
    draftTeam: def && draft?.teamId ? (def.sport.leagues.pro.teams.find((t) => t.id === draft.teamId)?.name ?? '') : '',
    draftRound: draft && draft.round > 0 ? ordinal(draft.round) : '',
    record: season ? recordText(season) : '',
    statLine: season ? statLine(season, content) : '',
    opponent: rivalName(),
    injury: injury ? (content.conditions[injury.conditionId]?.noun ?? '') : '',
    salary: s.contract ? `$${wholeDollars(s.contract.salary).toLocaleString('en-US')}` : '',
    season: season ? String(season.year) : '',
  };
}
