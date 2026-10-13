/** W4b: one language model for creation, learning, jobs and social life. */
import type { ContentBundle, JobDef, LanguageLevel, LanguageSkill } from '../content/schemas';
import { countryIdOfCity, countryOfCity, scaledAmount } from './country';
import { spend } from './finance';
import { chance, createRng, pick, type RngState } from './rng';
import type { LifeState, Person } from './types';

export interface LanguageLearning {
  schoolId: string | null;
  classYear: number | null;
  classId: string | null;
  totals: { school: number; classes: number; immersion: number; faded: number };
}
export const emptyLanguageLearning = (): LanguageLearning => ({ schoolId: null, classYear: null, classId: null, totals: { school: 0, classes: 0, immersion: 0, faded: 0 } });

export function localLanguages(cityId: string, content: ContentBundle) {
  return content.cities[cityId]?.languages ?? countryOfCity(cityId, content).languages;
}
export function languageSkill(languages: readonly LanguageSkill[], id: string): number {
  return languages.find((l) => l.id === id)?.skill ?? 0;
}
export function languageLevel(skill: number, content: ContentBundle): LanguageLevel | 'beginner' {
  const levels = content.balance.languages.levels;
  return skill >= levels.fluent ? 'fluent' : skill >= levels.conversational ? 'conversational' : skill >= levels.basic ? 'basic' : 'beginner';
}
export function nativeLanguages(cityId: string, heritage: string, year: number, rng: RngState, content: ContentBundle): LanguageSkill[] {
  const b = content.balance.languages;
  const local = localLanguages(cityId, content);
  // The dominant local language and, sometimes, the family's heritage language.
  const ids = new Set([local.official[0]!]);
  const heritageIds = b.heritage[heritage] ?? [];
  if (heritageIds.length && chance(rng, b.heritageChance)) ids.add(pick(rng, heritageIds));
  const second = [...local.official.slice(1), ...local.common].filter((id) => content.languages[id] && !ids.has(id));
  const bilingual = b.bilingualChance[cityId] ?? b.bilingualChance[countryIdOfCity(cityId, content)] ?? 0;
  if (second.length && chance(rng, bilingual)) ids.add(pick(rng, second));
  return [...ids].sort().map((id) => ({ id, skill: b.nativeSkill, native: true, lastUsed: year }));
}
/** Household languages follow the actual caregivers; a surname alone never sets a child's language. */
export function householdLanguages(cityId: string, parents: readonly { languages: readonly LanguageSkill[] }[], year: number, content: ContentBundle): LanguageSkill[] {
  const ids = new Set([localLanguages(cityId, content).official[0]!]);
  for (const parent of parents) for (const l of parent.languages) if (l.native || l.skill >= content.balance.languages.levels.fluent) ids.add(l.id);
  return [...ids].sort().map((id) => ({ id, skill: content.balance.languages.nativeSkill, native: true, lastUsed: year }));
}
/** Used when old saves lack an ancestry record: retain local background, with no invented heritage. */
export function legacyLanguages(cityId: string, year: number, key: string, content: ContentBundle): LanguageSkill[] {
  return nativeLanguages(cityId, 'general', year, createRng(`${key}:languages-upgrade`), content);
}
export function sharedLanguage(a: readonly LanguageSkill[], b: readonly LanguageSkill[], content: ContentBundle): string | null {
  const level = content.balance.languages.levels.conversational;
  return a.filter((l) => l.skill >= level && languageSkill(b, l.id) >= level).sort((x, y) => x.id.localeCompare(y.id))[0]?.id ?? null;
}
export function meetingWeight(languages: readonly LanguageSkill[], person: Person, content: ContentBundle): number {
  const b = content.balance.languages.meeting;
  return sharedLanguage(languages, person.languages, content) ? b.shared : b.barrier;
}
export function languageJobRequirement(job: JobDef, cityId: string, content: ContentBundle) {
  const b = content.balance.languages.jobs;
  return b.cities[cityId]?.[job.id] ?? b.countries[countryIdOfCity(cityId, content)]?.[job.id] ?? { any: [localLanguages(cityId, content).official[0]!], level: b.byCategory[job.category] };
}
export function meetsLanguageJob(languages: readonly LanguageSkill[], job: JobDef, cityId: string, content: ContentBundle): boolean {
  const requirement = languageJobRequirement(job, cityId, content);
  return requirement.any.some((id) => languageSkill(languages, id) >= content.balance.languages.levels[requirement.level]);
}
export function gainLanguage(languages: LanguageSkill[], id: string, gain: number, year: number): number {
  let l = languages.find((entry) => entry.id === id);
  if (!l) { l = { id, skill: 0, native: false, lastUsed: year }; languages.push(l); languages.sort((a, b) => a.id.localeCompare(b.id)); }
  const before = l.skill;
  l.skill = Math.min(100, l.skill + gain);
  l.lastUsed = year;
  return l.skill - before;
}
export function languageClassCost(state: LifeState, content: ContentBundle): number {
  return scaledAmount(state, content.balance.languages.classes.cost, content);
}
export function canTakeLanguageClasses(state: LifeState, id: string, content: ContentBundle): boolean {
  return !!content.languages[id] && !content.languages[id]!.retired && state.character.age >= content.balance.languages.classes.minAge && state.languages.classYear !== state.currentYear && languageSkill(state.character.languages, id) < 100 && state.finances.savings >= languageClassCost(state, content);
}
export function takeLanguageClasses(state: LifeState, id: string, content: ContentBundle): void {
  spend(state, languageClassCost(state, content), content);
  state.languages.classYear = state.currentYear;
  state.languages.classId = id;
  state.languages.totals.classes += gainLanguage(state.character.languages, id, content.balance.languages.classes.gain, state.currentYear);
}

