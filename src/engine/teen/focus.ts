/**
 * The yearly focus (T1): where most of your energy goes this year (school,
 * friends, work or a passion). It shifts the year's gains: grades, how much
 * closer your friends get, teen income (in ./jobs.ts) and passion, which can
 * bring a hidden talent to light. A year with no focus chosen is an even one.
 * Numbers: balance/teen.yaml (focus, passion, friends).
 */
import type { ContentBundle, TeenFocusId } from '../../content/schemas';
import { discoverTalent } from '../discovery';
import { applyStatEffects } from '../systems/economy';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { activityPassion } from './activities';
import { cliqueDef, focusOf, isGrounded, myClique } from './query';

export type FocusBlock = 'age' | 'away' | 'school';

/** Why you can't choose a focus now, or null. */
export function focusBlock(state: LifeState, content: ContentBundle): FocusBlock | null {
  // Chosen between years, for the year about to begin: that year has to be a teen year.
  const next = state.character.age + 1;
  if (next < content.balance.teen.ages.from || next >= content.balance.relationships.adultAge) return 'age';
  if (state.housing.kind === 'incarcerated') return 'away';
  return null;
}

/**
 * You choose where the coming year's energy goes (replacing an earlier choice).
 * Choices are made between years, so they are for the year that is about to
 * begin; `focusOf` reads one once its year is the current year.
 */
export function chooseFocus(state: LifeState, id: TeenFocusId): void {
  state.teen.focus = { year: state.currentYear + 1, id };
}

/** The focus chosen for the coming year, if you have chosen one. */
export function nextFocus(state: LifeState): TeenFocusId | undefined {
  const f = state.teen.focus;
  return f !== null && f.year === state.currentYear + 1 ? f.id : undefined;
}

/** Closeness with your closest friends and classmates moves by `points` (up to the balance's number of people). */
export function applyFriendGain(state: LifeState, points: number, content: ContentBundle): void {
  if (points === 0) return;
  const city = state.character.cityId;
  const near = Object.values(state.relationships)
    .filter((r) => (r.kind === 'friend' || r.kind === 'classmate') && r.status === 'active' && state.people[r.personId]?.alive === true && state.people[r.personId]!.cityId === city)
    .sort((a, b) => b.affection - a.affection || (a.personId < b.personId ? -1 : 1))
    .slice(0, content.balance.teen.friends.people);
  for (const rel of near) rel.affection = clampInt(rel.affection + points, 0, 100);
}

/** The yearly effects of the focus (and of passion). */
export function runFocus(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  const b = content.balance.teen;
  const id = focusOf(state);
  const e = b.focus[id];
  const grounded = isGrounded(state) ? b.rules.groundedGain : 1;
  const cur = state.education.current;
  if (cur) cur.boost += e.grades;
  applyFriendGain(state, Math.round(e.friends * (e.friends > 0 ? grounded : 1)), content);
  applyStatEffects(state, e.stats);
  if (id !== 'none') t.focusYears[id] += 1;

  const crowd = myClique(state);
  const gain = Math.round((e.passion + (crowd ? (cliqueDef(content, crowd.defId)?.passion ?? 0) : 0) + activityPassion(state, content)) * grounded);
  t.passion = clampInt(t.passion + gain - b.passion.decay, 0, 100);

  // A hidden talent can come to light through a passion: with the focus, or with enough passion.
  const h = state.character.hidden;
  if (h.talent !== null && !h.talentDiscovered) {
    const p = e.talentChance + (t.passion >= b.passion.discoverAt ? 0.25 : 0);
    if (p > 0 && chance(state.rng, p)) discoverTalent(state, content);
  }
}
