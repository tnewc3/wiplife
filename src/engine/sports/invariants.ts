/**
 * Invariants for sports (E6c): the state is well formed (a sport that exists,
 * a position it has, a team in a city the game has, a deal with a team in the
 * league), nobody under 18 is in the pros or under a pro contract, a career
 * and its sport agree, a playoff run is at most three series, and the numbers
 * are whole and in range.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { levelOfRung, sportPath } from './query';

export function sportsFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const s = state.sports;
  const f = state.fame;
  const { adultAge } = content.balance.relationships;
  const age = state.character.age;
  const def = s.sport === null ? undefined : sportPath(content, s.sport);
  if (s.sport !== null && !def) fail(`sports: unknown sport "${s.sport}"`);
  if (def) {
    if (s.position !== null && !def.sport.positions.some((p) => p.id === s.position)) fail(`sports: ${def.id} has no position "${String(s.position)}"`);
    if (s.team && !content.cities[s.team.city]) fail(`sports: a team in unknown city "${s.team.city}"`);
    if (s.team?.level === 'pro' && !def.sport.leagues.pro.teams.some((t) => t.id === s.team!.id)) fail(`sports: unknown pro team "${String(s.team.id)}"`);
    if (s.contract && !def.sport.leagues.pro.teams.some((t) => t.id === s.contract!.teamId)) fail(`sports: a contract with unknown team "${s.contract.teamId}"`);
    if (s.contract && s.team && s.team.id !== s.contract.teamId) fail('sports: you are under contract with one team and play for another');
  }
  if (s.contract) {
    if (!s.pro) fail('sports: a contract without being a pro');
    if (s.contract.until < s.contract.since || !Number.isSafeInteger(s.contract.salary) || s.contract.salary < 0) fail('sports: a malformed contract');
    if (s.contract.since - state.birthYear < adultAge) fail(`sports: a pro contract signed under ${adultAge}`);
  }
  if ((s.pro || s.contract) && age < adultAge) fail(`sports: someone under ${adultAge} is in the pros`);
  if (s.pro && s.retired === undefined && f.active && f.main === s.sport && def) {
    const rung = f.paths[def.id]?.rung ?? 0;
    if (levelOfRung(def.sport, rung) !== 'pro') fail('sports: a pro below the pro rungs');
  }
  if (f.active && def && f.main === def.id) {
    if (s.sport !== def.id) fail('sports: your career and your sport disagree');
    if (s.retired !== undefined) fail('sports: playing and retired at once');
  }
  if (s.run && (s.run.won < 0 || s.run.won > 3)) fail('sports: a playoff run of more than three series');
  if (s.draft && (s.draft.pick < 0 || s.draft.round < 0)) fail('sports: a malformed draft record');
  if (s.seasons.length > 12) fail('sports: too many seasons kept');
  for (const season of s.seasons) {
    if (season.wins + season.draws + season.losses <= 0) fail('sports: a season without games');
    if (season.rank < 1 || season.rank > season.of) fail('sports: a place in the standings off the table');
    if (season.year > state.currentYear) fail('sports: a season in the future');
  }
  for (const [k, v] of Object.entries(s.totals)) if (!Number.isFinite(v) || v < 0) fail(`sports.totals.${k} must be at least 0`);
  if (!Number.isSafeInteger(s.totals.earned)) fail('sports.totals.earned must be a whole number');
  if (!['skills', 'conditioning', 'film'].includes(s.focus)) fail(`sports: unknown focus "${String(s.focus)}"`);
  return failures;
}
