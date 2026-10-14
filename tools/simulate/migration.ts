/** W6: emigration and citizenship in the simulation: a seeded policy that moves people, and what came of it. */
import type { ContentBundle, CountryId, RegularizationBasis } from '../../src/content/schemas';
import { ROUTES } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { isLifeActionAvailable } from '../../src/engine/actions';
import { activeCountries, citiesOfCountry, countryIdOfCity } from '../../src/engine/country';
import { chance, createRng, pick } from '../../src/engine/rng';
import { homeCity } from '../../src/engine/migration/effects';
import { statusKind, livingCountry, relativesAbroad } from '../../src/engine/migration/query';
import { sponsorFor } from '../../src/engine/migration/routes';
import { destinations } from '../../src/engine/travel/travel';
import type { LifeState } from '../../src/engine/types';

export interface MigrationReport {
  lives: number;
  /** Lives that moved to another country by each route ("route:country" -> lives). */
  arrivals: Record<string, number>;
  applications: Record<string, number>;
  approvals: Record<string, number>;
  denials: Record<string, number>;
  /** Where people came from. */
  arrivedFrom: Record<string, number>;
  /** Lives with permanent residence, citizenship by naturalization, and the years it took (arrival to citizenship). */
  permanent: number;
  citizens: number;
  citizenYears: number;
  dualCitizens: number;
  /** Undocumented outcomes, in lives: entered or lapsed into it, then regularized, removed, returned, or still without papers at the end. */
  undocumentedLives: number;
  irregularEntries: number;
  turnedBack: number;
  overstays: number;
  regularized: number;
  deportedUndocumented: number;
  deportedAny: number;
  returnedUndocumented: number;
  stillUndocumented: number;
  undocumentedYears: number;
  undocumentedIncome: number;
  closeCalls: number;
  exploitation: number;
  stolen: number;
  ruleChanges: number;
  /** Money sent home, visits home, returns home. */
  remitted: number;
  remitLives: number;
  remitYears: number;
  visits: number;
  returns: number;
  /** Life stages of the settled. */
  settledYears: number;
  settledIncome: number;
  nativeIncome: number;
  nativeYears: number;
  /** People you know who emigrated, and how many with papers. */
  peopleEmigrated: number;
  peopleWithoutPapers: number;
  peopleNaturalized: number;
  /** Children: of parents who live abroad as non-citizens, how many are citizens of the country they live in, and how many hold a parent's citizenship too. */
  childrenAbroad: number;
  childrenHostCitizens: number;
  childrenDual: number;
  events: Record<string, number>;
  violations: { citizenless: number; jobWithoutPapers: number; loanWithoutPapers: number };
  invariantFailures: number;
}

export const emptyMigrationReport = (): MigrationReport => ({
  lives: 0, arrivals: {}, applications: {}, approvals: {}, denials: {}, arrivedFrom: {}, permanent: 0, citizens: 0, citizenYears: 0, dualCitizens: 0,
  undocumentedLives: 0, irregularEntries: 0, turnedBack: 0, overstays: 0, regularized: 0, deportedUndocumented: 0, deportedAny: 0, returnedUndocumented: 0, stillUndocumented: 0,
  undocumentedYears: 0, undocumentedIncome: 0, closeCalls: 0, exploitation: 0, stolen: 0, ruleChanges: 0, remitted: 0, remitLives: 0, remitYears: 0, visits: 0, returns: 0,
  settledYears: 0, settledIncome: 0, nativeIncome: 0, nativeYears: 0, peopleEmigrated: 0, peopleWithoutPapers: 0, peopleNaturalized: 0,
  childrenAbroad: 0, childrenHostCitizens: 0, childrenDual: 0, events: {}, violations: { citizenless: 0, jobWithoutPapers: 0, loanWithoutPapers: 0 }, invariantFailures: 0,
});

type Choice = readonly [LifeActionId, LifeActionParams];

