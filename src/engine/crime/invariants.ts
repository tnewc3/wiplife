/**
 * Invariants for crime careers (E6a): the state is well formed (a crew that
 * exists, a rank within it, scores in range, people who are real), nobody under
 * 18 is ever in a crew or holds dirty money, dirty money is a whole number of
 * dollars that is never negative, and an investigation or informant needs
 * what it is about.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { topRank } from './query';

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
  const youthMin = content.balance.orgs.youth.minAge;
  // (O1 follow-up: a teen from the youth age can be in a youth crew; dirty money and every adult crew stay for adults.)
  if (state.character.age < adultAge) {
    if (dirty > 0) fail(`crime: you are under ${adultAge} and hold dirty money`);
    if (k.crew !== null && (state.character.age < youthMin || content.crews[k.crew.defId]?.youth !== true)) fail(`crime: you are under ${adultAge} and in a crew that is not a youth crew you are old enough for`);
    if (k.past.some((p) => content.crews[p.crewId]?.youth !== true)) fail(`crime: you are under ${adultAge} and have a past in a crew that is not a youth crew`);
  }
  score('crime.heat', k.heat);
  score('crime.standing', k.standing);
  score('crime.rivalry', k.rivalry);
  if (k.crew === null) {
    if (k.rank !== 0 || k.standing !== 0 || k.rivalry !== 0) fail('crime: rank, standing and rivalry without a crew');
    if (k.investigation && k.heat === 0 && k.past.length === 0) fail('crime: an investigation without any heat or history');
  } else {
    const def = content.crews[k.crew.defId];
    if (!def) fail(`crime: unknown crew "${k.crew.defId}"`);
    const top = topRank(content, k.crew.defId);
    if (!Number.isInteger(k.rank) || k.rank < 1 || k.rank > top) fail(`crime: rank ${String(k.rank)} is outside 1 to ${top}`);
    if (k.peak < k.rank) fail('crime: the highest rank held is below the current rank');
    if (k.crew.since > state.currentYear || k.crew.since < state.birthYear + (def?.youth ? youthMin : adultAge)) fail('crime: the crew was joined before the age it allows');
    if (!content.cities[k.crew.cityId]) fail(`crime: the crew works in an unknown city "${k.crew.cityId}"`);
    if (k.crew.away) {
      // (Moving back mid-year leaves this set until the year step resolves it.)
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
    if (k.rank >= top && k.crew.leader !== undefined) fail('crime: the crew has a leader above its top rank');
    if (k.crew.informant !== undefined && !k.crew.members.includes(k.crew.informant)) fail('crime: the informant is not among the members');
    if (k.crew.informant !== undefined && !k.investigation) fail('crime: an informant without an investigation');
    for (const id of k.crew.members) {
      const p = state.people[id];
      const floor = def?.youth ? content.balance.orgs.youth.memberAge.min : adultAge;
      if (p && state.currentYear - p.birthYear < floor) fail(`crime: crew member ${id} is under ${floor}`);
    }
    // O1: the roster, the world around the crew.
    for (const [id, m] of Object.entries(k.crew.roster ?? {})) {
      if (!k.crew.members.includes(id)) fail(`org: roster member ${id} is not in the crew`);
      score(`org.roster.${id}.skill`, m.skill);
      score(`org.roster.${id}.loyalty`, m.loyalty);
      score(`org.roster.${id}.heat`, m.heat);
      if (!Number.isInteger(m.rank) || m.rank < 1 || m.rank > Math.max(1, top - 1)) fail(`org: roster member ${id} has rank ${String(m.rank)}`);
      if (m.job !== undefined && !content.orgJobs[m.job]) fail(`org: roster member ${id} has an unknown job "${m.job}"`);
    }
    const orgs = state.orgs.cities[k.crew.cityId];
    if (!orgs?.some((o) => o.id === k.crew!.defId)) fail('org: the crew is not among its city\'s organizations');
    if (k.crew.war !== undefined && orgs?.find((o) => o.id === k.crew!.war)?.status !== 'war') fail('org: at war with an organization that is not at war with you');
    if (k.crew.supplier !== undefined && !orgs?.some((o) => o.id === k.crew!.supplier && content.orgKinds[o.kind]?.supplies)) fail('org: the supplier is not a cartel of the city');
    if (k.crew.plan?.expand !== undefined && !(k.crew.plan.expand in (state.orgs.hoods[k.crew.cityId] ?? {}))) fail('org: an order to take a neighborhood that does not exist');
  }
  for (const [cityId, orgs] of Object.entries(state.orgs.cities)) {
    if (!content.cities[cityId]) fail(`org: organizations in an unknown city "${cityId}"`);
    const ids = new Set(orgs.map((o) => o.id));
    if (ids.size !== orgs.length) fail(`org: duplicate organization ids in ${cityId}`);
    for (const o of orgs) {
      score(`org.${o.id}.strength`, o.strength);
      score(`org.${o.id}.war`, o.war);
      if (!Number.isInteger(o.attitude) || o.attitude < -100 || o.attitude > 100) fail(`org.${o.id}.attitude out of range`);
      if (o.supplier !== undefined && !ids.has(o.supplier)) fail(`org.${o.id}: unknown supplier`);
    }
    for (const [hood, owner] of Object.entries(state.orgs.hoods[cityId] ?? {})) {
      if (!content.cities[cityId]?.neighborhoods?.some((h) => h.id === hood)) fail(`org: unknown neighborhood ${hood} in ${cityId}`);
      if (owner !== null && !ids.has(owner)) fail(`org: ${hood} is held by an unknown organization`);
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
