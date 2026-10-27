import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { finishAction, isLifeActionAvailable, performAction } from '../actions';
import { resolveAll, playYear } from '../autoplay';
import { startJob } from '../career';
import { evaluate } from '../conditions';
import { billFor } from '../education';
import { applyEffects } from '../events/effects';
import { checkInvariants } from '../invariants';
import { languageSkill } from '../languages';
import { resolveChoice } from '../life';
import { fitsPresence } from '../presence';
import { replayLife } from '../replay';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { canPlanTrip, destinations, stayBlock, tripCost } from './travel';

const trip = { destinationId: 'montreal', budget: 'comfortable' as const, companions: [] as string[] };
function adult(age = 25): LifeState {
  return produce(lifeAtAge('travel', age), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }];
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    d.finances.savings = 50000;
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3.2 }];
    d.character.stats.happiness = 50; d.character.stats.stress = 50;
  });
}
function student(): LifeState {
  return produce(adult(20), (d) => {
    d.education.current = { program: 'college', majorId: 'computer_science', tier: 'state', year: 2, lengthYears: 4, gpa: 3.2, boost: 0, repeats: 0, scholarship: 0.5, since: d.currentYear - 1 };
  });
}
function settle(life: LifeState): LifeState {
  return finishAction(resolveAll(life, content, createRng('travel-choices'), undefined, (_l, card) => card.choices.at(-1)!.id));
}
describe('W5 travel', () => {
  it('includes every city and light vacation-only places', () => {
    for (const id of Object.keys(content.cities)) expect(destinations(content).some((d) => d.cityId === id)).toBe(true);
    for (const id of ['paris', 'rome', 'barcelona', 'kyoto', 'chiang_mai', 'negril']) expect(content.destinations[id]?.cityId).toBeUndefined();
  });
  it('charges finance once, applies the configured stats, and shows the exact receipt', () => {
    const before = adult(); const cost = tripCost(trip, content);
    const after = performAction(before, 'plan_trip', { trip }, content);
    expect(after.finances.savings).toBe(before.finances.savings - cost);
    expect(after.finances.debts).toEqual(before.finances.debts);
    expect(after.character.stats.happiness).toBe(57); expect(after.character.stats.stress).toBe(45);
    expect(after.pending).toHaveLength(2);
    expect(after.pending[0]!.money).toEqual({ change: -cost, balance: after.finances.savings, debtChange: 0 });
    const shown = resolveChoice(after, after.pending[0]!.instanceId, 'continue', content);
    expect(shown.pending[0]!.money).toEqual(after.pending[0]!.money);
    expect(shown.finances.savings).toBe(after.finances.savings);
    expect(checkInvariants(after, content)).toEqual([]);
    expect(before.travel.totals.trips).toBe(0);
  });
  it('uses the destination country for names and languages and keeps contacts at a distance', () => {
    const after = performAction(adult(), 'plan_trip', { trip }, content);
    const id = after.travel.active!.encounterId!;
    expect(after.people[id]!.cityId).toBe('montreal');
    expect(after.people[id]!.languages.some((l) => l.id === 'fr' && l.native)).toBe(true);
    expect(fitsPresence(after, id, 'elsewhere', content)).toBe(true);
    expect(fitsPresence(after, id, 'nearby', content)).toBe(false);
    const home = settle(after);
    expect(home.travel.residence).toBeNull(); expect(home.travel.active).toBeNull();
    expect(home.people[id]!.cityId).toBe('montreal');
    expect(isLifeActionAvailable(home, 'plan_trip', { trip }, content)).toBe(false);
    expect(languageSkill(home.character.languages, 'fr')).toBe(content.balance.travel.tripImmersion);
  });
  it('keeps stories fitting the vacation-only destination, and its fellow travelers have modeled homes', () => {
    for (let i = 0; i < 20; i++) {
      const life = produce(adult(), (d) => { d.rng = createRng(`dest-${i}`); });
      const after = performAction(life, 'plan_trip', { trip: { ...trip, destinationId: 'kyoto' } }, content);
      const story = content.events[after.pending[1]!.eventId]!;
      expect(evaluate(story.requires, after, { content, cast: after.pending[1]!.cast })).toBe(true);
      expect(story.id).not.toMatch(/paris_river|rome_bookings|negril_coast|chiang_mai_weather|barcelona_water/);
      expect(checkInvariants(after, content)).toEqual([]);
    }
  });
  it('rejects bad input, insufficient savings, duplicate/remote companions, minors and legal restrictions', () => {
    for (const p of [{ trip: { ...trip, budget: 'free' } }, { trip: { ...trip, companions: ['missing'] } }, { trip: { ...trip, companions: ['p1', 'p1'] } }, { trip, extra: true }]) expect(() => performAction(adult(), 'plan_trip', p, content)).toThrow();
    const poor = produce(adult(), (d) => { d.finances.savings = 0; });
    expect(canPlanTrip(poor, trip, content)).toBe(false);
    expect(canPlanTrip(adult(17), trip, content)).toBe(false);
    const probation = produce(adult(), (d) => { d.legal.probationUntil = d.currentYear + 1; });
    expect(canPlanTrip(probation, trip, content)).toBe(false);
  });
  it('prices companions and improves their tie without moving their permanent home', () => {
    const life = adult(); const id = Object.keys(life.relationships).find((id) => life.relationships[id]!.kind === 'parent')!;
    const input = { ...trip, companions: [id] };
    expect(canPlanTrip(life, input, content)).toBe(true);
    const after = performAction(life, 'plan_trip', { trip: input }, content);
    expect(after.travel.active?.romanceId).toBeNull();
    expect(after.finances.savings).toBe(life.finances.savings - tripCost(input, content));
    expect(after.relationships[id]!.affection).toBe(Math.min(100, life.relationships[id]!.affection + content.balance.travel.companionAffection));
    expect(after.people[id]!.cityId).toBe(life.people[id]!.cityId);
  });
  it('holiday romance produces an adult long-distance partner and records its start', () => {
    const life = performAction(adult(), 'plan_trip', { trip }, content);
    const id = life.travel.active!.romanceId!;
    expect(life.currentYear - life.people[id]!.birthYear).toBeGreaterThanOrEqual(18);
    const picked = produce(life, (d) => { d.pending[1]!.eventId = 'travel_romance_last_evening'; });
    let after = resolveChoice(picked, picked.pending[0]!.instanceId, 'continue', content);
    after = resolveChoice(after, after.pending[1]!.instanceId, 'choose', content);
    after = finishAction(after);
    expect(after.relationships[id]!.kind).toBe('partner');
    expect(after.travel.totals.romances).toBe(1);
    expect(fitsPresence(after, id, 'city', content)).toBe(false);
    const minor = produce(after, (d) => { d.people[id]!.birthYear = d.currentYear - 17; });
    expect(checkInvariants(minor, content).some((s) => /under/.test(s))).toBe(true);
  });
  it('exchanges preserve enrollment and home tuition, immerse, strain home ties and return', () => {
    const life = student(); const homeBill = billFor(life, life.education.current!, 0.5, content);
    const started = performAction(life, 'study_abroad', { stay: { destinationId: 'montreal', route: 'year' } }, content);
    expect(started.character.cityId).toBe('montreal');
    expect(started.education.current).toEqual(life.education.current);
    expect(billFor(started, started.education.current!, 0.5, content)).toEqual(homeBill);
    const abroad = settle(started);
    expect(abroad.travel.residence?.type).toBe('student');
    expect(checkInvariants(abroad, content)).toEqual([]);
    const after = playYear(abroad, content, { choices: createRng('exchange-year') });
    expect(after.character.cityId).toBe('chicago'); expect(after.housing.cityId).toBe('chicago');
    expect(after.travel.residence).toBeNull(); expect(after.travel.totals.returns).toBe(1);
    expect(after.travel.totals.distanceLost).toBeGreaterThan(0);
    expect(languageSkill(after.character.languages, 'fr')).toBeGreaterThanOrEqual(content.balance.travel.exchange.yearGain);
    expect(after.education.current?.year).toBe(3);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('rejects vacation-only study/work and study without college', () => {
    expect(stayBlock(student(), { destinationId: 'paris', route: 'year' }, content)).toBe('destination');
    expect(stayBlock(adult(), { destinationId: 'montreal', route: 'year' }, content)).toBe('college');
    expect(() => performAction(student(), 'study_abroad', { stay: { destinationId: 'montreal', route: 'transfer' } }, content)).toThrow();
  });
  it('working holidays use the existing yearly gig ledger and end at home', () => {
    let life = settle(performAction(adult(), 'work_abroad', { stay: { destinationId: 'london', route: 'working_holiday' } }, content));
    expect(life.career.gig).toBe(true);
    for (let i = 0; i < content.balance.travel.work.years; i++) life = playYear(life, content, { choices: createRng(`holiday-${i}`) });
    expect(life.travel.totals.work).toBe(1); expect(life.travel.totals.returns).toBe(1);
    expect(life.character.cityId).toBe('chicago'); expect(life.career.gig).toBe(false);
    expect(life.finances.earnings.years).toBeGreaterThan(0);
    expect(checkInvariants(life, content)).toEqual([]);
  });
  it('ends a temporary stay when an eviction abroad sends you home to family (seed coverage-1972 of the nightly coverage run on 238e0fb)', () => {
    // The nightly run found a transfer worker in London, evicted, who chose "come home" in the eviction event: they were
    // moved in with their parents in Los Angeles but still marked as on a stay in London ("temporary stay is not in host country").
    let life = settle(performAction(adult(), 'work_abroad', { stay: { destinationId: 'london', route: 'working_holiday' } }, content));
    expect(life.travel.residence).not.toBeNull();
    life = produce(life, (d) => { d.housing = { kind: 'homeless', cityId: d.character.cityId, annualCost: 0, since: d.currentYear }; });
    const parent = Object.values(life.relationships).find((r) => r.kind === 'parent' && r.status === 'active' && life.people[r.personId]!.alive);
    expect(parent, 'the fixture has a living parent').toBeDefined();
    const def = content.events.eviction_notice!;
    const after = produce(life, (d) => {
      applyEffects(d, def.choices!.find((c) => c.id === 'home')!.outcome!.effects, { def, cast: { parent: parent!.personId }, rng: d.rng, content });
    });
    expect(after.travel.residence).toBeNull();
    expect(after.travel.totals.returns).toBe(1);
    expect(after.character.cityId).toBe('chicago');
    expect(after.housing.kind).toBe('with_parents');
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('transfers keep a job but not its old office colleagues, with language gating', () => {
    const life = produce(adult(), (d) => { startJob(d, 'retail_associate', content); });
    expect(stayBlock(life, { destinationId: 'montreal', route: 'transfer' }, content)).toBe('job');
    const start = performAction(life, 'work_abroad', { stay: { destinationId: 'london', route: 'transfer' } }, content);
    expect(start.career.job?.jobId).toBe(life.career.job?.jobId);
    const boss = Object.values(life.relationships).find((r) => r.kind === 'boss')!;
    expect(start.relationships[boss.personId]!.kind).toBe('acquaintance');
    expect(start.people[boss.personId]!.cityId).toBe('chicago');
    expect(checkInvariants(start, content)).toEqual([]);
  });
  it('trouble spends through finance, damages health and writes legal consequences', () => {
    const before = adult();
    const after = produce(before, (d) => {
      const def = content.events.travel_arrest!;
      applyEffects(d, def.choices![0]!.outcome!.effects, { def, cast: {}, rng: d.rng, content });
    });
    expect(after.finances.savings).toBeLessThan(before.finances.savings);
    expect(after.legal.record.at(-1)?.offenseId).toBe('disorderly_conduct');
    expect(content.events.travel_injury!.choices![1]!.outcome!.effects.some((e) => e.type === 'stat' && e.key === 'health' && e.delta < 0)).toBe(true);
  });
  it('retains earned-income history when a host country has a lower earnings cap', () => {
    const life = produce(adult(), (d) => { d.finances.earnings = { years: 5, total: 5 * content.countries.us!.pension.earningsCap, byCountry: { us: { years: 5, total: 5 * content.countries.us!.pension.earningsCap } } }; });
    const abroad = performAction(life, 'work_abroad', { stay: { destinationId: 'mexico_city', route: 'working_holiday' } }, content);
    expect(abroad.finances.earnings).toEqual(life.finances.earnings);
    expect(checkInvariants(abroad, content)).toEqual([]);
  });
  it('replays a trip action and its two cards exactly from a saved heir snapshot', () => {
    const before = produce(adult(), (d) => { d.inputLog = []; });
    const snapshot = JSON.parse(JSON.stringify(before)) as LifeState;
    const ready = produce(before, (d) => { d.inputLog = [{ year: d.currentYear, kind: 'create', payload: { heir: true, snapshot } }]; });
    const after = settle(performAction(ready, 'plan_trip', { trip }, content));
    expect(replayLife(after.inputLog, content)).toEqual(after);
  });
});

it('previews all forty travel events and their outcomes in the existing sandbox with four pronoun sets', async () => {
  const { previewEvent, sandboxOutcome } = await import('../sandbox');
  for (const def of Object.values(content.events).filter((e) => e.category === 'travel')) {
    for (const pronouns of ['she_her', 'he_him', 'they_them', 'xe_xem']) {
      const preview = previewEvent(content, { eventId: def.id, seed: `w5-preview-${def.id}`, age: 25, selfPronouns: pronouns, castPronouns: pronouns });
      expect(preview.requirementsMet, def.id).toBe(true);
      expect(preview.consistency, def.id).toEqual([]);
      expect(preview.text, def.id).not.toMatch(/[{}]/);
      for (const choice of preview.choices.filter((c) => c.visible)) expect(sandboxOutcome(preview, choice.id, content), `${def.id}:${choice.id}`).not.toMatch(/[{}]/);
    }
  }
});