/** The migration policy of the simulated players: a few explore a move, most never do. */
export function chooseMigrationActions(life: LifeState, content: ContentBundle): Choice[] {
  const rng = createRng(`${life.seed}:${life.currentYear}:migration-policy`);
  const p = content.balance.immigration.simulation;
  const out: Choice[] = [];
  const status = statusKind(life, content);
  const app = life.migration.application;
  if (app?.kind === 'entry' && app.status === 'approved') {
    if (chance(rng, p.entryChance) && isLifeActionAvailable(life, 'move_abroad', {}, content)) out.push(['move_abroad', {}]);
    return out;
  }
  if (app) return out;
  if (status === 'permanent' && chance(rng, p.naturalizeChance) && isLifeActionAvailable(life, 'apply_status', { status: { kind: 'naturalization' } }, content)) return [['apply_status', { status: { kind: 'naturalization' } }]];
  if (status === 'temporary' && chance(rng, p.applyChance * 3) && isLifeActionAvailable(life, 'apply_status', { status: { kind: 'permanent' } }, content)) return [['apply_status', { status: { kind: 'permanent' } }]];
  if (status === 'undocumented') {
    for (const basis of ['marriage', 'long_residence', 'rule_change'] as RegularizationBasis[]) {
      const params = { status: { kind: 'regularization' as const, basis } };
      if (chance(rng, 0.7) && isLifeActionAvailable(life, 'apply_status', params, content)) return [['apply_status', params]];
    }
  }
  if (status !== 'citizen') {
    if (relativesAbroad(life, content).length > 0 && life.migration.remit.level === 'none' && chance(rng, p.remitChance * 0.2) && isLifeActionAvailable(life, 'set_remittance', { remit: 'some' }, content)) out.push(['set_remittance', { remit: 'some' }]);
    const home = homeCity(life, content);
    if (home && chance(rng, p.visitChance)) {
      const dest = destinations(content).find((d) => d.cityId === home);
      const params = { trip: { destinationId: dest?.id ?? '', budget: 'budget' as const, companions: [] as string[] } };
      if (dest && isLifeActionAvailable(life, 'plan_trip', params, content)) out.push(['plan_trip', params]);
    }
    if (home && chance(rng, p.returnChance) && isLifeActionAvailable(life, 'return_home', { cityId: home }, content)) out.push(['return_home', { cityId: home }]);
    return out;
  }
  // A citizen at home: now and then someone looks for a way to leave.
  const age = life.character.age;
  if (age < 20 || age > 58 || !chance(rng, p.explore)) return out;
  const here = livingCountry(life, content);
  const away = activeCountries(content).map((c) => c.id).filter((c) => c !== here && !life.character.citizenships.includes(c));
  if (away.length === 0) return out;
  // Cheaper to leave, or with kin there, is likelier.
  const target = pick(rng, away);
  const cityId = pick(rng, citiesOfCountry(target, content));
  const options: Choice[] = [];
  const majors = Object.keys(content.majors).sort();
  for (const route of ROUTES) {
    const sponsor = route === 'family' ? sponsorFor(life, target, content) : null;
    const city = sponsor ? life.people[sponsor]!.cityId : cityId;
    const entry = { route, countryId: target, cityId: city, majorId: pick(rng, majors), tier: 'state' as const };
    if (isLifeActionAvailable(life, 'apply_entry', { entry }, content)) options.push(['apply_entry', { entry }]);
  }
  if (options.length > 0) return [pick(rng, options)];
  const poor = life.finances.savings < 30_000;
  if (poor && age <= 40 && chance(rng, p.undocumentedEntryChance)) {
    const params = { cityId };
    if (isLifeActionAvailable(life, 'move_without_papers', params, content)) return [['move_without_papers', params]];
  }
  return out;
}

const PAYING: readonly string[] = ['student', 'mortgage', 'auto', 'business'];

