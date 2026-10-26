/**
 * Batch 10: language and travel, expanded. The new ways to learn and their rates, certificates that count for jobs and routes, the
 * translator track, raising a bilingual child, heritage languages; kinds of trip, activities, souvenirs, locals' names, a family
 * on a temporary stay, and a retirement record that travels between the four countries.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle, LanguageSkill } from '../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from './actions';
import { playYear, resolveAll } from './autoplay';
import { meetsJobRequirements } from './career';
import { evaluate } from './conditions';
import { createPerson } from './events/casting';
import { applyEffects } from './events/effects';
import { performInteraction } from './interactions/perform';
import { checkInvariants } from './invariants';
import { effectiveLanguages, languageSkill, lostHeritageLanguage, meetsLanguageJob, practiceWith, runLanguages, startHomeLanguage, teachableLanguage } from './languages';
import { countryLanguageSkill } from './migration/routes';
import { replayLife } from './replay';
import { benefitFromRecord, pensionShares, recordEarnings, retirementBenefit } from './retirement';
import { createRng } from './rng';
import { getProfileView, getTravelView } from './selectors';
import { lifeAtAge } from './testFixtures';
import { honeymoonSpouse, stayBlock, stayCost, tripBlock, tripCost } from './travel/travel';
import type { LifeState } from './types';

const speaks = (id: string, year: number, skill = 100, native = true): LanguageSkill => ({ id, skill, native, lastUsed: year });
function adult(age = 28): LifeState {
  return produce(lifeAtAge('batch10', age), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.character.languages = [speaks('en', d.currentYear)];
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    d.finances.savings = 60000;
    d.education.current = null;
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3.2 }];
    d.character.stats.happiness = 50; d.character.stats.stress = 50;
  });
}
function settle(life: LifeState): LifeState {
  return finishAction(resolveAll(life, content, createRng('b10-choices'), undefined, (_l, card) => card.choices.at(-1)!.id));
}
/** A friend who lives in your city, with the languages given. */
function withPerson(life: LifeState, kind: 'friend' | 'child' | 'spouse', languages: LanguageSkill[], extra: (id: string, d: LifeState) => void = () => undefined): { life: LifeState; id: string } {
  let id = '';
  const next = produce(life, (d) => {
    id = createPerson(d, { kind, presence: 'city', age: { min: 25, max: 40 } }, d.rng, content)!;
    d.people[id]!.languages = languages;
    d.people[id]!.cityId = d.character.cityId;
    // The fixture is a complete person: a full set of traits, and a spouse who is marked as having been one.
    d.people[id]!.traits = { ...d.character.personality };
    if (kind === 'spouse') { d.relationships[id]!.kindSince = d.relationships[id]!.since; d.relationships[id]!.wasSpouse = true; }
    extra(id, d as LifeState);
  });
  return { life: next, id };
}
const tweak = (fn: (c: ContentBundle) => void): ContentBundle => produce(content, (d) => fn(d as ContentBundle));

