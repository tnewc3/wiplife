/** W4b: one language model for creation, learning, jobs and social life. */
import type { ContentBundle, JobDef, LanguageLevel, LanguageSkill } from '../content/schemas';
import { countryIdOfCity, countryOfCity, scaledAmount } from './country';
import { spend } from './finance';
import { chance, pick, type RngState } from './rng';
import type { LifeState, Person } from './types';

export interface LanguageLearning {
  schoolId: string | null;
  classYear: number | null;
  /** The language studied last by a class, an app or a tutor ({studiedLanguage} in event text). */
  classId: string | null;
  totals: { school: number; classes: number; immersion: number; faded: number; app: number; tutor: number; practice: number; home: number; trip: number };
  /** Batch 10: the year each paid method of study was last used (one set a year each). */
  methodYear: { app: number | null; tutor: number | null };
  /** Batch 10: skill gained this year from practicing with native speakers you know (capped a year). */
  practice: { year: number; points: number };
  /** Batch 10: the exam levels you hold, by language. They do not fade. */
  certificates: Record<string, LanguageLevel>;
  /** Batch 10: the year each language's exam was last sat (one a year). */
  examYear: Record<string, number>;
  /** Batch 10: your last exam, for the result card ({examLanguage}, {examLevel}). */
  recentExam: { id: string; level: LanguageLevel; passed: boolean } | null;
  exams: { sat: number; passed: number };
  /** Batch 10: children you speak a language of your own with at home: child id → language id. */
  home: Record<string, string>;
}
export const emptyLanguageLearning = (): LanguageLearning => ({
  schoolId: null, classYear: null, classId: null,
  totals: { school: 0, classes: 0, immersion: 0, faded: 0, app: 0, tutor: 0, practice: 0, home: 0, trip: 0 },
  methodYear: { app: null, tutor: null }, practice: { year: 0, points: 0 }, certificates: {}, examYear: {}, recentExam: null, exams: { sat: 0, passed: 0 }, home: {},
});
export const LANGUAGE_LEVELS = ['basic', 'conversational', 'fluent'] as const satisfies readonly LanguageLevel[];
export type StudyMethod = 'app' | 'tutor';

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
  const second = [...local.official.slice(1), ...local.common].filter((id) => content.languages[id]?.id === id && !ids.has(id));
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
export function legacyLanguages(cityId: string, year: number, _key: string, content: ContentBundle): LanguageSkill[] {
  return [{ id: localLanguages(cityId, content).official[0]!, skill: content.balance.languages.nativeSkill, native: true, lastUsed: year }];
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
/** Your languages as jobs and routes see them: a certificate holds its level's skill even after the skill itself has faded. */
export function effectiveLanguages(state: LifeState, content: ContentBundle): LanguageSkill[] {
  const certs = Object.entries(state.languages.certificates);
  if (certs.length === 0) return state.character.languages;
  const out = state.character.languages.map((l) => ({ ...l }));
  for (const [id, level] of certs) {
    const bar = content.balance.languages.levels[level];
    const have = out.find((l) => l.id === id);
    if (have) have.skill = Math.max(have.skill, bar);
    else out.push({ id, skill: bar, native: false, lastUsed: state.currentYear });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
/** How many languages you speak at least at this level (certificates count). */
export function languagesAtLevel(state: LifeState, level: LanguageLevel, content: ContentBundle): number {
  const bar = content.balance.languages.levels[level];
  return effectiveLanguages(state, content).filter((l) => l.skill >= bar).length;
}

/** The price of a paid way of studying, at where you live. */
export function studyCost(state: LifeState, method: StudyMethod, content: ContentBundle): number {
  return scaledAmount(state, content.balance.languages.methods[method].cost, content);
}
export function canStudyLanguage(state: LifeState, id: string, method: StudyMethod, content: ContentBundle): boolean {
  return content.languages[id]?.id === id && !content.languages[id]!.retired && state.character.age >= content.balance.languages.classes.minAge
    && state.languages.methodYear[method] !== state.currentYear && languageSkill(state.character.languages, id) < 100 && state.finances.savings >= studyCost(state, method, content);
}
export function studyLanguage(state: LifeState, id: string, method: StudyMethod, content: ContentBundle): void {
  spend(state, studyCost(state, method, content), content);
  state.languages.methodYear[method] = state.currentYear;
  state.languages.classId = id;
  state.languages.totals[method] += gainLanguage(state.character.languages, id, content.balance.languages.methods[method].gain, state.currentYear);
}

/** Exams (Batch 10): one sitting a language a year, for a level you do not hold yet, from within `margin` points of its bar. */
export function examFee(state: LifeState, level: LanguageLevel, content: ContentBundle): number {
  return scaledAmount(state, content.balance.languages.exams.fee[level], content);
}
const levelRank = (level: LanguageLevel): number => LANGUAGE_LEVELS.indexOf(level);
export function canSitExam(state: LifeState, id: string, level: LanguageLevel, content: ContentBundle): boolean {
  const b = content.balance.languages;
  const held = state.languages.certificates[id];
  return content.languages[id]?.id === id && !content.languages[id]!.retired && state.character.age >= b.exams.minAge && state.languages.examYear[id] !== state.currentYear
    && (held === undefined || levelRank(held) < levelRank(level)) && languageSkill(state.character.languages, id) >= b.levels[level] - b.exams.margin && state.finances.savings >= examFee(state, level, content);
}
export function examOdds(state: LifeState, id: string, level: LanguageLevel, content: ContentBundle): number {
  const o = content.balance.languages.exams.odds;
  return Math.min(o.max, Math.max(o.min, o.base + o.perPoint * (languageSkill(state.character.languages, id) - content.balance.languages.levels[level])));
}
/** The odds of passing, in words (never a percentage). */
export function examOddsWord(state: LifeState, id: string, level: LanguageLevel, content: ContentBundle): 'slim' | 'fair' | 'good' | 'strong' {
  const p = examOdds(state, id, level, content);
  const w = content.balance.languages.exams.words;
  return p >= w.strong ? 'strong' : p >= w.good ? 'good' : p >= w.fair ? 'fair' : 'slim';
}
/** Pays the fee and sits it. The result is a roll of the life's generator; a pass adds the certificate. Returns whether it was passed. */
export function sitExam(state: LifeState, id: string, level: LanguageLevel, content: ContentBundle): boolean {
  spend(state, examFee(state, level, content), content);
  const passed = chance(state.rng, examOdds(state, id, level, content));
  state.languages.examYear[id] = state.currentYear;
  state.languages.exams.sat++;
  state.languages.recentExam = { id, level, passed };
  if (passed) {
    state.languages.exams.passed++;
    const held = state.languages.certificates[id];
    if (held === undefined || levelRank(held) < levelRank(level)) state.languages.certificates[id] = level;
    // Passing proves the skill: a rusty one is brought up to the bar.
    const bar = content.balance.languages.levels[level];
    const skill = languageSkill(state.character.languages, id);
    if (skill < bar) gainLanguage(state.character.languages, id, bar - skill, state.currentYear);
  }
  return passed;
}

/** The language of this person that you could practice: one of theirs (native) that you do not yet speak fluently. The one you know best first. */
export function practiceLanguage(state: LifeState, personId: string, content: ContentBundle): string | null {
  const person = state.people[personId];
  if (!person) return null;
  const fluent = content.balance.languages.levels.fluent;
  return person.languages.filter((l) => l.native && content.languages[l.id] && languageSkill(state.character.languages, l.id) < fluent)
    .sort((a, b) => languageSkill(state.character.languages, b.id) - languageSkill(state.character.languages, a.id) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
/** Skill from a good outing with a native speaker (a share of the practice gain), up to the yearly cap. Returns the points gained. */
export function practiceWith(state: LifeState, personId: string, share: number, content: ContentBundle): number {
  const id = practiceLanguage(state, personId, content);
  const b = content.balance.languages.practice;
  const p = state.languages.practice;
  if (p.year !== state.currentYear) { p.year = state.currentYear; p.points = 0; }
  if (!id) return 0;
  const gained = gainLanguage(state.character.languages, id, Math.min(Math.round(b.gain * share), Math.max(0, b.yearlyMax - p.points)), state.currentYear);
  p.points += gained;
  state.languages.totals.practice += gained;
  return gained;
}

/** The language you could pass on to this child: one you speak conversationally that they do not, a native one of yours before a learned one. */
export function teachableLanguage(state: LifeState, childId: string, content: ContentBundle): string | null {
  const child = state.people[childId];
  if (!child) return null;
  const bar = content.balance.languages.levels.conversational;
  const mine = effectiveLanguages(state, content).filter((l) => l.skill >= bar && languageSkill(child.languages, l.id) < bar && content.languages[l.id]);
  return mine.sort((a, b) => Number(b.native) - Number(a.native) || b.skill - a.skill || a.id.localeCompare(b.id))[0]?.id ?? null;
}
/** You start speaking a language of yours with this child at home. Returns the language, or null when there is none to pass on. */
export function startHomeLanguage(state: LifeState, childId: string, content: ContentBundle): string | null {
  const id = teachableLanguage(state, childId, content);
  const child = state.people[childId];
  if (!id || !child) return null;
  const b = content.balance.languages.home;
  const age = state.currentYear - child.birthYear;
  const have = child.languages.find((l) => l.id === id);
  const native = age <= b.nativeAge;
  if (have) { have.skill = Math.max(have.skill, b.start); have.lastUsed = state.currentYear; have.native = have.native || native; }
  else { child.languages.push({ id, skill: b.start, native, lastUsed: state.currentYear }); child.languages.sort((x, y) => x.id.localeCompare(y.id)); }
  state.languages.home[childId] = id;
  return id;
}
/** A heritage language of yours that has been lost: one your family background suggests that you now speak below the conversational level. */
export function lostHeritageLanguage(state: LifeState, content: ContentBundle): string | null {
  const ids = content.balance.languages.heritage[state.character.heritage ?? ''] ?? [];
  const bar = content.balance.languages.levels.conversational;
  return ids.filter((id) => content.languages[id] && languageSkill(effectiveLanguages(state, content), id) < bar).sort((a, b) => languageSkill(state.character.languages, a) - languageSkill(state.character.languages, b) || a.localeCompare(b))[0] ?? null;
}
/** A lost heritage language comes back some of the way. Returns the language. */
export function returnHeritageLanguage(state: LifeState, content: ContentBundle): string | null {
  const id = lostHeritageLanguage(state, content);
  if (!id) return null;
  state.languages.classId = id;
  state.languages.totals.immersion += gainLanguage(state.character.languages, id, content.balance.languages.heritageReturn.gain, state.currentYear);
  return id;
}

export function canTakeLanguageClasses(state: LifeState, id: string, content: ContentBundle): boolean {
  return content.languages[id]?.id === id && !content.languages[id]!.retired && state.character.age >= content.balance.languages.classes.minAge && state.languages.classYear !== state.currentYear && languageSkill(state.character.languages, id) < 100 && state.finances.savings >= languageClassCost(state, content);
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
      if (choices.length) state.languages.schoolId = choices[0]!;
    }
    if (state.languages.schoolId) state.languages.totals.school += gainLanguage(c.languages, state.languages.schoolId, b.school.gain, year);
  }
  const household = Object.values(state.people).filter((p) => p.alive && (state.housing.partnerId === p.id || (state.housing.kind === 'with_parents' && state.relationships[p.id]?.kind === 'parent')));
  const homeIds = new Set(household.filter((p) => p.cityId === c.cityId).flatMap((p) => p.languages.filter((l) => l.native).map((l) => l.id)));
  const advance = (languages: LanguageSkill[], cityId: string, age: number, home: ReadonlySet<string>, jobId?: string) => {
    let gained = 0; let faded = 0;
    // A language actually used for work is not unused merely because the city's
    // dominant language differs. Prefer that local language when it qualifies.
    const job = jobId ? content.jobs[jobId] : undefined;
    if (job) {
      const req = languageJobRequirement(job, cityId, content);
      const eligible = req.any.filter((id) => languageSkill(languages, id) >= b.levels[req.level]);
      const local = localLanguages(cityId, content).official[0]!;
      const spoken = eligible.includes(local) ? local : eligible[0];
      if (spoken) languages.find((l) => l.id === spoken)!.lastUsed = year;
      // Batch 10: some work uses every language you speak well.
      if (job.usesLanguages) for (const l of languages) if (l.skill >= b.levels.fluent) l.lastUsed = year;
    }
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
  const mine = advance(c.languages, c.cityId, c.age, homeIds, state.career.job?.jobId);
  state.languages.totals.immersion += mine.gained;
  if (state.travel.residence && state.travel.residence.type !== 'visitor') state.travel.totals.immersion += mine.gained;
  state.languages.totals.faded += mine.faded;
  for (const person of Object.values(state.people)) if (person.alive) {
    const age = year - person.birthYear;
    const school = countryOfCity(person.cityId, content).school;
    const finishes = school.startAge + school.elementary + school.middle + school.high;
    if (age >= b.school.minAge && age < finishes) {
      const choices = b.school.choices[countryIdOfCity(person.cityId, content)]!.filter((id) => !person.languages.some((l) => l.id === id && l.native));
      if (choices.length) gainLanguage(person.languages, choices[0]!, b.school.gain, year);
    }
    const atHome = person.child?.custody === 'you' || homeIds.size > 0 && household.some((p) => p.id === person.id);
    advance(person.languages, person.cityId, year - person.birthYear, atHome ? new Set(c.languages.filter((l) => l.native).map((l) => l.id)) : new Set(), person.occupation);
  }
  // Batch 10: a child you speak a language of your own with at home keeps gaining it while young; the choice ends when it no longer fits.
  for (const [childId, id] of Object.entries(state.languages.home)) {
    const child = state.people[childId];
    if (!child || !child.alive || child.child?.custody !== 'you' || year - child.birthYear > b.home.maxAge || languageSkill(c.languages, id) < b.levels.conversational) { delete state.languages.home[childId]; continue; }
    state.languages.totals.home += gainLanguage(child.languages, id, b.home.yearlyGain, year);
  }
}
