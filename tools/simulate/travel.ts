/** W5: observed trips/stays and engine effects, with a seeded travel policy. */
import type { ContentBundle, TripStyle } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { isLifeActionAvailable } from '../../src/engine/actions';
import { destinations, groupFriends, honeymoonSpouse, stayFamily, travelCompanions } from '../../src/engine/travel/travel';
import { hasBusinessJob } from '../../src/engine/travel/query';
import { benefitFromRecord, pensionShares } from '../../src/engine/retirement';
import type { Residence } from '../../src/engine/travel/types';
import { emptyTravel } from '../../src/engine/travel/types';
import { chance, createRng, pick } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
export interface TravelReport {
  lives: number; traveledLives: number; studyLives: number; workLives: number;
  totals: ReturnType<typeof emptyTravel>['totals'];
  contactsAtDistance: number; contactObservations: number; stayYears: number;
  studyGrades: { before: number; after: number; observations: number };
  hostIncome: number; events: Record<string, number>;
  /** Batch 10: lives with a trip of each style and activity; the honeymoons due and taken; stays with a family along and where the children were. */
  styleLives: Record<string, number>; activityLives: Record<string, number>; souvenirLives: Record<string, number>;
  honeymoon: { married: number; taken: number };
  family: { stayYears: number; childYears: number; childYearsAtHost: number; childrenLeftBehind: number; partnerYears: number; partnerAtHost: number };
  /** Batch 10: pensions earned across countries, at death. */
  pensions: { lives: number; withRecord: number; multiCountry: number; countryRows: number; paidFromTwo: number; yearly: number; homeOnlyYearly: number };
  /** Batch 10: locals met abroad at a destination with a name pool, and how many took a name from it. */
  locals: { met: number };
}
export const emptyTravelReport = (): TravelReport => ({ lives: 0, traveledLives: 0, studyLives: 0, workLives: 0, totals: emptyTravel().totals, contactsAtDistance: 0, contactObservations: 0, stayYears: 0, studyGrades: { before: 0, after: 0, observations: 0 }, hostIncome: 0, events: {}, styleLives: {}, activityLives: {}, souvenirLives: {}, honeymoon: { married: 0, taken: 0 }, family: { stayYears: 0, childYears: 0, childYearsAtHost: 0, childrenLeftBehind: 0, partnerYears: 0, partnerAtHost: 0 }, pensions: { lives: 0, withRecord: 0, multiCountry: 0, countryRows: 0, paidFromTwo: 0, yearly: 0, homeOnlyYearly: 0 }, locals: { met: 0 } });
export function chooseTravelAction(life: LifeState, content: ContentBundle): readonly [LifeActionId, LifeActionParams] | null {
  const rng = createRng(`${life.seed}:${life.currentYear}:travel-policy`);
  const policy = content.balance.travel.simulation;
  const ds = destinations(content);
  const study = life.education.current?.program === 'college';
  if (chance(rng, study ? policy.studyChance : policy.workChance)) {
    const route: Residence['route'] = study ? pick(rng, ['semester', 'year'] as const) : life.career.job ? 'transfer' : 'working_holiday';
    const action = study ? 'study_abroad' : 'work_abroad';
    // A household with a partner or children sometimes goes together.
    const family = stayFamily(life, content);
    const together = (family.partnerId !== null || family.childIds.length > 0) && chance(rng, policy.familyChance);
    const options = ds.map((d) => ({ stay: { destinationId: d.id, route, ...(together ? { family: true } : {}) } })).filter((params) => isLifeActionAvailable(life, action, params, content));
    if (options.length) return [action, pick(rng, options)];
  }
  // A job that calls for travel sends you now and then; the employer pays.
  if (hasBusinessJob(life, content) && chance(rng, policy.businessChance)) {
    const options = ds.filter((d) => d.kind !== 'cruise').map((d) => ({ trip: { destinationId: d.id, budget: 'budget' as const, companions: [], style: 'business' as const } })).filter((params) => isLifeActionAvailable(life, 'plan_trip', params, content));
    if (options.length) return ['plan_trip', pick(rng, options)];
  }
  // A honeymoon, in the years after the wedding.
  const spouse = honeymoonSpouse(life, content);
  if (spouse !== null && chance(rng, 0.7)) {
    const budget = pick(rng, ['comfortable', 'splurge'] as const);
    const options = ds.filter((d) => d.kind !== 'cruise').map((d) => ({ trip: { destinationId: d.id, budget, companions: [spouse], style: 'honeymoon' as const, ...(chance(rng, 0.5) ? { activity: 'food' as const } : {}) } })).filter((params) => isLifeActionAvailable(life, 'plan_trip', params, content));
    if (options.length) return ['plan_trip', pick(rng, options)];
  }
  if (!chance(rng, policy.tripChance)) return null;
  const circle = travelCompanions(life);
  const friends = groupFriends(life);
  const style: TripStyle = chance(rng, policy.cruiseChance) ? 'cruise' : friends.length >= content.balance.travel.styles.group.minFriends && chance(rng, policy.groupChance) ? 'group' : 'vacation';
  const companions = style === 'group' ? friends.slice(0, 2) : circle.length && chance(rng, policy.companionChance) ? [pick(rng, circle)] : [];
  const budget = pick(rng, ['budget', 'comfortable', 'splurge'] as const);
  const activity = chance(rng, 0.6) ? pick(rng, ['sightseeing', 'nightlife', 'adventure', 'food', 'immersion'] as const) : undefined;
  const souvenir = chance(rng, policy.souvenirChance) ? pick(rng, ['small', 'small', 'small', 'small', 'small', 'keepsake', 'keepsake', 'valuable'] as const) : undefined;
  const options = ds.filter((d) => (d.kind === 'cruise') === (style === 'cruise')).map((d) => ({ trip: { destinationId: d.id, budget, companions, ...(style !== 'vacation' ? { style } : {}), ...(activity ? { activity } : {}), ...(souvenir ? { souvenir } : {}) } })).filter((params) => isLifeActionAvailable(life, 'plan_trip', params, content));
  return options.length ? ['plan_trip', pick(rng, options)] : null;
}
export class TravelWatcher {
  constructor(private readonly report: TravelReport, private readonly content?: ContentBundle) {}
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    if (before.travel.residence?.type === 'student') {
      r.studyGrades.before += before.education.current?.gpa ?? 0;
      r.studyGrades.after += after.education.current?.gpa ?? after.education.credentials.at(-1)?.gpa ?? 0;
      r.studyGrades.observations++;
    }
    if (before.travel.residence && before.travel.residence.type !== 'visitor') {
      r.stayYears++;
      r.hostIncome += after.finances.lastLedger?.gross ?? 0;
    }
    // Batch 10: while a family is abroad with you, where your children and partner are.
    const away = before.travel.residence;
    if (away?.family && away.type !== 'visitor') {
      r.family.stayYears++;
      for (const id of away.family.childIds) if (after.people[id]?.alive && after.currentYear - after.people[id]!.birthYear < (this.content?.balance.relationships.adultAge ?? 18)) {
        r.family.childYears++;
        if (after.people[id]!.cityId === after.character.cityId) r.family.childYearsAtHost++;
      }
      if (away.family.partnerId && after.people[away.family.partnerId]?.alive) {
        r.family.partnerYears++;
        if (after.people[away.family.partnerId]!.cityId === after.character.cityId) r.family.partnerAtHost++;
      }
    }
    // Back home after a stay with a family: every child who went comes back with you.
    if (away?.family && !after.travel.residence) {
      for (const id of away.family.childIds) {
        const kid = after.people[id];
        if (kid?.alive && kid.child?.custody === 'you' && kid.child.movedOutYear === undefined && kid.cityId !== after.character.cityId) r.family.childrenLeftBehind++;
      }
    }
    for (const p of Object.values(after.people)) if (p.alive && p.tags.includes('met_abroad') && after.relationships[p.id]?.status === 'active') {
      r.contactObservations++;
      if (p.cityId !== after.character.cityId) r.contactsAtDistance++;
    }
  }
  finish(life: LifeState): void {
    const r = this.report; const t = life.travel.totals;
    r.lives++; if (t.trips) r.traveledLives++; if (t.study) r.studyLives++; if (t.work) r.workLives++;
    for (const key of Object.keys(t) as (keyof typeof t)[]) {
      if (key === 'destinations' || key === 'styles' || key === 'activities' || key === 'souvenirs') { for (const [id, n] of Object.entries(t[key])) r.totals[key][id] = (r.totals[key][id] ?? 0) + n; }
      else r.totals[key] += t[key];
    }
    for (const [key, lives] of [['styles', r.styleLives], ['activities', r.activityLives], ['souvenirs', r.souvenirLives]] as const) for (const id of Object.keys(t[key])) lives[id] = (lives[id] ?? 0) + 1;
    const content = this.content;
    if (content) {
      if (Object.values(life.relationships).some((rel) => rel.kind === 'spouse' || rel.memories.some((m) => m.tag === 'married_you'))) r.honeymoon.married++;
      if (Object.values(life.relationships).some((rel) => rel.memories.some((m) => m.tag === 'honeymoon_together'))) r.honeymoon.taken++;
      r.pensions.lives++;
      const shares = pensionShares(life, content);
      if (shares.length > 0) r.pensions.withRecord++;
      if (shares.length > 1) { r.pensions.multiCountry++; r.pensions.countryRows += shares.length; r.pensions.yearly += benefitFromRecord(life, content); }
      if (shares.filter((x) => x.yearly > 0).length > 1) r.pensions.paidFromTwo++;
    }
    for (const [id, log] of Object.entries(life.eventLog)) if (id.startsWith('travel_')) r.events[id] = (r.events[id] ?? 0) + log.count;
  }
}
export function formatTravel(r: TravelReport, content: ContentBundle): string[] {
  const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(2)}%` : 'n/a';
  const t = r.totals;
  return [
    '\nTravel & time abroad (W5)',
    `  Trips: ${t.trips}; ${(t.trips / Math.max(1, r.lives)).toFixed(3)} per life; lives with a trip ${pct(r.traveledLives, r.lives)}`,
    ...Object.entries(t.destinations).sort().map(([id, n]) => `  ${content.destinations[id]?.name ?? id}: ${n} trips/stays`),
    `  Encounters: ${t.encounters}; holiday relationships begun: ${t.romances}; travel-contact observations at distance ${r.contactsAtDistance}/${r.contactObservations}`,
    `  Study abroad: ${t.study} stays in ${r.studyLives} lives (${pct(r.studyLives, r.lives)}); temporary work: ${t.work} stays in ${r.workLives} lives (${pct(r.workLives, r.lives)}); returns: ${t.returns}; host years: ${r.stayYears}`,
    `  Up-front trip/stay costs: ${t.spent} base units; trip happiness change ${t.happiness}, stress change ${t.stress}; immersion skill points ${t.immersion}; affection points lost to distance ${t.distanceLost}`,
    `  Exchange GPA observations: ${r.studyGrades.observations}; mean before ${r.studyGrades.observations ? (r.studyGrades.before / r.studyGrades.observations).toFixed(2) : 'n/a'}, after ${r.studyGrades.observations ? (r.studyGrades.after / r.studyGrades.observations).toFixed(2) : 'n/a'}; host-year gross income ${r.hostIncome} base units`,
    `  Travel stories reached: ${Object.keys(r.events).length}; events: ${JSON.stringify(r.events)}`,
    ...formatTravelBatch10(r),
    '  Rates follow the simulated travel policy; grade comparisons are observations, not causal estimates.',
  ];
}

/** Batch 10: trips by kind and activity, honeymoons, families on stays, locals' names, pensions across countries. */
export function formatTravelBatch10(r: TravelReport): string[] {
  const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(2)}%` : 'n/a';
  const t = r.totals;
  const list = (rec: Record<string, number>, lives: Record<string, number>) => Object.keys(rec).sort().map((id) => `${id} ${rec[id]} (${lives[id] ?? 0} lives)`).join(', ') || 'none';
  const f = r.family; const p = r.pensions;
  return [
    '  Batch 10 — kinds of trip, activities and souvenirs',
    `    Trips by kind: ${list(t.styles, r.styleLives)}`,
    `    Trips by activity: ${list(t.activities, r.activityLives)}`,
    `    Souvenirs: ${list(t.souvenirs, r.souvenirLives)}; business allowance paid ${t.perDiem} base units`,
    `    Honeymoons: ${r.honeymoon.taken} lives took one of ${r.honeymoon.married} lives that married (${pct(r.honeymoon.taken, r.honeymoon.married)})`,
    `    Families on temporary stays: ${t.familyStays} stays with ${t.familyMembers} family members; ${f.stayYears} host years; children ${f.childYearsAtHost}/${f.childYears} child-years in the host city; partners ${f.partnerAtHost}/${f.partnerYears}; children left behind on return (must be 0): ${f.childrenLeftBehind}`,
    `    Pensions across countries: ${p.withRecord} lives with a record, ${p.multiCountry} with years in more than one country (${pct(p.multiCountry, Math.max(1, p.withRecord))}), ${p.paidFromTwo} owed benefits by two or more; mean yearly benefit of those ${p.multiCountry ? Math.round(p.yearly / p.multiCountry) : 'n/a'} base units`,
  ];
}

