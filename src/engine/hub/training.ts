/**
 * The short card after a practice, training session, rehearsal, study session or gym visit (C2): which skills and stats rose
 * between two states of the life. Pure: the UI shows it for two or three seconds (skippable, instant with reduced motion).
 */
import type { ContentBundle } from '../../content/schemas';
import { renderText } from '../text';
import { hobbyKey, memberKey, pathSkillKey } from './skills';
import type { LifeState } from '../types';

export interface TrainingLine {
  /** Where the bar starts and ends (0–100), for the filling bar. */
  from: number;
  to: number;
  text: string;
  kind: 'skill' | 'band' | 'stat' | 'grades';
}

const round = (n: number): number => Math.round(n);
const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** What improved from `before` to `after`, most to least. Empty when nothing did. */
export function trainingLines(before: LifeState, after: LifeState, content: ContentBundle): TrainingLine[] {
  const T = content.text.hub.training;
  const out: TrainingLine[] = [];
  // Path skills (a sport's, an instrument, vocals).
  for (const [pathId, path] of Object.entries(after.fame.paths)) {
    const def = content.famePaths[pathId];
    for (const [skillId, level] of Object.entries(path.skills ?? {})) {
      const was = before.fame.paths[pathId]?.skills?.[skillId] ?? level;
      if (level - was < 0.05) continue;
      const label = def?.skills?.find((s) => s.id === skillId)?.label ?? skillId;
      out.push({ from: was, to: level, kind: 'skill', text: renderText(T.skill, { values: { skill: label, gain: r1(level - was) } }) });
      void pathSkillKey;
    }
  }
  // Hobbies.
  for (const [key, rec] of Object.entries(after.hub.skills)) {
    const was = before.hub.skills[key]?.level ?? 0;
    if (rec.level - was < 0.05 || !key.startsWith('hobby.')) continue;
    const label = content.pastimes[key.slice(6)]?.label ?? key;
    out.push({ from: was, to: rec.level, kind: 'skill', text: renderText(T.skill, { values: { skill: label, gain: r1(rec.level - was) } }) });
    void hobbyKey;
  }
  // The band: the weakest player who improved, or the band as a whole.
  const bandBefore = before.fame.band;
  const bandAfter = after.fame.band;
  if (bandAfter && bandBefore) {
    const gains = bandAfter.members
      .map((m) => ({ m, was: bandBefore.members.find((x) => x.id === m.id)?.skill ?? m.skill }))
      .filter((x) => x.m.skill - x.was >= 0.05)
      .sort((a, b) => a.was - b.was);
    const top = gains[0];
    if (top) {
      const person = after.people[top.m.id];
      const part = content.famePaths[bandAfter.path]?.instruments?.find((i) => i.id === top.m.part)?.label.toLowerCase() ?? top.m.part;
      const line = T.member[(round(top.was) + round(top.m.skill)) % T.member.length]!;
      out.push({ from: top.was, to: top.m.skill, kind: 'band', text: renderText(line, { values: { part, name: person?.name.first ?? '' } }) });
      void memberKey;
    } else if (bandAfter.chemistry > bandBefore.chemistry) {
      out.push({ from: bandBefore.chemistry, to: bandAfter.chemistry, kind: 'band', text: T.band });
    }
  }
  // Fitness from the gym or a run.
  const fit = after.character.stats.fitness - before.character.stats.fitness;
  if (fit > 0) out.push({ from: before.character.stats.fitness, to: after.character.stats.fitness, kind: 'stat', text: renderText(T.stat, { values: { skill: 'Fitness', gain: String(round(fit)) } }) });
  // Studying: the grade points the year has.
  const e0 = before.education.current;
  const e1 = after.education.current;
  if (e0 && e1 && e1.boost > e0.boost) out.push({ from: Math.round((e0.gpa / 4) * 100), to: Math.round((Math.min(4, e1.gpa + e1.boost - e0.boost) / 4) * 100), kind: 'grades', text: T.grades });
  return out;
}

export type TrainingKind = 'practice' | 'rehearsal' | 'training' | 'study' | 'gym';

/** Which action is a training one (and what to call its card), or null. A hobby practiced and the gym count. */
export function trainingKind(actionId: string, params: unknown, content: ContentBundle): TrainingKind | null {
  switch (actionId) {
    case 'practice':
      return 'practice';
    case 'rehearse':
      return 'rehearsal';
    case 'train':
      return 'training';
    case 'study_harder':
      return 'study';
    case 'do_activity': {
      const id = typeof params === 'object' && params !== null ? (params as { pastimeId?: unknown }).pastimeId : undefined;
      const def = typeof id === 'string' ? content.pastimes[id] : undefined;
      if (def?.hobby) return 'practice';
      return def?.hub === 'gym' ? 'gym' : null;
    }
    default:
      return null;
  }
}
