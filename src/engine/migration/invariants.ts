import { COUNTRY_IDS, type ContentBundle } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { LifeState } from '../types';
import { livingCountry } from './query';

const ROUTES_BY_TYPE: Record<string, readonly string[]> = {
  temporary_worker: ['work_sponsor', 'study_work'],
  student: ['study_work'],
  permanent_resident: ['work_sponsor', 'study_work', 'family', 'investment', 'regularized'],
  undocumented: ['overstay', 'irregular'],
};

/** W6: citizenships, residence status, applications and the record of life without papers. */
export function migrationFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (s: string) => failures.push(`migration: ${s}`);
  const m = state.migration;
  const valid = (cs: readonly string[]) => cs.length > 0 && new Set(cs).size === cs.length && cs.every((c) => (COUNTRY_IDS as readonly string[]).includes(c));
  if (!valid(state.character.citizenships)) fail('invalid citizenships');
  for (const p of Object.values(state.people)) if (!valid(p.citizenships)) fail(`${p.id}: invalid citizenships`);
  const here = livingCountry(state, content);
  const citizen = state.character.citizenships.includes(here);
  const r = state.travel.residence;
  if (!citizen && !r) fail('lives in a country without citizenship or a residence record');
  if (citizen && r?.settled) fail('a citizen holds a settled permit');
  if (m.arrivedYear !== null && (m.arrivedYear > state.currentYear || m.arrivedYear < state.birthYear)) fail('arrival year outside life');
  if (r?.settled) {
    if (content.countries[here]?.name !== r.country) fail('settled residence is not in the country lived in');
    if (r.type === 'visitor' || !(ROUTES_BY_TYPE[r.type] ?? []).includes(r.route)) fail(`permit ${r.type} does not fit route ${r.route}`);
    if (r.startYear > state.currentYear || r.endYear < r.startYear) fail('permit dates out of order');
    if (m.arrivedYear === null) fail('settled without an arrival year');
    if ((r.type === 'undocumented') !== (m.undocumented !== null)) fail('undocumented record does not match permit');
    if (r.type === 'undocumented') {
      if (state.career.job) fail('a job held without papers');
      if (m.undocumented && m.undocumented.origin !== r.route) fail('undocumented origin does not match route');
    }
  } else if (m.undocumented) fail('undocumented record without a settled permit');
  const app = m.application;
  if (app) {
    if (!(COUNTRY_IDS as readonly string[]).includes(app.countryId)) fail('application for an unknown country');
    if (app.decisionYear < app.sinceYear) fail('application decided before it began');
    if (app.kind === 'entry' && (!app.route || !app.cityId || countryIdOfCity(app.cityId, content) !== app.countryId)) fail('entry application without a route or a city in its country');
    if (app.kind !== 'entry' && (app.route || app.cityId)) fail('only an entry application has a route or city');
    if (app.kind === 'regularization' && !app.basis) fail('regularization without a basis');
    if (app.status === 'pending' && state.character.citizenships.includes(app.countryId) && app.kind === 'entry') fail('applying to enter a country you are a citizen of');
  }
  for (const [country, year] of Object.entries(m.removed)) if (!(COUNTRY_IDS as readonly string[]).includes(country) || year > state.currentYear) fail('invalid removal record');
  if (!Number.isSafeInteger(m.remit.sent) || m.remit.sent < 0) fail('invalid remittance total');
  for (const [key, value] of Object.entries(m.counts)) if (!Number.isSafeInteger(value) || value < 0) fail(`invalid count ${key}`);
  return failures;
}