/** Batch 10: the shares of lives by kind of trip, and the family and pension rules. */
export function travelTargets(report: { travel: TravelReport; lives: number }, content: ContentBundle): { label: string; value: string; short: string; goal: string; met: boolean }[] {
  const t = content.balance.targets.travelB10;
  const r = report.travel;
  const out: { label: string; value: string; short: string; goal: string; met: boolean }[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const real = destinations(content);
  range('destinations reached (share of all)', share(real.filter((d) => (r.totals.destinations[d.id] ?? 0) > 0).length, real.length), t.destinationsUsed);
  range('married lives that took a honeymoon', share(r.honeymoon.taken, r.honeymoon.married), t.honeymoonTaken);
  range('lives with a cruise', share(r.styleLives.cruise ?? 0, r.lives), t.cruiseLives);
  range('lives with a trip with friends', share(r.styleLives.group ?? 0, r.lives), t.groupLives);
  range('lives with a business trip', share(r.styleLives.business ?? 0, r.lives), t.businessLives);
  range('lives with a souvenir', share(Object.values(r.souvenirLives).reduce((a, n) => a + n, 0) > 0 ? r.lives - Math.max(0, r.lives - Math.max(...Object.values(r.souvenirLives))) : 0, r.lives), t.souvenirLives);
  range('lives with a planned activity', share(Math.max(0, ...Object.values(r.activityLives)), r.lives), t.activityLives);
  range('stays with a family along', r.totals.familyStays, t.familyStays, (n) => n.toFixed(0));
  range('child-years in the host city, of the children who came (must be all)', share(r.family.childYearsAtHost, r.family.childYears) || 1, t.familyAtHost);
  range('children left behind on return (must be none)', r.family.childrenLeftBehind, t.childrenLeftBehind, (n) => n.toFixed(0));
  range('lives with a pension record from more than one country', share(r.pensions.multiCountry, Math.max(1, r.pensions.withRecord)), t.multiCountryPension, (n) => n.toFixed(4));
  return out;
}