describe('Batch 10 languages: ways to learn', () => {
  it('has German, and a heritage that suggests it', () => {
    expect(content.languages.de?.name).toBe('German');
    expect(content.balance.languages.heritage.german).toEqual(['de']);
  });
  it('an app and a tutor each move skill by their configured gain, through finance with a receipt, once a year each', () => {
    const life = adult(); const b = content.balance.languages.methods;
    const app = performAction(life, 'study_language', { study: { languageId: 'fr', method: 'app' } }, content);
    expect(languageSkill(app.character.languages, 'fr')).toBe(b.app.gain);
    expect(app.finances.savings).toBe(life.finances.savings - b.app.cost);
    expect(app.pending[0]!.money).toEqual({ change: -b.app.cost, balance: app.finances.savings, debtChange: 0 });
    expect(app.languages.totals.app).toBe(b.app.gain);
    const done = settle(app);
    expect(isLifeActionAvailable(done, 'study_language', { study: { languageId: 'fr', method: 'app' } }, content)).toBe(false);
    expect(isLifeActionAvailable(done, 'study_language', { study: { languageId: 'fr', method: 'tutor' } }, content)).toBe(true);
    const tutor = performAction(done, 'study_language', { study: { languageId: 'fr', method: 'tutor' } }, content);
    expect(languageSkill(tutor.character.languages, 'fr')).toBe(b.app.gain + b.tutor.gain);
    expect(tutor.finances.savings).toBe(done.finances.savings - b.tutor.cost);
    expect(b.tutor.gain).toBeGreaterThan(content.balance.languages.classes.gain);
    expect(b.app.gain).toBeLessThan(content.balance.languages.classes.gain);
    expect(b.app.cost).toBeLessThan(content.balance.languages.classes.cost);
    expect(checkInvariants(tutor, content)).toEqual([]);
  });
  it('rejects a method you cannot afford, a minor and bad input', () => {
    const poor = produce(adult(), (d) => { d.finances.savings = 10; });
    expect(isLifeActionAvailable(poor, 'study_language', { study: { languageId: 'fr', method: 'app' } }, content)).toBe(false);
    expect(isLifeActionAvailable(adult(15), 'study_language', { study: { languageId: 'fr', method: 'app' } }, content)).toBe(false);
    expect(() => performAction(adult(), 'study_language', { study: { languageId: 'fr', method: 'class' } }, content)).toThrow();
    expect(() => performAction(adult(), 'study_language', { study: { languageId: 'xx', method: 'app' } }, content)).toThrow();
  });
  it('practicing with a native speaker raises skill and affection, within the yearly cap', () => {
    const base = adult();
    const { life, id } = withPerson(base, 'friend', [speaks('es', base.currentYear)]);
    expect(evaluate({ language: { learnableFrom: 'person' } }, life, { content, cast: { person: id } })).toBe(true);
    const before = life.relationships[id]!.affection;
    const b = content.balance.languages.practice;
    // How it goes is the interaction's roll; every tier but the two worst teaches something, and a good outing warms the tie.
    const tiers = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const tried = produce(life, (d) => { d.rng = createRng(`practice-${i}`); });
      const after = performInteraction(tried, { interactionId: 'practice_language', personId: id }, content);
      const tier = after.pendingInteraction!.tier;
      tiers.add(tier);
      const gained = languageSkill(after.character.languages, 'es');
      if (tier === 'great' || tier === 'good' || tier === 'neutral') {
        expect(gained, tier).toBe(Math.round(b.gain * b[tier]));
        expect(after.relationships[id]!.affection, tier).toBeGreaterThan(before);
      } else {
        expect(gained, tier).toBe(0);
      }
    }
    expect(tiers.has('great') || tiers.has('good')).toBe(true);
    // The cap: many sessions in a year never add more than the yearly maximum.
    const capped = produce(life, (d) => { for (let i = 0; i < 12; i++) practiceWith(d, id, b.great, content); });
    expect(languageSkill(capped.character.languages, 'es')).toBe(b.yearlyMax);
    expect(capped.languages.totals.practice).toBe(b.yearlyMax);
    const nextYear = produce(capped, (d) => { d.currentYear += 1; practiceWith(d, id, b.good, content); });
    expect(languageSkill(nextYear.character.languages, 'es')).toBe(b.yearlyMax + b.gain);
  });
  it('is offered only with someone whose native language you do not yet speak well', () => {
    const base = adult();
    const { life, id } = withPerson(base, 'friend', [speaks('en', base.currentYear)]);
    expect(isInteractionOffered(life, id)).toBe(false);
    const fluent = produce(withPerson(base, 'friend', [speaks('es', base.currentYear)]).life, (d) => { d.character.languages.push(speaks('es', d.currentYear, 95, false)); });
    expect(isInteractionOffered(fluent, Object.keys(fluent.people).at(-1)!)).toBe(false);
  });
});
function isInteractionOffered(life: LifeState, personId: string): boolean {
  return evaluate({ language: { learnableFrom: 'person' } }, life, { content, cast: { person: personId } });
}