export class MigrationWatcher {
  constructor(private readonly report: MigrationReport) {}

  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const res = after.travel.residence;
    const gross = after.finances.lastLedger?.year === after.currentYear - 1 || after.finances.lastLedger?.year === after.currentYear ? after.finances.lastLedger.gross : 0;
    if (res?.settled) {
      r.settledYears++;
      r.settledIncome += gross;
      if (res.type === 'undocumented') {
        r.undocumentedYears++;
        r.undocumentedIncome += gross;
        if (after.career.job) r.violations.jobWithoutPapers++;
        const known = new Set(before.finances.debts.map((d) => d.id));
        if (res.startYear < after.currentYear && after.finances.debts.some((d) => !known.has(d.id) && PAYING.includes(d.kind))) r.violations.loanWithoutPapers++;
      }
    } else if (after.character.age >= 25 && after.character.age <= 60 && after.career.job) {
      r.nativeYears++;
      r.nativeIncome += gross;
    }
  }

  finish(life: LifeState, content: ContentBundle): void {
    const r = this.report;
    const c = life.migration.counts;
    r.lives++;
    const add = (into: Record<string, number>, key: string, n: number) => { into[key] = (into[key] ?? 0) + n; };
    let undocumented = false;
    for (const [key, n] of Object.entries(c)) {
      const [what, a, b, d] = key.split(':');
      if (what === 'applied' && a !== 'permanent' && a !== 'naturalization' && a !== 'regularization') add(r.applications, `${a}:${b}`, n);
      else if (what === 'approved' && a === 'entry') add(r.approvals, `${b}:${d}`, n);
      else if (what === 'denied' && a === 'entry') add(r.denials, `${b}:${d}`, n);
      else if (what === 'arrived') add(r.arrivals, `${a}:${b}`, n);
      else if (what === 'arrivedFrom') add(r.arrivedFrom, a!, n);
      else if (what === 'permanent') r.permanent += n;
      else if (what === 'citizen') r.citizens += n;
      else if (what === 'citizenYears') r.citizenYears += n;
      else if (what === 'turnedBack') r.turnedBack += n;
      else if (what === 'overstay') { r.overstays += n; undocumented = true; }
      else if (what === 'entry') { r.irregularEntries += n; undocumented = true; }
      else if (what === 'regularized') r.regularized += n;
      else if (what === 'deported') r.deportedAny += n;
      else if (what === 'deportedUndocumented') r.deportedUndocumented += n;
      else if (what === 'returned' && a === 'undocumented') r.returnedUndocumented += n;
      else if (what === 'returned') r.returns += n;
    }
    // (turnedBack also counts an irregular attempt that never arrived; it is not a life without papers.)
    if (undocumented && (c['arrived:irregular:us'] || c['arrived:irregular:ca'] || c['arrived:irregular:uk'] || c['arrived:irregular:mx'] || c['overstay:us'] || c['overstay:ca'] || c['overstay:uk'] || c['overstay:mx'])) r.undocumentedLives++;
    r.closeCalls += c.closeCalls ?? 0;
    r.exploitation += c.exploitation ?? 0;
    r.stolen += c.stolen ?? 0;
    r.ruleChanges += c.ruleChanges ?? 0;
    r.remitted += c.remitted ?? 0;
    r.remitYears += c.remitYears ?? 0;
    if ((c.remitted ?? 0) > 0) r.remitLives++;
    r.visits += c.visits ?? 0;
    if (life.travel.residence?.type === 'undocumented') r.stillUndocumented++;
    if (life.character.citizenships.length > 1) r.dualCitizens++;
    for (const p of Object.values(life.people)) {
      const em = p.life?.emigrated;
      if (em) {
        r.peopleEmigrated++;
        if (!em.papers) r.peopleWithoutPapers++;
        else if (p.citizenships.includes(em.countryId)) r.peopleNaturalized++;
      }
    }
    const since = life.migration.arrivedYear;
    if (since !== null) for (const rel of Object.values(life.relationships)) {
      const kid = life.people[rel.personId];
      if (rel.kind !== 'child' || !kid || kid.birthYear < since) continue;
      r.childrenAbroad++;
      const host = countryIdOfCity(kid.cityId, content);
      if (kid.citizenships.includes(host)) r.childrenHostCitizens++;
      if (kid.citizenships.length > 1) r.childrenDual++;
    }
    for (const [id, log] of Object.entries(life.eventLog)) {
      const cat = content.events[id]?.category;
      if (cat === 'emigration' || cat === 'abroad' || cat === 'undocumented' || id === 'emigrates_farewell' || id === 'emigrant_asks_fees') r.events[id] = (r.events[id] ?? 0) + log.count;
    }
    if (!life.character.citizenships.length) r.violations.citizenless++;
  }
}

const pct = (n: number, d: number) => (d ? `${(100 * n / d).toFixed(2)}%` : 'n/a');
const per = (n: number, d: number) => (d ? (n / d).toFixed(3) : 'n/a');
const sortEntries = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

