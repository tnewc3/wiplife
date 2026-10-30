/**
 * Skills (C2): one set of rules for every skill in the game. A skill grows a
 * little in each year it is used (slower as it rises, faster with practice, a
 * talent that fits and a harder push), and after `fade.idleYears` years
 * untouched it fades a little each year, never below a share of the highest
 * level it ever reached. Where the level lives depends on what the skill is:
 *
 * - a hobby's (`hobby.<activity id>`) lives in `hub.skills`;
 * - a skill of a fame path or a sport (shooting, guitar, vocals) lives in the path (`fame.paths[..].skills`), key `<path>.<skill>`;
 * - a bandmate's playing lives on the member (`fame.band.members[..].skill`), key `member.<person id>`.
 *
 * Peaks and last use of the second and third kind are in `hub.marks`; a hobby keeps its own on its record.
 * Numbers: balance/skills.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import type { CommitLevel, Id, LifeState, SkillMark } from '../types';

export const hobbyKey = (pastimeId: Id): string => `hobby.${pastimeId}`;
export const pathSkillKey = (pathId: Id, skillId: Id): string => `${pathId}.${skillId}`;
export const memberKey = (personId: Id): string => `member.${personId}`;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Points a use adds to a skill at `level`: a year of use is `share` 1, a session less. Never past the cap. */
export function skillGain(level: number, share: number, commit: CommitLevel, talent: boolean, content: ContentBundle): number {
  const g = content.balance.skills.growth;
  const raw = curveAt(g.year, level) * share * g.commitment[commit] * (talent ? g.talent : 1);
  const cap = talent ? g.cap.talent : g.cap.none;
  return Math.max(0, Math.min(cap - level, raw));
}

/** The level a skill fades to after another year idle, or the same level when it isn't idle long enough. `idle` is years since it was last used. */
export function fadedLevel(level: number, mark: SkillMark, idle: number, content: ContentBundle): number {
  const f = content.balance.skills.fade;
  if (idle < f.idleYears) return level;
  const floor = Math.round(mark.peak * f.floor);
  if (level <= floor) return level;
  return round1(Math.max(floor, level - f.perYear));
}

/** The lowest a skill can fade to, given the highest it has been. */
export function skillFloor(peak: number, content: ContentBundle): number {
  return Math.round(peak * content.balance.skills.fade.floor);
}

/** Records a use: the skill is at `level` now, used this year. */
export function touchMark(state: LifeState, key: string, level: number): void {
  const prev = state.hub.marks[key];
  state.hub.marks[key] = { peak: Math.max(prev?.peak ?? 0, round1(level)), last: state.currentYear };
}

/** A new career in a path starts its skills again: their peaks and last use are forgotten. */
export function resetMarks(state: LifeState, pathId: Id): void {
  for (const key of Object.keys(state.hub.marks)) if (key.startsWith(`${pathId}.`)) delete state.hub.marks[key];
}

/** A mark for a skill, made from its level when it has none (a save from before, or a skill not yet used). */
export function markOf(state: LifeState, key: string, level: number): SkillMark {
  return state.hub.marks[key] ?? { peak: round1(level), last: state.currentYear };
}

// ── Hobbies ────────────────────────────────────────────────────────────────

/** Your skill in a hobby (0 for one you haven't taken up). */
export function hobbyLevelOf(state: LifeState, pastimeId: Id): number {
  return state.hub.skills[hobbyKey(pastimeId)]?.level ?? 0;
}

/** A hobby's practice: the skill rises by `gain` (already shrunk by repeats) and counts as used this year. Returns the new level. */
export function setHobbySkill(state: LifeState, pastimeId: Id, gain: number): number {
  const key = hobbyKey(pastimeId);
  const prev = state.hub.skills[key];
  const level = round1(Math.min(100, (prev?.level ?? 0) + gain));
  state.hub.skills[key] = { level, peak: Math.max(prev?.peak ?? 0, level), last: state.currentYear };
  return level;
}

// ── A year of skills ───────────────────────────────────────────────────────

/** A year of use for a path skill: it grows (a share of a year) and counts as used. Returns the points gained. */
export function useSkill(state: LifeState, pathId: Id, skillId: Id, share: number, commit: CommitLevel, talent: boolean, content: ContentBundle): number {
  const path = state.fame.paths[pathId];
  if (!path) return 0;
  const level = path.skills?.[skillId] ?? content.balance.fame.practice.start;
  const gain = skillGain(level, share, commit, talent, content);
  const next = round1(level + gain);
  path.skills = { ...(path.skills ?? {}), [skillId]: next };
  touchMark(state, pathSkillKey(pathId, skillId), next);
  return round1(gain);
}

/** Years a skill has been idle as of this year. */
export function idleYears(state: LifeState, mark: SkillMark): number {
  return Math.max(0, state.currentYear - mark.last);
}

/** The year's fading: every skill idle for the set years loses a little, never below its floor. */
export function fadeSkills(state: LifeState, content: ContentBundle): void {
  const hub = state.hub;
  for (const [key, rec] of Object.entries(hub.skills)) {
    const next = fadedLevel(rec.level, rec, idleYears(state, rec), content);
    if (next !== rec.level) hub.skills[key] = { ...rec, level: next };
  }
  for (const [pathId, path] of Object.entries(state.fame.paths)) {
    if (!path.skills) continue;
    for (const [skillId, level] of Object.entries(path.skills)) {
      const key = pathSkillKey(pathId, skillId);
      const mark = markOf(state, key, level);
      if (!hub.marks[key]) hub.marks[key] = mark;
      const next = fadedLevel(level, mark, idleYears(state, mark), content);
      if (next !== level) path.skills = { ...path.skills, [skillId]: next };
    }
  }
  for (const m of state.fame.band?.members ?? []) {
    const key = memberKey(m.id);
    const mark = markOf(state, key, m.skill);
    if (!hub.marks[key]) hub.marks[key] = mark;
    const next = fadedLevel(m.skill, mark, idleYears(state, mark), content);
    if (next !== m.skill) m.skill = next;
  }
}
