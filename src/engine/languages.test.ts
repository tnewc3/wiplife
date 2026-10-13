import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { conditionSchema, type CountryId, type LanguageSkill } from '../content/schemas';
import { performAction, finishAction, isLifeActionAvailable } from './actions';
import { meetsJobRequirements } from './career';
import { evaluate } from './conditions';
import { createPerson, castEvent } from './events/casting';
import { createLife, resolveChoice } from './life';
import { createRng } from './rng';
import { enrollForAge } from './education';
import { reactionScore } from './interactions/reaction';
import { performInteraction } from './interactions/perform';
import { getEventCard, getProfileView } from './selectors';
import { lifeAtAge } from './testFixtures';
import { checkInvariants } from './invariants';
import { householdLanguages, languageSkill, meetingWeight, meetsLanguageJob, nativeLanguages, runLanguages, sharedLanguage } from './languages';

const speaks = (id: string, year: number, skill = 100, native = true): LanguageSkill => ({ id, skill, native, lastUsed: year });
const adult = () => produce(lifeAtAge('w4b-test', 25), (d) => {
  d.character.cityId = d.housing.cityId = 'chicago';
  d.character.languages = [speaks('en', d.currentYear)];
  d.finances.savings = 10_000;
  d.education.current = null;
});

describe('W4b language backgrounds', () => {
  it('assigns native languages in every country, with household transmission and deterministic creation', () => {
    for (const countryId of ['us', 'ca', 'uk', 'mx'] as CountryId[]) for (let i = 0; i < 20; i++) {
      const input = { mode: 'random' as const, seed: `languages-${countryId}-${i}`, countryId, birthYear: 2026 };
      const life = createLife(input, content);
      expect(createLife(input, content)).toEqual(life);
      expect(life.character.languages.some((l) => l.native)).toBe(true);
      for (const person of Object.values(life.people)) expect(person.languages.some((l) => l.native)).toBe(true);
      const parents = Object.values(life.people).filter((p) => life.relationships[p.id]?.kind === 'parent');
      for (const p of parents) for (const l of p.languages) if (l.native) expect(life.character.languages).toContainEqual(l);
      expect(checkInvariants(life, content)).toEqual([]);
    }
  });
  it('uses Montreal French, Mexican Spanish, and family heritage without equating ancestry with language', () => {
    const forced = produce(content, (d) => { d.balance.languages.heritageChance = 1; d.balance.languages.bilingualChance = {}; });
    const family = nativeLanguages('houston', 'hispanic', 2026, createRng('heritage'), forced);
    expect(family.map((l) => l.id)).toEqual(['en', 'es']);
    expect(nativeLanguages('montreal', 'general', 2026, createRng('fr'), forced).map((l) => l.id)).toEqual(['fr']);
    expect(nativeLanguages('mexico_city', 'general', 2026, createRng('es'), forced).map((l) => l.id)).toEqual(['es']);
    expect(householdLanguages('chicago', [{ languages: family }], 2026, forced).map((l) => l.id)).toEqual(['en', 'es']);
    const noHeritage = produce(forced, (d) => { d.balance.languages.heritageChance = 0; });
    expect(nativeLanguages('houston', 'hispanic', 2026, createRng('heritage'), noHeritage).map((l) => l.id)).toEqual(['en']);
  });
  it('assigns language backgrounds to newly created contacts', () => {
    const life = produce(adult(), (d) => { createPerson(d, { kind: 'friend', age: { min: 25, max: 25 }, presence: 'city' }, d.rng, content); });
    expect(Object.values(life.people).at(-1)!.languages.some((l) => l.native)).toBe(true);
  });
});

describe('learning and fading', () => {
  it('uses the school and immersion rates, and teaches school-age people too', () => {
    const life = produce(lifeAtAge('languages-school', 12), (d) => {
      d.character.cityId = 'chicago'; d.character.languages = [speaks('en', d.currentYear)];
      enrollForAge(d, content);
      const p = Object.values(d.people)[0]!; p.birthYear = d.currentYear - 12; p.languages = [speaks('en', d.currentYear)]; p.cityId = 'chicago';
      runLanguages(d, content);
    });
    expect(languageSkill(life.character.languages, life.languages.schoolId!)).toBe(content.balance.languages.school.gain);
    expect(Object.values(life.people)[0]!.languages.some((l) => !l.native && l.skill === content.balance.languages.school.gain)).toBe(true);
  });
  it('gains the local language on a move and fades unused languages slowly, preserving native flags', () => {
    const life = produce(adult(), (d) => {
      d.character.cityId = 'montreal'; d.housing.kind = 'renting';
      d.character.languages = [speaks('en', d.currentYear), speaks('es', d.currentYear - 10, 60, false)];
      runLanguages(d, content);
    });
    expect(languageSkill(life.character.languages, 'fr')).toBe(content.balance.languages.immersion.gain);
    expect(languageSkill(life.character.languages, 'es')).toBe(60 - content.balance.languages.fading.loss);
    expect(life.languages.totals.immersion).toBe(content.balance.languages.immersion.gain);
    const floor = produce(life, (d) => { d.character.languages = [speaks('en', d.currentYear - 20, content.balance.languages.fading.nativeFloor)]; runLanguages(d, content); });
    expect(floor.character.languages.find((l) => l.id === 'en')!.skill).toBe(content.balance.languages.fading.nativeFloor);
    expect(floor.character.languages.find((l) => l.id === 'en')!.native).toBe(true);
  });
  it('keeps a language in use when an English-compatible Montreal job needs it', () => {
    const life = produce(adult(), (d) => {
      d.character.cityId = 'montreal'; d.housing.kind = 'renting';
      d.character.languages = [speaks('en', d.currentYear - 20)];
      d.career.job = { jobId: 'warehouse_worker', level: 1, yearsAtLevel: 1, performance: 50, salary: 30_000, since: d.currentYear - 1, employer: 'Test' };
      runLanguages(d, content);
    });
    expect(languageSkill(life.character.languages, 'en')).toBe(100);
    expect(life.character.languages.find((l) => l.id === 'en')!.lastUsed).toBe(life.currentYear);
  });
  it('charges classes once per year, validates input, and displays the exact cost and new balance', () => {
    const life = adult(); const price = content.balance.languages.classes.cost;
    const next = performAction(life, 'take_language_classes', { languageId: 'fr' }, content);
    expect(next.finances.savings).toBe(life.finances.savings - price);
    expect(languageSkill(next.character.languages, 'fr')).toBe(content.balance.languages.classes.gain);
    expect(getEventCard(next, 0, content)!.money).toEqual({ change: -price, balance: next.finances.savings, debtChange: 0 });
    expect(getEventCard(next, 0, content)!.text).toContain('French');
    const closed = finishAction(resolveChoice(next, next.pending[0]!.instanceId, 'continue', content));
    expect(isLifeActionAvailable(closed, 'take_language_classes', { languageId: 'es' }, content)).toBe(false);
    for (const id of ['missing', 'constructor', '__proto__']) expect(() => performAction(life, 'take_language_classes', { languageId: id }, content)).toThrow();
    expect(() => performAction(life, 'take_language_classes', { languageId: 'fr', cost: 0 }, content)).toThrow();
    const poor = produce(life, (d) => { d.finances.savings = price - 1; });
    expect(isLifeActionAvailable(poor, 'take_language_classes', { languageId: 'fr' }, content)).toBe(false);
  });
});