export function formatMigration(r: MigrationReport, content: ContentBundle): string[] {
  const name = (id: string) => content.countries[id as CountryId]?.name ?? id;
  const keyed = (o: Record<string, number>) => sortEntries(o).map(([k, n]) => { const [route, country] = k.split(':'); return `${route} to ${name(country!)} ${n}`; }).join('; ') || 'none';
  const arrived = Object.values(r.arrivals).reduce((a, b) => a + b, 0);
  const legalArrivals = sortEntries(r.arrivals).filter(([k]) => !k.startsWith('irregular')).reduce((a, [, n]) => a + n, 0);
  const outcomes = r.regularized + r.deportedUndocumented + r.returnedUndocumented + r.stillUndocumented;
  return [
    '\nEmigration and citizenship (W6)',
    `  Moves abroad: ${arrived} in ${r.lives} lives (${pct(arrived, r.lives)}); by a legal route ${legalArrivals}, without papers ${arrived - legalArrivals}; turned back at the border ${r.turnedBack}`,
    `  Applications by route and country: ${keyed(r.applications)}`,
    `  Approved: ${keyed(r.approvals)}`,
    `  Refused: ${keyed(r.denials)}`,
    `  Arrivals by route and country: ${keyed(r.arrivals)}`,
    `  Came from: ${sortEntries(r.arrivedFrom).map(([k, n]) => `${name(k)} ${n}`).join('; ') || 'none'}`,
    `  Permanent residence granted ${r.permanent}; citizenship by naturalization ${r.citizens}, taking on average ${r.citizens ? (r.citizenYears / r.citizens).toFixed(1) : 'n/a'} years from arrival; lives ending with two citizenships ${r.dualCitizens} (${pct(r.dualCitizens, r.lives)})`,
    `  Without papers: ${r.undocumentedLives} lives (${pct(r.undocumentedLives, r.lives)}): by overstaying ${r.overstays}, by entering without permission ${r.irregularEntries}. Outcomes: regularized ${r.regularized}, removed ${r.deportedUndocumented}, went home ${r.returnedUndocumented}, still without papers at the end ${r.stillUndocumented}${outcomes === 0 ? '' : ` (${outcomes} in all)`}`,
    `  Removals of any non-citizen (including a sentence): ${r.deportedAny}; years without papers ${r.undocumentedYears}; close calls ${r.closeCalls} (${per(r.closeCalls, r.undocumentedYears)} per year); wages held back ${r.exploitation} times, ${r.stolen} base units; windows for status opened ${r.ruleChanges}`,
    `  Pay: gross income per year without papers ${r.undocumentedYears ? Math.round(r.undocumentedIncome / r.undocumentedYears) : 'n/a'}, settled with papers ${r.settledYears - r.undocumentedYears ? Math.round((r.settledIncome - r.undocumentedIncome) / (r.settledYears - r.undocumentedYears)) : 'n/a'}, working citizens aged 25–60 ${r.nativeYears ? Math.round(r.nativeIncome / r.nativeYears) : 'n/a'} (base units; observations, not causal estimates)`,
    `  Money sent home: ${r.remitted} base units over ${r.remitYears} years by ${r.remitLives} lives (through the yearly ledger); visits home that refreshed ties ${r.visits}; returns home ${r.returns}`,
    `  People you know who emigrated: ${r.peopleEmigrated}, without papers ${r.peopleWithoutPapers}, now citizens of where they went ${r.peopleNaturalized}`,
    `  Children born after a move abroad: ${r.childrenAbroad}; citizens of where they live ${pct(r.childrenHostCitizens, r.childrenAbroad)}; with a second citizenship ${pct(r.childrenDual, r.childrenAbroad)}`,
    `  Emigration events reached: ${Object.keys(r.events).length}; ${JSON.stringify(Object.fromEntries(sortEntries(r.events)))}`,
    `  Must be zero: a regular job held without papers ${r.violations.jobWithoutPapers}, a loan taken without papers ${r.violations.loanWithoutPapers}, lives without a citizenship ${r.violations.citizenless}, invariant failures ${r.invariantFailures}`,
    '  Rates follow the simulated migration policy (a few lives explore a move); they show that the systems work, not how common emigration is.',
  ];
}
