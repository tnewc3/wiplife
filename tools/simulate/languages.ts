/** W4b: observed skills, learning and language-related opportunities; no causal claims from correlation. */
import type { ContentBundle } from '../../src/content/schemas';
import { languageLevel, localLanguages, meetsLanguageJob, sharedLanguage } from '../../src/engine/languages';
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
}
export const emptyLanguagesReport = (): LanguagesReport => ({ lives: 0, native: {}, spoken: {}, learnedLives: 0, points: { school: 0, classes: 0, immersion: 0, faded: 0 }, classCourses: 0, jobs: { openings: 0, blocked: 0, eligible: 0, employedYears: 0, adultYears: 0 }, friendships: { shared: { meetings: 0, observations: 0, affection: 0 }, barrier: { meetings: 0, observations: 0, affection: 0 } } });
export class LanguagesWatcher {
  constructor(private readonly report: LanguagesReport, private readonly content: ContentBundle) {}
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
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
  }
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
  ];
}