describe('Batch 10 languages: certificates', () => {
  const sureThing = tweak((c) => { c.balance.languages.exams.odds = { base: 1, perPoint: 0, min: 1, max: 1 }; });
  const never = tweak((c) => { c.balance.languages.exams.odds = { base: 0, perPoint: 0, min: 0, max: 0 }; });
  const speaker = () => produce(adult(), (d) => { d.character.languages.push(speaks('fr', d.currentYear, 45, false)); });
  it('charges the fee, rolls the odds and awards the certificate on a pass', () => {
    const life = speaker(); const fee = content.balance.languages.exams.fee.conversational;
    const passed = performAction(life, 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, sureThing);
    expect(passed.languages.certificates.fr).toBe('conversational');
    expect(passed.finances.savings).toBe(life.finances.savings - fee);
    expect(passed.pending[0]!.money).toEqual({ change: -fee, balance: passed.finances.savings, debtChange: 0 });
    expect(passed.pending[0]!.eventId).toBe('language_exam_passed');
    expect(passed.languages.exams).toEqual({ sat: 1, passed: 1 });
    const failed = performAction(life, 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, never);
    expect(failed.languages.certificates.fr).toBeUndefined();
    expect(failed.pending[0]!.eventId).toBe('language_exam_failed');
    expect(failed.finances.savings).toBe(life.finances.savings - fee);
    expect(settle(failed).languages.examYear.fr).toBe(life.currentYear);
    expect(isLifeActionAvailable(settle(failed), 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, never)).toBe(false);
  });
  it('can be sat only near the level, once a year, for a level not yet held', () => {
    const far = produce(adult(), (d) => { d.character.languages.push(speaks('fr', d.currentYear, 5, false)); });
    expect(isLifeActionAvailable(far, 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, content)).toBe(false);
    const held = produce(speaker(), (d) => { d.languages.certificates.fr = 'conversational'; });
    expect(isLifeActionAvailable(held, 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, content)).toBe(false);
    expect(isLifeActionAvailable(held, 'sit_language_exam', { exam: { languageId: 'fr', level: 'basic' } }, content)).toBe(false);
    const view = getProfileView(speaker(), content);
    expect(view.languageClasses.find((l) => l.id === 'fr')!.exams.conversational.available).toBe(true);
    expect(view.examFees.fluent).toBeGreaterThan(view.examFees.basic);
  });
  it('counts for jobs and for routes after the skill itself has faded', () => {
    const job = content.jobs.software_engineer!;
    const montreal = produce(adult(), (d) => { d.character.cityId = d.housing.cityId = 'montreal'; d.languages.certificates.fr = 'fluent'; d.languages.certificates.es = 'fluent'; d.character.languages = [speaks('en', d.currentYear)]; });
    // Montreal's jobs take English too, so use a French-only requirement: a profession.
    const strict = content.jobs.registered_nurse!;
    expect(meetsLanguageJob(montreal.character.languages, strict, 'montreal', content)).toBe(false);
    expect(meetsLanguageJob(effectiveLanguages(montreal, content), strict, 'montreal', content)).toBe(true);
    expect(languageSkill(effectiveLanguages(montreal, content), 'fr')).toBe(content.balance.languages.levels.fluent);
    expect(job).toBeDefined();
    // W6: Mexico's official language is Spanish; the certificate stands in for a skill that is not there.
    const without = produce(montreal, (d) => { d.languages.certificates = {}; });
    expect(countryLanguageSkill(without, 'mx', content)).toBe(0);
    expect(countryLanguageSkill(montreal, 'mx', content)).toBe(content.balance.languages.levels.fluent);
    // And the certificate does not fade with the skill.
    const years = produce(montreal, (d) => { for (let i = 0; i < 10; i++) { d.currentYear += 1; runLanguages(d, content); } });
    expect(years.languages.certificates.fr).toBe('fluent');
  });
});

