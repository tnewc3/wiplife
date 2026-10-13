/** W5: observed trips/stays and engine effects, with a seeded travel policy. */
import type { ContentBundle } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { isLifeActionAvailable } from '../../src/engine/actions';
import { destinations, travelCompanions } from '../../src/engine/travel/travel';
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
}
export const emptyTravelReport = (): TravelReport => ({ lives: 0, traveledLives: 0, studyLives: 0, workLives: 0, totals: emptyTravel().totals, contactsAtDistance: 0, contactObservations: 0, stayYears: 0, studyGrades: { before: 0, after: 0, observations: 0 }, hostIncome: 0, events: {} });
export function chooseTravelAction(life: LifeState, content: ContentBundle): readonly [LifeActionId, LifeActionParams] | null {
  const rng = createRng(`${life.seed}:${life.currentYear}:travel-policy`);
  const policy = content.balance.travel.simulation;
  const ds = destinations(content);
  const study = life.education.current?.program === 'college';
  if (chance(rng, study ? policy.studyChance : policy.workChance)) {
    const route: Residence['route'] = study ? pick(rng, ['semester', 'year'] as const) : life.career.job ? 'transfer' : 'working_holiday';
    const action = study ? 'study_abroad' : 'work_abroad';
    const options = ds.map((d) => ({ stay: { destinationId: d.id, route } })).filter((params) => isLifeActionAvailable(life, action, params, content));
    if (options.length) return [action, pick(rng, options)];
  }
  if (!chance(rng, policy.tripChance)) return null;
  const circle = travelCompanions(life);
  const companions = circle.length && chance(rng, policy.companionChance) ? [pick(rng, circle)] : [];
  const budget = pick(rng, ['budget', 'comfortable', 'splurge'] as const);
  const options = ds.map((d) => ({ trip: { destinationId: d.id, budget, companions } })).filter((params) => isLifeActionAvailable(life, 'plan_trip', params, content));
  return options.length ? ['plan_trip', pick(rng, options)] : null;
}
export class TravelWatcher {
  constructor(private readonly report: TravelReport) {}
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
    for (const p of Object.values(after.people)) if (p.alive && p.tags.includes('met_abroad') && after.relationships[p.id]?.status === 'active') {
      r.contactObservations++;
      if (p.cityId !== after.character.cityId) r.contactsAtDistance++;
    }
  }
  finish(life: LifeState): void {
    const r = this.report; const t = life.travel.totals;
    r.lives++; if (t.trips) r.traveledLives++; if (t.study) r.studyLives++; if (t.work) r.workLives++;
    for (const key of Object.keys(t) as (keyof typeof t)[]) {
      if (key === 'destinations') { for (const [id, n] of Object.entries(t.destinations)) r.totals.destinations[id] = (r.totals.destinations[id] ?? 0) + n; }
      else r.totals[key] += t[key];
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
    '  Rates follow the simulated travel policy; grade comparisons are observations, not causal estimates.',
  ];
}
