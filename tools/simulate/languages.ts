/** W4b: observed skills, learning and language-related opportunities; no causal claims from correlation. */
import type { ContentBundle } from '../../src/content/schemas';
import { LANGUAGE_LEVELS, canSitExam, languageLevel, localLanguages, meetsLanguageJob, sharedLanguage, effectiveLanguages } from '../../src/engine/languages';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { isLifeActionAvailable } from '../../src/engine/actions';
import { createRng, chance, pick } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';

export interface LanguagesReport {
  lives: number;
  native: Record<string, number>;
  spoken: Record<string, { basic: number; conversational: number; fluent: number }>;
  learnedLives: number;
  points: { school: number; classes: number; immersion: number; faded: number };
  classCourses: number;
  jobs: { openings: number; blocked: number; eligible: number; employedYears: number; adultYears: number };
  friendships: Record<'shared' | 'barrier', { meetings: number; observations: number; affection: number }>;
  /** Batch 10: skill points by way of learning, exams, translators, bilingual children and heritage languages. */
  methods: { app: number; tutor: number; practice: number; home: number; trip: number; appCourses: number; tutorCourses: number; practiceLives: number; practiceSessions: number };
  exams: { lives: number; sat: number; passed: number; holders: number; byLevel: Record<string, { sat: number; held: number }>; countedForJobs: number };
  translators: { lives: number; years: number; withCertificate: number; peakLevel: number[] };
  children: { lives: number; children: number; bilingual: number; homeLives: number };
  heritage: { lives: number; returns: number; lostAtDeath: number };
}
export const emptyLanguagesReport = (): LanguagesReport => ({ lives: 0, native: {}, spoken: {}, learnedLives: 0, points: { school: 0, classes: 0, immersion: 0, faded: 0 }, classCourses: 0, jobs: { openings: 0, blocked: 0, eligible: 0, employedYears: 0, adultYears: 0 }, friendships: { shared: { meetings: 0, observations: 0, affection: 0 }, barrier: { meetings: 0, observations: 0, affection: 0 } }, methods: { app: 0, tutor: 0, practice: 0, home: 0, trip: 0, appCourses: 0, tutorCourses: 0, practiceLives: 0, practiceSessions: 0 }, exams: { lives: 0, sat: 0, passed: 0, holders: 0, byLevel: {}, countedForJobs: 0 }, translators: { lives: 0, years: 0, withCertificate: 0, peakLevel: [] }, children: { lives: 0, children: 0, bilingual: 0, homeLives: 0 }, heritage: { lives: 0, returns: 0, lostAtDeath: 0 } });
export class LanguagesWatcher {
  private translatorLife = false;
  constructor(private readonly report: LanguagesReport, private readonly content: ContentBundle) {}
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    if (after.career.job?.jobId === 'translator') { r.translators.years++; this.translatorLife = true; }
    if (after.character.age >= this.content.balance.careers.minAge) {
      r.jobs.adultYears++;
      if (after.career.job) r.jobs.employedYears++;
      for (const id of after.career.openings) {
        const job = this.content.jobs[id];
        if (!job) continue;
        r.jobs.openings++;
        if (meetsLanguageJob(after.character.languages, job, after.character.cityId, this.content)) r.jobs.eligible++;
        else r.jobs.blocked++;
      }
    }
    for (const [id, rel] of Object.entries(after.relationships)) {
      const person = after.people[id];
      if (!person?.alive || rel.status !== 'active' || !['friend', 'classmate', 'acquaintance'].includes(rel.kind)) continue;
      const group = sharedLanguage(after.character.languages, person.languages, this.content) ? r.friendships.shared : r.friendships.barrier;
      group.observations++; group.affection += rel.affection;
      if (!before.people[id]) group.meetings++;
    }
  }
  finish(life: LifeState): void {
    const r = this.report; r.lives++;
    if (life.character.languages.some((l) => !l.native && l.skill >= this.content.balance.languages.levels.basic)) r.learnedLives++;
    for (const l of life.character.languages) {
      if (l.native) r.native[l.id] = (r.native[l.id] ?? 0) + 1;
      const level = languageLevel(l.skill, this.content);
      if (level === 'beginner') continue;
      const row = r.spoken[l.id] ??= { basic: 0, conversational: 0, fluent: 0 }; row[level]++;
    }
    for (const key of ['school', 'classes', 'immersion', 'faded'] as const) r.points[key] += life.languages.totals[key];
    r.classCourses += life.inputLog.filter((entry) => entry.kind === 'action' && entry.payload.actionId === 'take_language_classes').length;
    // Batch 10.
    const t = life.languages.totals; const m = r.methods;
    m.app += t.app; m.tutor += t.tutor; m.practice += t.practice; m.home += t.home; m.trip += t.trip;
    const studied = (method: string) => life.inputLog.filter((entry) => entry.kind === 'action' && entry.payload.actionId === 'study_language' && (entry.payload.params as { study?: { method?: string } } | undefined)?.study?.method === method).length;
    m.appCourses += studied('app'); m.tutorCourses += studied('tutor');
    if (t.practice > 0) m.practiceLives++;
    const e = life.languages;
    if (e.exams.sat > 0) r.exams.lives++;
    r.exams.sat += e.exams.sat; r.exams.passed += e.exams.passed;
    if (Object.keys(e.certificates).length > 0) r.exams.holders++;
    for (const level of LANGUAGE_LEVELS) r.exams.byLevel[level] ??= { sat: 0, held: 0 };
    for (const level of Object.values(e.certificates)) r.exams.byLevel[level]!.held++;
    // A certificate that lifted a language above the skill left (faded) counts for work and for routes.
    const effective = effectiveLanguages(life, this.content);
    if (effective.some((l, i) => l.skill > (life.character.languages.find((x) => x.id === l.id)?.skill ?? 0) && i >= 0)) r.exams.countedForJobs++;
    if (this.translatorLife) {
      r.translators.lives++;
      if (Object.keys(e.certificates).length > 0) r.translators.withCertificate++;
      this.translatorLife = false;
    }
    const kids = Object.values(life.people).filter((p) => life.relationships[p.id]?.kind === 'child' && p.child);
    if (kids.length > 0) {
      r.children.lives++; r.children.children += kids.length;
      const bar = this.content.balance.languages.levels.conversational;
      r.children.bilingual += kids.filter((k) => k.languages.filter((l) => l.skill >= bar).length >= 2).length;
    }
    if (t.home > 0) r.children.homeLives++;
    const heritageEvents = ['language_heritage_recordings', 'language_heritage_song'].reduce((n, id) => n + (life.eventLog[id]?.count ?? 0), 0);
    if (heritageEvents > 0) { r.heritage.lives++; r.heritage.returns += heritageEvents; }
    if (lostAtDeath(life, this.content)) r.heritage.lostAtDeath++;
  }
}
function lostAtDeath(life: LifeState, content: ContentBundle): boolean {
  const ids = content.balance.languages.heritage[life.character.heritage ?? ''] ?? [];
  return ids.some((id) => (life.character.languages.find((l) => l.id === id)?.skill ?? 0) < content.balance.languages.levels.conversational);
}
/**
 * Batch 10: the other ways the simulated player studies. A language the job market needs comes first; some also take an app, a
 * tutor, or an exam for a level they are close to. A policy, not an engine rate.
 */