/** Grow through school and actual use, then fade skills that have been unused beyond the grace period. */
export function runLanguages(state: LifeState, content: ContentBundle): void {
  const b = content.balance.languages;
  const c = state.character;
  const year = state.currentYear;
  if (state.education.current && c.age >= b.school.minAge && ['elementary', 'middle', 'high'].includes(state.education.current.program)) {
    if (!state.languages.schoolId) {
      const choices = b.school.choices[countryIdOfCity(c.cityId, content)]!.filter((id) => !c.languages.some((l) => l.id === id && l.native));
      if (choices.length) state.languages.schoolId = pick(createRng(`${state.seed}:language-school`), choices);
    }
    if (state.languages.schoolId) state.languages.totals.school += gainLanguage(c.languages, state.languages.schoolId, b.school.gain, year);
  }
  const household = Object.values(state.people).filter((p) => p.alive && (state.housing.partnerId === p.id || (state.housing.kind === 'with_parents' && state.relationships[p.id]?.kind === 'parent')));
  const homeIds = new Set(household.filter((p) => p.cityId === c.cityId).flatMap((p) => p.languages.filter((l) => l.native).map((l) => l.id)));
  const advance = (languages: LanguageSkill[], cityId: string, age: number, home: ReadonlySet<string>) => {
    let gained = 0; let faded = 0;
    if (age >= b.immersion.minAge) {
      const local = localLanguages(cityId, content).official[0]!;
      gained += gainLanguage(languages, local, b.immersion.gain, year);
      for (const id of home) if (id !== local) gained += gainLanguage(languages, id, b.immersion.householdGain, year);
    }
    for (const l of languages) if (year - l.lastUsed > b.fading.graceYears) {
      const floor = l.native ? b.fading.nativeFloor : 0;
      const next = Math.max(Math.min(l.skill, floor), l.skill - b.fading.loss);
      faded += l.skill - next; l.skill = next;
    }
    return { gained, faded };
  };
  const mine = advance(c.languages, c.cityId, c.age, homeIds);
  state.languages.totals.immersion += mine.gained;
  state.languages.totals.faded += mine.faded;
  for (const person of Object.values(state.people)) if (person.alive) {
    const age = year - person.birthYear;
    const school = countryOfCity(person.cityId, content).school;
    const finishes = school.startAge + school.elementary + school.middle + school.high;
    if (age >= b.school.minAge && age < finishes) {
      const choices = b.school.choices[countryIdOfCity(person.cityId, content)]!.filter((id) => !person.languages.some((l) => l.id === id && l.native));
      if (choices.length) gainLanguage(person.languages, pick(createRng(`${state.seed}:${person.id}:language-school`), choices), b.school.gain, year);
    }
    const atHome = person.child?.custody === 'you' || homeIds.size > 0 && household.some((p) => p.id === person.id);
    advance(person.languages, person.cityId, year - person.birthYear, atHome ? new Set(c.languages.filter((l) => l.native).map((l) => l.id)) : new Set());
  }
}