describe('language effects', () => {
  it('enforces conversational/fluent job needs and Montreal English alternatives', () => {
    const en = [speaks('en', 2026)];
    expect(meetsLanguageJob(en, content.jobs.software_engineer!, 'montreal', content)).toBe(true);
    expect(meetsLanguageJob(en, content.jobs.registered_nurse!, 'montreal', content)).toBe(false);
    expect(meetsLanguageJob([speaks('fr', 2026, 40)], content.jobs.food_service!, 'montreal', content)).toBe(true);
    expect(meetsLanguageJob([speaks('fr', 2026, 40)], content.jobs.physician!, 'montreal', content)).toBe(false);
    const life = produce(adult(), (d) => { d.character.languages = [speaks('es', d.currentYear)]; });
    expect(meetsJobRequirements(life, content.jobs.retail_associate!, content)).toBe(false);
  });
  it('weights shared-language encounters and changes interaction scores and wording without blocking contact', () => {
    const life = produce(adult(), (d) => {
      const id = Object.keys(d.people)[0]!;
      d.people[id]!.languages = [speaks('fr', d.currentYear)];
      d.people[id]!.cityId = 'chicago'; d.people[id]!.alive = true; delete d.people[id]!.deathYear;
      d.relationships[id]!.status = 'active'; d.relationships[id]!.kind = 'friend';
    });
    const person = Object.values(life.people)[0]!; const rel = life.relationships[person.id]!;
    expect(sharedLanguage(life.character.languages, person.languages, content)).toBeNull();
    expect(meetingWeight(life.character.languages, person, content)).toBe(content.balance.languages.meeting.barrier);
    const shared = { ...person, languages: [speaks('en', life.currentYear)] };
    expect(meetingWeight(life.character.languages, shared, content)).toBe(content.balance.languages.meeting.shared);
    const score = (p: typeof person) => reactionScore(life, content.interactions.chat!, rel, p, { same: 0, total: 0 }, undefined, content);
    expect(score(shared) - score(person)).toBe(content.balance.languages.interaction.sharedBonus - content.balance.languages.interaction.barrierPenalty);
    const next = performInteraction(life, { interactionId: 'chat', personId: person.id }, content);
    expect(Object.values(content.interactions.chat!.outcomes).flatMap((t) => t?.barrierText ?? [])).toContain(next.pendingInteraction!.text.replaceAll(person.name.first, '{person.name}'));
  });
  it('evaluates skill/native/shared conditions and handles unknown cast roles before casting', () => {
    const life = adult(); const id = Object.keys(life.people)[0]!;
    expect(evaluate({ language: { id: 'en', skill: { gte: 80 }, native: true } }, life, { content })).toBe(true);
    expect(evaluate({ language: { sharedWith: 'npc' } }, life, { content, roles: 'assumeTrue' })).toBe(true);
    expect(evaluate({ not: { language: { sharedWith: 'npc' } } }, life, { content, roles: 'assumeTrue' })).toBe(true);
    expect(evaluate({ language: { sharedWith: 'npc' } }, life, { content, roles: 'strict' })).toBe(false);
    expect(evaluate({ language: { sharedWith: 'npc' } }, life, { content, cast: { npc: id } })).toBe(true);
    expect(conditionSchema.safeParse({ language: {} }).success).toBe(false);
  });
  it('selects barrier text in events and shows language levels in the Profile view', () => {
    const life = produce(adult(), (d) => {
      const cast = castEvent(d, content.events.language_new_neighbor!, d.rng, content)!;
      d.people[cast.cast.npc!]!.languages = [speaks('fr', d.currentYear)];
      d.pending = [{ instanceId: 'language', eventId: 'language_new_neighbor', cast: cast.cast }];
    });
    expect(getEventCard(life, 0, content)!.text).toContain('shared words');
    expect(getProfileView(life, content).languages).toContainEqual({ id: 'en', name: 'English', level: 'fluent', native: true });
  });
});