export function chooseLanguageStudy(life: LifeState, content: ContentBundle): readonly [LifeActionId, LifeActionParams][] {
  const rng = createRng(`${life.seed}:${life.currentYear}:language-study`);
  const out: [LifeActionId, LifeActionParams][] = [];
  const local = localLanguages(life.character.cityId, content).official[0]!;
  const ids = Object.keys(content.languages).sort();
  const pickFrom = (method: 'app' | 'tutor') => {
    const options = ids.filter((id) => isLifeActionAvailable(life, 'study_language', { study: { languageId: id, method } }, content));
    return options.includes(local) ? local : options.length ? pick(rng, options) : null;
  };
  if (chance(rng, 0.07)) { const id = pickFrom('app'); if (id) out.push(['study_language', { study: { languageId: id, method: 'app' } }]); }
  if (chance(rng, 0.03)) { const id = pickFrom('tutor'); if (id) out.push(['study_language', { study: { languageId: id, method: 'tutor' } }]); }
  // An exam, for the highest level they can sit in a language they speak.
  if (chance(rng, 0.25)) {
    const options: LifeActionParams[] = [];
    for (const l of life.character.languages) for (const level of [...LANGUAGE_LEVELS].reverse()) {
      if (canSitExam(life, l.id, level, content)) { options.push({ exam: { languageId: l.id, level } }); break; }
    }
    if (options.length) out.push(['sit_language_exam', pick(rng, options)]);
  }
  return out;
}
/** Learners prioritise the local language when it limits work; some also take a course for interest. */
export function chooseLanguageClass(life: LifeState, content: ContentBundle): string | null {
  const rng = createRng(`${life.seed}:${life.currentYear}:language-classes`);
  const local = localLanguages(life.character.cityId, content).official[0]!;
  const choices = Object.keys(content.languages).sort().filter((id) => isLifeActionAvailable(life, 'take_language_classes', { languageId: id }, content));
  if (choices.includes(local)) return local;
  // The simulated player's taste is stable per year; this is a policy, not an engine learning rate.
  return choices.length && chance(rng, content.balance.languages.classes.interestChance) ? pick(rng, choices) : null;
}
export function formatLanguages(r: LanguagesReport, content: ContentBundle, years = 0): string[] {
  const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
  return [
    '\nLanguages (W4b)',
    `  Lives: ${r.lives}; non-native language retained at death: ${pct(r.learnedLives, r.lives)}`,
    ...Object.entries(r.spoken).sort().map(([id, row]) => `  ${content.languages[id]?.name ?? id}: native ${r.native[id] ?? 0}; basic ${row.basic}, conversational ${row.conversational}, fluent ${row.fluent} at death`),
    `  Skill points gained: school ${r.points.school}, paid classes ${r.points.classes}, immersion ${r.points.immersion}; unused skill points lost ${r.points.faded}`,
    `  Mean skill points per simulated year: school ${years ? (r.points.school / years).toFixed(3) : "n/a"}, paid classes ${years ? (r.points.classes / years).toFixed(3) : "n/a"}, immersion ${years ? (r.points.immersion / years).toFixed(3) : "n/a"}, fading ${years ? (r.points.faded / years).toFixed(3) : "n/a"}`,
    `  Paid courses: ${r.classCourses} (${r.lives ? (r.classCourses / r.lives).toFixed(2) : 'n/a'} per life)`,
    `  Open job opportunities: ${r.jobs.openings}; language-eligible ${r.jobs.eligible}; blocked by language ${r.jobs.blocked} (${pct(r.jobs.blocked, r.jobs.openings)}; other requirements not assessed here)`,
    `  Employed adult years: ${pct(r.jobs.employedYears, r.jobs.adultYears)}`,
    ...(['shared', 'barrier'] as const).map((key) => { const f = r.friendships[key]; return `  ${key} language: ${f.meetings} new social contacts, ${f.observations} contact-years, mean affection ${f.observations ? (f.affection / f.observations).toFixed(1) : 'n/a'}`; }),
    '  Social comparisons are observed associations, not causal estimates.',
    ...formatLanguagesBatch10(r, content, years),
  ];
}

