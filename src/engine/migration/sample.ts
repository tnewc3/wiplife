/** Throwaway W6 context for the existing event sandbox, never a saved life: the status, application, permit and relatives an event asks for. */
import type { Condition, ContentBundle, CountryId, MigrationCondition } from '../../content/schemas';
import { activeCountries, citiesOfCountry, countryIdOfCity } from '../country';
import { createChild } from '../family/children';
import { createRng } from '../rng';
import { nextPersonId } from '../events/casting';
import type { Id, LifeState, Person } from '../types';
import { destinationOf } from './move';
import type { Application } from './types';

function asksForMinor(c: Condition | undefined): boolean {
  if (!c) return false;
  if ('all' in c) return c.all.some(asksForMinor);
  return 'family' in c && c.family.minors !== undefined;
}

function merged(c: Condition | undefined): MigrationCondition | undefined {
  if (!c) return undefined;
  if ('all' in c) return c.all.map(merged).reduce<MigrationCondition | undefined>((a, b) => (a || b ? { ...a, ...b } : undefined), undefined);
  if ('migration' in c) return c.migration;
  return undefined;
}


function addApplication(state: LifeState, q: MigrationCondition, here: CountryId, away: CountryId, content: ContentBundle): void {
  const year = state.currentYear;
  const status = q.application?.[0];
  if (!status || status === 'none') return;
  const k = q.kind?.[0] ?? 'entry';
  const countryId = k === 'entry' ? away : here;
  const app: Application = { kind: k, countryId, sinceYear: year - 1, decisionYear: status === 'pending' ? year + 1 : year, status, fee: 1000, odds: 0.5 };
  if (status !== 'pending') app.decidedYear = year;
  if (k === 'entry') { app.route = q.route?.[0] ?? 'work_sponsor'; app.cityId = citiesOfCountry(away, content)[0]!; }
  if (k === 'regularization') app.basis = 'marriage';
  state.migration.application = app;
}

export function giveSampleMigration(state: LifeState, def: { requires?: Condition | undefined }, cast: Record<string, Id>, content: ContentBundle): void {
  const q = merged(def.requires);
  if (!q) return;
  const kid = (): Id => createChild(state, createRng(`${state.seed}:sample-kid`), { origin: 'birth', age: 6, parents: { you: true }, custody: 'you' }, content);
  if (asksForMinor(def.requires)) kid();
  const year = state.currentYear;
  const here = countryIdOfCity(state.character.cityId, content);
  const away: CountryId = activeCountries(content).map((c) => c.id).find((c) => c !== here)!;
  const kind = q.status?.[0] ?? (q.eligible?.[0] === 'naturalization' ? 'permanent' : q.eligible?.[0] === 'regularization' ? 'undocumented' : q.eligible?.[0] === 'permanent' ? 'temporary' : q.settled || q.expiring || q.arrivedNow || q.years || q.childCitizen || q.via ? 'temporary' : 'citizen');
  const m = state.migration;
  // Someone close lives in another country (the people cast for the event first).
  const abroad = () => {
    for (const id of Object.values(cast)) { const p = state.people[id]; if (p) { p.cityId = citiesOfCountry(away, content)[0]!; p.citizenships = [away]; } }
    for (const r of Object.values(state.relationships)) {
      const p = state.people[r.personId];
      if (p && ['parent', 'sibling'].includes(r.kind)) { p.cityId = citiesOfCountry(away, content)[0]!; p.citizenships = [away]; }
    }
  };
  if (kind === 'citizen') {
    state.character.citizenships = q.dual ? [here, away] : [here];
    addApplication(state, q, here, away, content);
    if (q.relatives) abroad();
    if (q.removed || q.removedNow) m.removed[away] = q.removedNow === false ? year - 3 : year;
    return;
  }
  // Born elsewhere, living here without being a citizen.
  state.character.citizenships = [away];
  const years = q.years?.gte ?? q.years?.gt ?? (q.eligible ? (q.eligible[0] === 'naturalization' ? 8 : q.eligible[0] === 'regularization' ? 6 : 4) : 1);
  const lessOrEqual = q.years?.lte !== undefined && q.years.gte === undefined;
  m.arrivedYear = q.arrivedNow ? year : lessOrEqual ? year - Math.min(1, q.years!.lte!) : year - Math.ceil(years);
  const type = kind === 'undocumented' ? 'undocumented' : kind === 'permanent' ? 'permanent_resident' : q.via?.[0] === 'study_work' ? 'student' : 'temporary_worker';
  const route = kind === 'undocumented' ? 'overstay' : q.via?.[0] ?? (type === 'permanent_resident' ? 'family' : 'work_sponsor');
  state.travel.residence = {
    country: content.countries[here]!.name, destinationId: destinationOf(state.character.cityId, content), type, route, settled: true,
    startYear: m.arrivedYear, endYear: q.expiring ? year : type === 'temporary_worker' || type === 'student' ? year + 3 : m.arrivedYear, homeCityId: citiesOfCountry(away, content)[0]!,
  };
  if (type === 'undocumented') m.undocumented = { sinceYear: m.arrivedYear, origin: 'overstay', closeCalls: 0 };
  state.finances.savings = Math.max(state.finances.savings, 50_000);
  for (const l of content.countries[here]!.languages.official) {
    const known = state.character.languages.find((s) => s.id === l);
    if (known) known.skill = 90; else state.character.languages.push({ id: l, skill: 90, native: false, lastUsed: year });
  }
  // (Permanent residence needs a job.)
  if (q.eligible?.includes('permanent') && !state.career.job) state.career.job = { jobId: Object.keys(content.jobs).sort()[0]!, level: 1, yearsAtLevel: 0, performance: 50, salary: 40000, since: year - 2, employer: 'Sample Employer' };
  if (q.ruleChange) m.ruleChangeUntil = year + 1;
  if (q.closeCall) m.year = { year, risk: 0, closeCall: true, policeContact: false, stolen: 0 };
  if (q.remitting) m.remit.level = 'some';
  if (q.removedNow) m.removed[away] = year;
  if (q.testFails) m.testFails = q.testFails.gte ?? 1;
  addApplication(state, q, here, away, content);
  const adult = (id: Id): Person => state.people[id]!;
  if (q.spouse) {
    const id = nextPersonId(state);
    state.people[id] = { ...(Object.values(state.people)[0] as Person), id, name: { first: 'Sam', last: 'Spouse' }, birthYear: year - 35, alive: true, cityId: state.character.cityId, citizenships: [here], tags: [], languages: state.character.languages.map((l) => ({ ...l })) };
    state.relationships[id] = { personId: id, kind: 'spouse', status: 'active', affection: 80, trust: 80, memories: [], since: year - 3 };
    adult(id).identity = { ...adult(id).identity };
  }
  if (q.childCitizen) state.people[kid()]!.citizenships = [here];
  if (q.relatives) abroad();
}