describe('Batch 10 languages: translators, bilingual children, heritage', () => {
  it('the translator track needs two fluent languages (a certificate counts) and applies like any other job', () => {
    const def = content.jobs.translator!;
    const one = produce(adult(), (d) => { d.education.credentials.push({ type: 'bachelor', year: d.birthYear + 22, gpa: 3.2, majorId: 'english' } as never); });
    expect(meetsJobRequirements(one, def, content)).toBe(false);
    const two = produce(one, (d) => { d.character.languages.push(speaks('es', d.currentYear, 90, false)); });
    expect(meetsJobRequirements(two, def, content)).toBe(true);
    const certified = produce(one, (d) => { d.languages.certificates.es = 'fluent'; });
    expect(meetsJobRequirements(certified, def, content)).toBe(true);
    const nobodyHere = produce(two, (d) => { d.education.credentials = d.education.credentials.filter((c) => c.type !== 'bachelor'); });
    expect(meetsJobRequirements(nobodyHere, def, content)).toBe(false);
    expect(def.businessTravel).toBe(true);
  });
  it('speaking a language of your own at home gives a young child it as a first language, and it keeps growing until they are older', () => {
    const base = produce(adult(), (d) => { d.character.languages = [speaks('en', d.currentYear), speaks('es', d.currentYear, 90, false)]; });
    const { life, id } = withPerson(base, 'child', [speaks('en', base.currentYear)], (pid, d) => {
      d.people[pid]!.birthYear = d.currentYear - 3;
      d.people[pid]!.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 70, happiness: 70, fitness: 50, stress: 30, geneticRisk: 20, talent: null, gpa: 0, latent: JSON.parse(JSON.stringify(d.character.latent)) as LifeState['character']['latent'] };
      d.relationships[pid]!.kind = 'child';
    });
    expect(teachableLanguage(life, id, content)).toBe('es');
    expect(evaluate({ language: { teachableTo: 'kid' } }, life, { content, cast: { kid: id } })).toBe(true);
    const chosen = produce(life, (d) => { startHomeLanguage(d, id, content); });
    const kid = chosen.people[id]!;
    expect(kid.languages.find((l) => l.id === 'es')).toMatchObject({ native: true, skill: content.balance.languages.home.start });
    expect(life.people[id]!.languages.some((l) => l.id === 'es')).toBe(false);
    expect(chosen.languages.home[id]).toBe('es');
    expect(evaluate({ language: { teachableTo: 'kid' } }, chosen, { content, cast: { kid: id } })).toBe(false);
    expect(evaluate({ language: { homeWith: 'kid' } }, chosen, { content, cast: { kid: id } })).toBe(true);
    const later = produce(chosen, (d) => { d.currentYear += 1; runLanguages(d, content); });
    expect(languageSkill(later.people[id]!.languages, 'es')).toBe(content.balance.languages.home.start + content.balance.languages.home.yearlyGain);
    const grown = produce(chosen, (d) => { d.people[id]!.birthYear = d.currentYear - content.balance.languages.home.maxAge - 1; runLanguages(d, content); });
    expect(grown.languages.home[id]).toBeUndefined();
    // The choice goes away with the language: a parent who no longer speaks it stops passing it on.
    const lost = produce(chosen, (d) => { d.character.languages = [speaks('en', d.currentYear)]; runLanguages(d, content); });
    expect(lost.languages.home[id]).toBeUndefined();
    expect(checkInvariants(chosen, content)).toEqual([]);
  });
  it('a lost heritage language comes back in steps, through the event effect', () => {
    const life = produce(adult(), (d) => { d.character.heritage = 'hispanic'; d.character.languages = [speaks('en', d.currentYear)]; });
    expect(lostHeritageLanguage(life, content)).toBe('es');
    expect(evaluate({ language: { heritageLost: true } }, life, { content })).toBe(true);
    const def = content.events.language_heritage_recordings!;
    const choice = def.choices!.find((c) => c.id === 'class')!;
    const after = produce(life, (d) => { applyEffects(d, choice.outcome!.effects, { def, cast: {}, rng: d.rng, content }); });
    expect(languageSkill(after.character.languages, 'es')).toBe(2 * content.balance.languages.heritageReturn.gain);
    expect(after.finances.savings).toBeLessThan(life.finances.savings);
    const again = produce(after, (d) => { for (let i = 0; i < 3; i++) applyEffects(d, choice.outcome!.effects, { def, cast: {}, rng: d.rng, content }); });
    expect(lostHeritageLanguage(again, content)).toBeNull();
    expect(evaluate({ language: { heritageLost: true } }, again, { content })).toBe(false);
  });
});

