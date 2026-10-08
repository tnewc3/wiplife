/**
 * Invariants for crime careers (E6a): the state is well formed (a crew that
 * exists, a rank within it, scores in range, people who are real), nobody under
 * 18 is ever in a crew or holds dirty money, dirty money is a whole number of
 * dollars that is never negative, and an investigation or informant needs
 * what it is about.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

export function crimeFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const k = state.crime;
  const b = content.balance.crime;
  const { adultAge } = content.balance.relationships;
  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };
  const dirty = state.finances.dirty;
  if (!Number.isSafeInteger(dirty) || dirty < 0) fail(`finances.dirty must be a whole-dollar amount of at least 0 (got ${String(dirty)})`);
  if (state.character.age < adultAge && (k.crew !== null || dirty > 0 || k.past.length > 0)) fail(`crime: you are under ${adultAge} and have a crew, dirty money or a crime past`);
  score('crime.heat', k.heat);
  score('crime.standing', k.standing);
  score('crime.rivalry', k.rivalry);
  if (k.crew === null) {
    if (k.rank !== 0 || k.standing !== 0 || k.rivalry !== 0) fail('crime: rank, standing and rivalry without a crew');
    if (k.investigation && k.heat === 0 && k.past.length === 0) fail('crime: an investigation without any heat or history');
  } else {
    const def = content.crews[k.crew.defId];
    if (!def) fail(`crime: unknown crew "${k.crew.defId}"`);
    if (!Number.isInteger(k.rank) || k.rank < 1 || k.rank > b.ranks.length) fail(`crime: rank ${String(k.rank)} is outside 1 to ${b.ranks.length}`);
    if (k.peak < k.rank) fail('crime: the highest rank held is below the current rank');
    if (k.crew.since > state.currentYear || k.crew.since < state.birthYear + adultAge) fail('crime: the crew was joined outside the adult years');
    if (!content.cities[k.crew.cityId]) fail(`crime: the crew works in an unknown city "${k.crew.cityId}"`);
    if (k.crew.away) {
      if (k.crew.cityId === state.character.cityId) fail('crime: away from a crew that works in the city you live in');
      score('crime.away.standing', k.crew.away.standing);
      score('crime.away.suspicion', k.crew.away.suspicion);
      if (k.crew.away.since > state.currentYear) fail('crime: away since a year to come');
    } else if (k.crew.cityId !== state.character.cityId && k.awayYears !== 0) fail('crime: years away counted without being away');
    if (k.crew.rival !== undefined) {
      if (!content.crews[k.crew.rival]) fail(`crime: unknown rival crew "${k.crew.rival}"`);
      if (k.crew.rival === k.crew.defId) fail('crime: a crew is its own rival');
    }
    for (const id of [...k.crew.members, ...k.crew.rivalMembers]) if (!state.people[id]) fail(`crime: crew person ${id} does not exist`);
    if (new Set(k.crew.members).size !== k.crew.members.length) fail('crime: a crew member appears twice');
    if (k.crew.leader !== undefined && !k.crew.members.includes(k.crew.leader)) fail('crime: the leader is not among the members');
    if (k.rank >= b.ranks.length && k.crew.leader !== undefined) fail('crime: the crew has a leader above its top rank');
    if (k.crew.informant !== undefined && !k.crew.members.includes(k.crew.informant)) fail('crime: the informant is not among the members');
    if (k.crew.informant !== undefined && !k.investigation) fail('crime: an informant without an investigation');
    for (const id of k.crew.members) {
      const p = state.people[id];
      if (p && state.currentYear - p.birthYear < adultAge) fail(`crime: crew member ${id} is under ${adultAge}`);
    }
  }
  if (k.investigation && k.investigation.until < k.investigation.since) fail('crime: an investigation ends before it begins');
  for (const past of k.past) {
    if (!content.crews[past.crewId]) fail(`crime: unknown past crew "${past.crewId}"`);
    if (past.toYear < past.fromYear || past.topRank < 1 || past.topRank > b.ranks.length) fail('crime: a past crew has bad years or rank');
  }
  for (const key of ['jobs', 'earned', 'cleaned', 'fees', 'lost', 'spent', 'arrests', 'years'] as const) {
    if (!Number.isSafeInteger(k.totals[key]) || k.totals[key] < 0) fail(`crime.totals.${key} must be a whole number of at least 0`);
  }
  return failures;
}