/** Batch 10: learning by method, certificates, translators, bilingual children and heritage languages. */
export function formatLanguagesBatch10(r: LanguagesReport, _content: ContentBundle, years = 0): string[] {
  const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
  const per = (n: number) => (years ? (n / years).toFixed(3) : 'n/a');
  const m = r.methods; const e = r.exams;
  return [
    '  Batch 10 — ways of learning',
    `    Skill points by method: app ${m.app} (${m.appCourses} courses; ${m.appCourses ? (m.app / m.appCourses).toFixed(2) : 'n/a'} each), tutor ${m.tutor} (${m.tutorCourses} courses; ${m.tutorCourses ? (m.tutor / m.tutorCourses).toFixed(2) : 'n/a'} each), practice with a native speaker ${m.practice} (${pct(m.practiceLives, r.lives)} of lives), raised at home ${m.home}, language trips ${m.trip}; per simulated year: app ${per(m.app)}, tutor ${per(m.tutor)}, practice ${per(m.practice)}`,
    `    Exams: ${e.sat} sat in ${e.lives} lives (${pct(e.lives, r.lives)}), ${e.passed} passed (${pct(e.passed, e.sat)}); lives holding a certificate ${e.holders} (${pct(e.holders, r.lives)}); certificates held by level ${Object.entries(e.byLevel).sort().map(([k, v]) => `${k} ${v.held}`).join(', ') || 'none'}; lives where a certificate counted above the skill left ${e.countedForJobs}`,
    `    Translators and interpreters: ${r.translators.lives} lives (${pct(r.translators.lives, r.lives)}), ${r.translators.years} years in the job; with a certificate ${r.translators.withCertificate}`,
    `    Bilingual children: ${r.children.bilingual} of ${r.children.children} children of ${r.children.lives} parents speak two languages at the conversational level or better (${pct(r.children.bilingual, r.children.children)}); lives who raised a child in a language of their own ${r.children.homeLives}`,
    `    Heritage languages: ${r.heritage.returns} returning events in ${r.heritage.lives} lives; lives whose heritage language was still lost at death ${r.heritage.lostAtDeath}`,
  ];
}

/** Batch 10: the careful player's rates for the new ways of learning against the configured gains, and shares of lives. */
export function languagesTargets(report: { languages: LanguagesReport; lives: number }, content: ContentBundle): { label: string; value: string; short: string; goal: string; met: boolean }[] {
  const t = content.balance.targets.languagesB10;
  const r = report.languages;
  const out: { label: string; value: string; short: string; goal: string; met: boolean }[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const m = r.methods; const b = content.balance.languages.methods;
  range('app: points a course against the configured gain', m.appCourses ? m.app / m.appCourses / b.app.gain : 1, t.appRate);
  range('tutor: points a course against the configured gain', m.tutorCourses ? m.tutor / m.tutorCourses / b.tutor.gain : 1, t.tutorRate);
  range('lives that practiced with a native speaker', share(m.practiceLives, r.lives), t.practiceLives);
  range('lives that sat a certificate exam', share(r.exams.lives, r.lives), t.examLives);
  range('exams passed', share(r.exams.passed, r.exams.sat), t.examPassRate);
  range('lives where a certificate counted above the skill left', share(r.exams.countedForJobs, r.lives), t.certificateCounted);
  range('lives as a translator or interpreter', share(r.translators.lives, r.lives), t.translatorLives, (n) => n.toFixed(4));
  range('children of a parent speaking two languages (conversational or better)', share(r.children.bilingual, r.children.children), t.bilingualChildren);
  range('lives that raised a child in a language of their own', share(r.children.homeLives, r.lives), t.homeLives, (n) => n.toFixed(4));
  range('lives with a heritage language returning', share(r.heritage.lives, r.lives), t.heritageLives, (n) => n.toFixed(4));
  return out;
}
