/** What the More → Move abroad screen and the Profile sheet read (W6): availability and prices come from the same rules the actions use. */
import { ROUTES, type ContentBundle, type CountryId, type RegularizationBasis, type RouteId, type Tier } from '../../content/schemas';
import { isLifeActionAvailable } from '../actions/life';
import { citiesOfCountry, countryIdOfCity, activeCountries } from '../country';
import { moveInCost } from '../housing';
import type { LifeState } from '../types';
import { homeCity } from './effects';
import { entryBlock, entryCost, entryOdds, naturalizationBlock, naturalizationYears, permanentBlock, permanentOdds, regularizationBlock, regularizationTerms, testOdds, barredFrom, sponsorFor } from './routes';
import { moveBlock } from './move';
import { removalRisk } from './step';
import { isSettled, livingCountry, relativesAbroad, statusKind } from './query';
import { REMIT_LEVELS } from '../../content/schemas';

export interface MigrationPick {
  countryId: CountryId | '';
  cityId: string;
  route: RouteId;
  majorId: string;
  tier: Tier;
}

export function getMigrationView(state: LifeState, pick: MigrationPick, content: ContentBundle) {
  const b = content.balance.immigration;
  const here = livingCountry(state, content);
  const m = state.migration;
  const r = state.travel.residence;
  const status = statusKind(state, content);
  const countries = activeCountries(content).filter((c) => c.id !== here && barredFrom(state, c.id, content) !== 'citizen');
  const countryId = countries.some((c) => c.id === pick.countryId) ? (pick.countryId as CountryId) : countries[0]?.id ?? null;
  const cities = countryId ? citiesOfCountry(countryId, content) : [];
  const sponsor = countryId ? sponsorFor(state, countryId, content) : null;
  const sponsorCity = sponsor ? state.people[sponsor]!.cityId : null;
  const cityId = pick.route === 'family' && sponsorCity ? sponsorCity : cities.includes(pick.cityId) ? pick.cityId : cities[0] ?? '';
  const majors = Object.values(content.majors).filter((x) => !x.retired).sort((a, c) => a.name.localeCompare(c.name));
  const majorId = majors.some((x) => x.id === pick.majorId) ? pick.majorId : majors[0]?.id ?? '';
  const entry = (route: RouteId) => {
    if (!countryId) return null;
    const input = { route, countryId, cityId, majorId, tier: pick.tier };
    const cost = entryCost(input, content);
    const rules = b.countries[countryId][route];
    return { route, block: entryBlock(state, input, content), odds: entryOdds(state, input, content), fee: cost.fee, held: cost.held, wait: rules.wait, input, can: isLifeActionAvailable(state, 'apply_entry', { entry: input }, content) };
  };
  const app = m.application;
  const homeId = homeCity(state, content);
  const returnCities = state.character.citizenships.filter((c) => c !== here).flatMap((c) => citiesOfCountry(c, content)).map((id) => ({ id, name: content.cities[id]!.name, country: content.countries[countryIdOfCity(id, content)]!.name }));
  const regular = (['marriage', 'long_residence', 'rule_change'] as RegularizationBasis[]).map((basis) => {
    const terms = regularizationTerms(state, basis, content);
    return { basis, block: regularizationBlock(state, basis, content), ...terms, can: isLifeActionAvailable(state, 'apply_status', { status: { kind: 'regularization', basis } }, content) };
  });
  return {
    adult: state.character.age >= b.minAge,
    citizenships: state.character.citizenships.map((id) => content.countries[id]!.name),
    country: content.countries[here]!.name,
    status,
    settled: isSettled(state, content),
    permit: r?.settled ? { type: r.type, route: r.route, endYear: r.endYear, since: m.arrivedYear } : null,
    application: app ? {
      kind: app.kind, route: app.route ?? null, basis: app.basis ?? null, status: app.status, country: content.countries[app.countryId]!.name,
      city: app.cityId ? content.cities[app.cityId]?.name ?? '' : '', decisionYear: app.decisionYear, expiresYear: app.expiresYear ?? null, odds: app.odds,
    } : null,
    destinations: countries.map((c) => ({ id: c.id, name: c.name, banned: barredFrom(state, c.id, content) === 'removed' })),
    pick: { countryId, cityId, route: pick.route, majorId, tier: pick.tier },
    cities: cities.map((id) => ({ id, name: content.cities[id]!.name })),
    majors: majors.map((x) => ({ id: x.id, name: x.name })),
    routes: ROUTES.map(entry).filter((x): x is NonNullable<ReturnType<typeof entry>> => x !== null),
    sponsor: sponsor ? `${state.people[sponsor]!.name.first} ${state.people[sponsor]!.name.last}` : null,
    permanent: status === 'temporary' && r?.settled ? { block: permanentBlock(state, content), odds: permanentOdds(state, content), fee: b.countries[here].permanent.fee, can: isLifeActionAvailable(state, 'apply_status', { status: { kind: 'permanent' } }, content) } : null,
    citizenship: status === 'permanent' ? { block: naturalizationBlock(state, content), years: naturalizationYears(state, content), odds: testOdds(state, false, content), fee: b.countries[here].naturalization.fee, can: isLifeActionAvailable(state, 'apply_status', { status: { kind: 'naturalization' } }, content) } : null,
    regular: status === 'undocumented' ? regular : [],
    undocumented: status === 'undocumented' ? { risk: removalRisk(state, content), closeCalls: m.undocumented?.closeCalls ?? 0, since: m.undocumented?.sinceYear ?? state.currentYear } : null,
    move: app && app.kind === 'entry' && app.status === 'approved' && app.cityId ? { cityName: content.cities[app.cityId]!.name, block: moveBlock(state, app.cityId, content), cost: moveInCost(state, app.cityId, content), can: isLifeActionAvailable(state, 'move_abroad', {}, content) } : null,
    withoutPapers: countryId ? { cost: b.undocumented.entry.cost, can: isLifeActionAvailable(state, 'move_without_papers', { cityId }, content), turnedBack: b.undocumented.entry.turnedBack } : null,
    returnCities,
    canReturn: (cityId: string) => isLifeActionAvailable(state, 'return_home', { cityId }, content),
    homeCityId: homeId,
    remit: { level: m.remit.level, sent: m.remit.sent, options: REMIT_LEVELS.map((l) => ({ id: l, share: b.remit.levels[l], can: isLifeActionAvailable(state, 'set_remittance', { remit: l }, content) })), relatives: relativesAbroad(state, content).length },
    canWithdraw: isLifeActionAvailable(state, 'withdraw_application', {}, content),
    removed: Object.entries(m.removed).map(([id, year]) => ({ country: content.countries[id as CountryId]?.name ?? id, year, until: year + b.banYears })),
  };
}
export type MigrationView = ReturnType<typeof getMigrationView>;

/** Profile: the citizenships and standing in the country you live in. */
export function getStandingView(state: LifeState, content: ContentBundle) {
  const r = state.travel.residence;
  return {
    citizenships: state.character.citizenships.map((id) => content.countries[id]!.name),
    status: statusKind(state, content),
    settled: isSettled(state, content),
    permitType: r?.settled ? r.type : null,
    permitEnd: r?.settled && (r.type === 'student' || r.type === 'temporary_worker') ? r.endYear : null,
  };
}