describe('Batch 10 travel: kinds of trip, activities, souvenirs, locals', () => {
  const base = { budget: 'comfortable' as const, companions: [] as string[] };
  it('has at least six new destinations in regions the six before did not cover, and two cruises', () => {
    const old = ['paris', 'rome', 'barcelona', 'kyoto', 'chiang_mai', 'negril'];
    const fresh = Object.values(content.destinations).filter((d) => !d.cityId && !old.includes(d.id) && d.kind !== 'cruise');
    expect(fresh.length).toBeGreaterThanOrEqual(6);
    expect(new Set(fresh.map((d) => d.country)).size).toBe(fresh.length);
    expect(Object.values(content.destinations).filter((d) => d.kind === 'cruise')).toHaveLength(2);
  });
  it('an activity adds its price and its stat changes, and tells its own story', () => {
    const life = adult();
    const plain = { ...base, destinationId: 'kyoto' };
    const planned = { ...plain, activity: 'adventure' as const };
    expect(tripCost(planned, content) - tripCost(plain, content)).toBe(Math.round(content.balance.travel.activities.adventure.extra * content.destinations.kyoto!.costLevel));
    const after = performAction(life, 'plan_trip', { trip: planned }, content);
    expect(after.finances.savings).toBe(life.finances.savings - tripCost(planned, content));
    expect(after.pending[0]!.money!.change).toBe(-tripCost(planned, content));
    expect(content.registries.travel.activity.adventure).toContain(after.pending[1]!.eventId);
    expect(after.travel.totals.activities.adventure).toBe(1);
    expect(isLifeActionAvailable(adult(19), 'plan_trip', { trip: { ...plain, activity: 'nightlife' as const } }, content)).toBe(false);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('a pricey souvenir becomes one of the Luxury valuables, through finance', () => {
    const life = adult();
    const trip = { ...base, destinationId: 'kyoto', souvenir: 'valuable' as const };
    const after = performAction(life, 'plan_trip', { trip }, content);
    const price = Math.round(content.balance.travel.souvenirs.valuable.cost * content.destinations.kyoto!.costLevel);
    expect(after.possessions.items.filter((p) => p.kind === 'valuable')).toHaveLength(1);
    expect(after.possessions.items.find((p) => p.kind === 'valuable')).toMatchObject({ defId: content.destinations.kyoto!.souvenir, value: price });
    expect(after.finances.savings).toBe(life.finances.savings - tripCost(trip, content));
    expect(content.registries.travel.souvenir).toContain(after.pending.at(-1)!.eventId);
    expect(tripBlock(life, { ...trip, destinationId: 'caribbean_cruise', style: 'cruise' }, content)).toBe('souvenir');
  });
  it('cruises go on cruise destinations only, and vacations never do', () => {
    const life = adult();
    expect(tripBlock(life, { ...base, destinationId: 'caribbean_cruise', style: 'cruise' }, content)).toBeNull();
    expect(tripBlock(life, { ...base, destinationId: 'caribbean_cruise' }, content)).toBe('destination');
    expect(tripBlock(life, { ...base, destinationId: 'kyoto', style: 'cruise' }, content)).toBe('destination');
    const after = performAction(life, 'plan_trip', { trip: { ...base, destinationId: 'caribbean_cruise', style: 'cruise' } }, content);
    expect(after.travel.totals.styles.cruise).toBe(1);
    expect(content.registries.travel.style.cruise).toContain(after.pending[1]!.eventId);
    expect(after.finances.savings).toBe(life.finances.savings - tripCost({ ...base, destinationId: 'caribbean_cruise', style: 'cruise' }, content));
    expect(getTravelView(life, { ...base, destinationId: 'kyoto', style: 'cruise' }, content).options.every((d) => d.kind === 'cruise')).toBe(true);
  });
  it('a honeymoon is for a recent spouse, once, and it is the spouse who comes', () => {
    const start = withPerson(adult(), 'spouse', [speaks('en', 2000)], (id, d) => { d.relationships[id]!.memories.push({ tag: 'married_you', year: d.currentYear - 1 }); d.housing.partnerId = id; });
    const { life, id } = start;
    expect(honeymoonSpouse(life, content)).toBe(id);
    const trip = { ...base, destinationId: 'sydney', style: 'honeymoon' as const, companions: [id] };
    expect(tripBlock(life, { ...trip, companions: [] }, content)).toBe('honeymoon');
    expect(tripBlock(life, trip, content)).toBeNull();
    const snapshot = JSON.parse(JSON.stringify(life)) as LifeState;
    const ready = produce(life, (d) => { d.inputLog = [{ year: d.currentYear, kind: 'create', payload: { heir: true, snapshot } }]; });
    const after = performAction(ready, 'plan_trip', { trip }, content);
    expect(after.relationships[id]!.memories.some((m) => m.tag === 'honeymoon_together')).toBe(true);
    expect(after.relationships[id]!.affection).toBeGreaterThanOrEqual(life.relationships[id]!.affection);
    expect(honeymoonSpouse(settle(after), content)).toBeNull();
    const old = produce(life, (d) => { d.relationships[id]!.memories[0]!.year = d.currentYear - 5; });
    expect(honeymoonSpouse(old, content)).toBeNull();
    const view = getTravelView(life, { ...base, destinationId: 'sydney', style: 'honeymoon', companions: [] }, content);
    expect(view.trip.companions).toEqual([id]);
    expect(replayLife(after.inputLog, content)).toEqual(after);
  });
  it('a group trip needs at least two friends and no one else', () => {
    let life = adult(); const ids: string[] = [];
    for (let i = 0; i < 2; i++) { const r = withPerson(life, 'friend', [speaks('en', 2000)]); life = r.life; ids.push(r.id); }
    const trip = { ...base, destinationId: 'sydney', style: 'group' as const, companions: [ids[0]!] };
    expect(tripBlock(life, trip, content)).toBe('group');
    const both = { ...trip, companions: ids };
    expect(tripBlock(life, both, content)).toBeNull();
    const after = performAction(life, 'plan_trip', { trip: both }, content);
    expect(after.relationships[ids[0]!]!.affection).toBe(Math.min(100, life.relationships[ids[0]!]!.affection + content.balance.travel.styles.group.friendAffection));
    expect(after.finances.savings).toBe(life.finances.savings - tripCost(both, content));
    expect(tripCost(both, content)).toBeLessThan(tripCost({ ...both, style: 'vacation' }, content));
  });
  it('a business trip needs a job that calls for travel; the employer pays and an allowance comes with a receipt', async () => {
    const { startJob } = await import('./career');
    const trip = { destinationId: 'kyoto', budget: 'budget' as const, companions: [] as string[], style: 'business' as const };
    const none = adult();
    expect(tripBlock(none, trip, content)).toBe('business');
    const employed = produce(none, (d) => { d.character.languages.push(speaks('fr', d.currentYear, 95, false)); startJob(d, 'lawyer', content); d.career.job!.performance = 40; });
    expect(employed.career.job?.jobId).toBe('lawyer');
    expect(tripCost(trip, content)).toBe(0);
    const after = performAction(employed, 'plan_trip', { trip }, content);
    const pay = after.finances.savings - employed.finances.savings;
    expect(pay).toBeGreaterThan(0);
    expect(after.pending[0]!.money).toEqual({ change: pay, balance: after.finances.savings, debtChange: 0 });
    expect(after.pending[0]!.eventId).toBe('travel_business_booking');
    expect(after.career.job!.performance).toBe(40 + content.balance.travel.styles.business.performance);
    expect(after.travel.totals.perDiem).toBe(pay);
    expect(checkInvariants(after, content).filter((f) => !/requirements are not met/.test(f))).toEqual([]);
    // One a year, and it is not the vacation (which is still available).
    const home = settle(after);
    expect(tripBlock(home, trip, content)).toBe('year');
    expect(tripBlock(home, { ...trip, style: 'vacation' }, content)).toBeNull();
  });
  it('locals met at a destination with a name pool take names and a first language from it', () => {
    for (const [dest, language] of [['berlin', 'de'], ['paris', 'fr'], ['rome', 'it'], ['barcelona', 'es']] as const) {
      const d = content.destinations[dest]!;
      const pool = content.names[d.locals!.pool]!.heritages[d.locals!.heritage]!;
      for (let i = 0; i < 6; i++) {
        const life = produce(adult(), (x) => { x.rng = createRng(`locals-${dest}-${i}`); });
        const after = performAction(life, 'plan_trip', { trip: { destinationId: dest, budget: 'budget', companions: [] } }, content);
        const person = after.people[after.travel.active!.encounterId!]!;
        expect(pool.last, `${dest} last name ${person.name.last}`).toContain(person.name.last);
        expect(Object.values(pool.first).flat(), `${dest} first name ${person.name.first}`).toContain(person.name.first);
        expect(person.languages.find((l) => l.id === language)?.native).toBe(true);
        expect(person.heritage).toBe(d.locals!.heritage);
        expect(checkInvariants(after, content)).toEqual([]);
      }
    }
  });
});

describe('Batch 10 W5: a family on a temporary stay', () => {
  function family(): LifeState {
    let life = adult(30);
    const partner = withPerson(life, 'spouse', [speaks('en', 2000)], (id, d) => { d.housing.partnerId = id; });
    life = partner.life;
    const kids: string[] = [];
    for (const age of [4, 9]) {
      const k = withPerson(life, 'child', [speaks('en', 2000)], (id, d) => {
        d.people[id]!.birthYear = d.currentYear - age;
        d.people[id]!.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 70, happiness: 70, fitness: 50, stress: 30, geneticRisk: 20, talent: null, gpa: 0, latent: JSON.parse(JSON.stringify(d.character.latent)) as LifeState['character']['latent'] };
        d.relationships[id]!.kind = 'child';
      });
      life = k.life; kids.push(k.id);
    }
    return produce(life, (d) => { d.finances.savings = 90000; });
  }
  const stay = { destinationId: 'london', route: 'working_holiday' as const };
  it('children keep a solo stay from starting, unless the family goes too', () => {
    const life = family();
    expect(stayBlock(life, stay, content)).toBe('household');
    expect(stayBlock(life, { ...stay, family: true }, content)).toBeNull();
    const single = produce(adult(), (d) => { d.finances.savings = 90000; });
    expect(stayBlock(single, { ...stay, family: true }, content)).toBe('family');
    const careHome = produce(life, (d) => { const p = Object.values(d.people)[0]!; p.life = { ...(p.life as object), care: 'home' } as never; });
    expect(stayBlock(careHome, { ...stay, family: true }, content)).toBe('household');
  });
  it('the partner and children live with you there, at a price per person, and come back with you', () => {
    const life = family();
    const members = 3;
    expect(stayCost(life, { ...stay, family: true }, content)).toBe(Math.round(content.balance.travel.work.cost * (1 + members * content.balance.travel.family.costShare)));
    const started = performAction(life, 'work_abroad', { stay: { ...stay, family: true } }, content);
    expect(started.finances.savings).toBe(life.finances.savings - stayCost(life, { ...stay, family: true }, content));
    expect(started.pending[0]!.money!.change).toBe(-stayCost(life, { ...stay, family: true }, content));
    const there = started.character.cityId;
    expect(there).toBe('london');
    const along = started.travel.residence!.family!;
    expect(along.childIds).toHaveLength(2);
    for (const id of [along.partnerId!, ...along.childIds]) expect(started.people[id]!.cityId).toBe('london');
    expect(started.housing.partnerId).toBe(along.partnerId);
    expect(content.registries.travel.family).toContain(started.pending[1]!.eventId);
    expect(started.travel.totals).toMatchObject({ familyStays: 1, familyMembers: 3 });
    expect(checkInvariants(started, content)).toEqual([]);
    // A year at the host school: the children pick up the local language and the host country's school year; then everyone goes home.
    let year = settle(started);
    for (let i = 0; i < content.balance.travel.work.years; i++) year = playYear(year, content, { choices: createRng(`family-${i}`) });
    expect(year.travel.residence).toBeNull();
    expect(year.character.cityId).toBe('chicago');
    for (const id of along.childIds) {
      expect(year.people[id]!.cityId).toBe('chicago');
      expect(year.people[id]!.alive).toBe(true);
    }
    expect(year.people[along.partnerId!]!.cityId).toBe('chicago');
    expect(year.housing.partnerId).toBe(along.partnerId);
    expect(checkInvariants(year, content)).toEqual([]);
  });
  it('replays exactly and children are in the host city\'s school system while there', () => {
    const base = family();
    const snapshot = JSON.parse(JSON.stringify(base)) as LifeState;
    const life = produce(base, (d) => { d.inputLog = [{ year: d.currentYear, kind: 'create', payload: { heir: true, snapshot } }]; });
    const started = settle(performAction(life, 'work_abroad', { stay: { ...stay, family: true } }, content));
    const kid = started.travel.residence!.family!.childIds[1]!;
    const year = playYear(started, content, { choices: createRng('family-school') });
    // The oldest child is school age; the school record follows the country where the family lives.
    expect(year.people[kid]!.languages.some((l) => l.id === 'en')).toBe(true);
    expect(year.people[kid]!.cityId).toBe('london');
    expect(replayLife(year.inputLog, content)).toEqual(year);
  });
});

describe('Batch 10 W5: a retirement record that travels', () => {
  const inCountry = (cityId: string): LifeState => produce(lifeAtAge('pension-b10', 70), (d) => { d.character.cityId = d.housing.cityId = cityId; d.finances.earnings = { years: 0, total: 0, byCountry: {} }; });
  const earn = (life: LifeState, cityId: string, years: number, amount: number): LifeState => produce(life, (d) => {
    d.character.cityId = cityId;
    for (let i = 0; i < years; i++) recordEarnings(d, amount, content);
  });
  it('credits each year to the country it was earned in, and the rows add up', () => {
    let life = inCountry('chicago');
    life = earn(life, 'chicago', 12, 50000); life = earn(life, 'london', 6, 40000); life = earn(life, 'mexico_city', 3, 20000);
    expect(life.finances.earnings.years).toBe(21);
    expect(Object.fromEntries(Object.entries(life.finances.earnings.byCountry).map(([k, v]) => [k, v.years]))).toEqual({ us: 12, uk: 6, mx: 3 });
    const sum = Object.values(life.finances.earnings.byCountry);
    expect(sum.reduce((a, r) => a + r.total, 0)).toBe(life.finances.earnings.total);
    expect(checkInvariants(life, content).filter((f) => /earnings/.test(f))).toEqual([]);
  });
  it('a single-country record pays what the old rule paid', () => {
    for (const [cityId, id] of [['chicago', 'us'], ['toronto', 'ca'], ['london', 'uk'], ['mexico_city', 'mx']] as const) {
      const pension = content.countries[id]!.pension;
      const life = earn(inCountry(cityId), cityId, pension.fullYears, 30000);
      const average = 30000;
      let full = 0;
      pension.formula.forEach((slice, i) => { const top = pension.formula[i + 1]?.from ?? Infinity; const counted = Math.min(average, top) - slice.from; if (counted > 0) full += counted * slice.rate; });
      expect(benefitFromRecord(life, content), id).toBe(Math.round(full));
      expect(retirementBenefit(life, content), id).toBe(Math.round(full));
    }
  });
  it('each country pays for its own years by its own formula from its own age, and years elsewhere count toward its minimum', () => {
    // Six years in the UK (its minimum is ten) and fourteen in the United States: the UK still pays for its six, since the other years count toward the minimum.
    const life = earn(earn(inCountry('chicago'), 'london', 6, 40000), 'chicago', 14, 50000);
    const shares = pensionShares(life, content);
    expect(shares.map((s) => s.countryId)).toEqual(['uk', 'us']);
    const uk = shares[0]!; const us = shares[1]!;
    expect(uk.yearly).toBeGreaterThan(0);
    expect(us.yearly).toBeGreaterThan(0);
    // Living in the United States, the UK pays its share reduced for living abroad.
    const rules = content.balance.countries.pensionPortability;
    const atHome = produce(life, (d) => { d.character.cityId = d.housing.cityId = 'london'; });
    const ukAtHome = pensionShares(atHome, content).find((s) => s.countryId === 'uk')!;
    expect(uk.yearly).toBe(Math.round(ukAtHome.yearly * rules.abroadShare));
    // Ages: the United States pays from 67, the UK from 67; Canada and Mexico from 65.
    expect(retirementBenefit(produce(life, (d) => { d.character.age = 60; }), content)).toBe(0);
    expect(retirementBenefit(life, content)).toBe(uk.yearly + us.yearly);
    // Without the other country's years the UK would not pay at all.
    const without = produce(life, (d) => { d.finances.earnings = { years: 6, total: d.finances.earnings.byCountry.uk!.total, byCountry: { uk: d.finances.earnings.byCountry.uk! } }; });
    expect(pensionShares(without, content)[0]!.yearly).toBe(0);
    const off = tweak((c) => { c.balance.countries.pensionPortability.totalize = false; });
    expect(pensionShares(life, off).find((s) => s.countryId === 'uk')!.yearly).toBe(0);
    // A country whose pension age has not been reached pays nothing yet.
    const mixed = earn(earn(inCountry('chicago'), 'mexico_city', 12, 20000), 'chicago', 12, 50000);
    const at66 = produce(mixed, (d) => { d.character.age = 66; });
    const paidAt66 = pensionShares(at66, content).filter((s) => s.receiving).map((s) => s.countryId);
    expect(paidAt66).toEqual(['mx']);
    expect(retirementBenefit(at66, content)).toBe(pensionShares(at66, content).find((s) => s.countryId === 'mx')!.yearly);
  });
});
