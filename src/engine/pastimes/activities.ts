/**
 * The Activities tab's rules (A1), on top of the leisure activities (./query.ts, ./perform.ts):
 *
 * - An activity of the tab (registries/activities.yaml) groups options (leisure definitions that name it as their `hub`).
 *   Repeats count across the activity: the gym's light and hard workouts share their diminishing returns, and the activity
 *   has a yearly limit of its own on top of each option's.
 * - Hobbies: practicing one grows its skill, which fades when you stop, can bring a hidden talent to light, and sets the
 *   flags that follow-up events about your craft require.
 * - Salon and shopping change your portrait: you choose what changes (a hairstyle, a dye, an outfit, glasses, earrings, a hat).
 *
 * Pure reading and small writes to the life; every number is in balance/activities.yaml.
 */
import { hobbyLevelOf, setHobbySkill } from '../hub/skills';
import type { ActivityHub, ContentBundle, PastimeDef, PastimeLook } from '../../content/schemas';
import { curveAt } from '../curve';
import { discoverTalent } from '../discovery';
import { chance } from '../rng';
import { stageOf } from '../looks/render';
import { yourLook } from '../looks/query';
import { STAGE_OPTIONS } from '../../portraits/availability';
import { CLOTHING_COLORS, EARRINGS, EYEWEAR, HAIR_COLORS, HATS } from '../../portraits/options';
import type { HairColor } from '../../portraits/ids';
import type { Id, LifeState } from '../types';

/** The activity of the tab this option belongs to, if any. */
export function hubOf(def: PastimeDef, content: ContentBundle): ActivityHub | undefined {
  return def.hub === undefined ? undefined : content.registries.activities.activities.find((a) => a.id === def.hub);
}

/** The key under which this option's repeats are counted for the year: its activity's (when the activity's options share their returns), or its own. */
export function repeatKey(def: PastimeDef, content: ContentBundle): string {
  const hub = hubOf(def, content);
  return hub?.sharedRepeats ? `hub:${hub.id}` : def.id;
}

/** How many times you did anything of this activity this year (`counts` belongs to this year only). */
export function hubCount(state: LifeState, hubId: Id): number {
  return state.pastimes.year === state.currentYear ? (state.pastimes.counts[`hub:${hubId}`] ?? 0) : 0;
}

/** Earlier times this year that count against this option's returns. */
export function repeatsOf(state: LifeState, def: PastimeDef, content: ContentBundle): number {
  if (state.pastimes.year !== state.currentYear) return 0;
  return state.pastimes.counts[repeatKey(def, content)] ?? 0;
}

/** Every option of an activity that exists, in a fixed order. */
export function optionsOf(content: ContentBundle, hubId: Id): PastimeDef[] {
  return Object.keys(content.pastimes)
    .sort()
    .map((id) => content.pastimes[id]!)
    .filter((d) => !d.retired && d.hub === hubId);
}

// ---------------------------------------------------------------------------------------------------------------- hobbies

/** Your skill in a hobby now: what you had when you last practiced, less a little for each year since you did. 0 for a hobby you haven't taken up. */
export function hobbySkill(state: LifeState, pastimeId: Id, _content: ContentBundle): number {
  // C2: hobby skills are on the shared skills system (src/engine/hub/skills.ts), which fades them from the third year untouched.
  return hobbyLevelOf(state, pastimeId);
}

/** 0 for someone with no skill yet, up to the number of levels. */
export function hobbyLevel(skill: number, content: ContentBundle): number {
  return content.balance.activities.hobbies.levels.filter((at) => skill >= at).length;
}

/** The flag each hobby sets once you have practiced it, and the one for being skilled at it. */
export const practicedFlag = (pastimeId: Id): string => `practiced_${pastimeId}`;
export const skilledFlag = (pastimeId: Id): string => `skilled_${pastimeId}`;

/**
 * Practice grew your skill by `gain` (already shrunk by repeats). Sets the hobby's flags and, now and then, brings a hidden
 * talent of the hobby's kind to light (your talent only: nobody finds a talent they don't have).
 */
export function practiceHobby(state: LifeState, def: PastimeDef, gain: number, repeats: number, content: ContentBundle): void {
  const hobby = def.hobby;
  if (!hobby) return;
  const b = content.balance.activities.hobbies;
  const skill = setHobbySkill(state, def.id, gain);
  const prev = state.hobbies[def.id];
  state.hobbies[def.id] = { year: state.currentYear, sessions: (prev?.sessions ?? 0) + 1 };
  state.flags[practicedFlag(def.id)] = true;
  if (skill >= b.skilledAt) state.flags[skilledFlag(def.id)] = true;
  const h = state.character.hidden;
  if (hobby.talent !== undefined && h.talent === hobby.talent && !h.talentDiscovered) {
    // A talent that has already come to light is not found twice; repeats in a year make each practice less revealing.
    const p = b.talent.base * curveAt(b.talent.curve, skill) * content.balance.activities.returns.repeat ** repeats;
    if (chance(state.rng, Math.min(1, p))) discoverTalent(state, content);
  }
}

// ---------------------------------------------------------------------------------------------------------------- looks

const wear = <T extends readonly string[]>(all: T, not: readonly string[]): string[] => all.filter((x) => !not.includes(x));

/** What you can choose at the salon or when shopping, for your body and age: a style, a dye, an outfit, a color, glasses, earrings or a hat. */
export function lookOptions(state: LifeState, kind: PastimeLook, content: ContentBundle): string[] {
  const look = yourLook(state, content);
  const stage = STAGE_OPTIONS[stageOf(state.character.age, content)];
  switch (kind) {
    case 'hairstyle': return [...stage.hairstyles[look.body]];
    case 'dye': return [...HAIR_COLORS];
    case 'outfit': return [...stage.outfits];
    case 'clothing': return [...CLOTHING_COLORS];
    case 'eyewear': return wear(EYEWEAR, ['none', 'original']);
    case 'earrings': return wear(EARRINGS, ['none']);
    case 'hat': return wear(HATS, ['none']);
  }
}

/** Puts the choice into your portrait: a dye is dated, so that it fades (balance/portraits.yaml dyeFadeYears). */
export function applyLook(state: LifeState, kind: PastimeLook, value: string, content: ContentBundle): void {
  const look = { ...yourLook(state, content) };
  switch (kind) {
    case 'hairstyle': look.hairstyle = value as typeof look.hairstyle; break;
    case 'dye': look.dye = { color: value as Exclude<HairColor, 'original'>, year: state.currentYear }; break;
    case 'outfit': look.outfit = value as typeof look.outfit; break;
    case 'clothing': look.clothing = value as typeof look.clothing; break;
    case 'eyewear': look.eyewear = value as typeof look.eyewear; break;
    case 'earrings': look.earrings = value as typeof look.earrings; break;
    case 'hat': look.hat = value as typeof look.hat; break;
  }
  state.character.look = look;
}
