/**
 * Teams and clubs (T1, src/content/activities): trying out, belonging, what
 * a year of it does (stats, grades, the friends it brings, a passion, an
 * injury now and then) and what it costs. Fees go through the finance module.
 * Numbers: balance/teen.yaml (activities).
 */
import type { ActivityDef, ContentBundle } from '../../content/schemas';
import { scoreOf } from '../events/checks';
import { isIndependent, spend, wholeDollars } from '../finance';
import { changeSeverity } from '../health';
import { costOfLiving } from '../possessions/query';
import { applyStatEffects } from '../systems/economy';
import { clampInt } from '../random';
import { chance, nextInt } from '../rng';
import type { LifeState } from '../types';
import { teenHistory } from './cliques';
import { isGrounded } from './query';
import { applyFriendGain } from './focus';

export type ActivityBlock = 'age' | 'unknown' | 'member' | 'limit' | 'turnedAway' | 'away' | 'sport';

export function activityDef(content: ContentBundle, id: string): ActivityDef | undefined {
  const def = content.activities[id];
  return def && !def.retired ? def : undefined;
}

export const inActivity = (state: LifeState, id: string): boolean => state.teen.activities.some((a) => a.id === id);

/** Why you can't try for this team or club now, or null. */
export function activityBlock(state: LifeState, id: string, content: ContentBundle): ActivityBlock | null {
  const def = activityDef(content, id);
  if (!def) return 'unknown';
  if (state.housing.kind === 'incarcerated') return 'away';
  // Batch 3: open from the age the definition allows, to the adult age; a child's club belongs to the school they are in.
  if (state.character.age >= content.balance.relationships.adultAge || state.character.age < def.minAge) return 'age';
  if (state.character.age < content.balance.teen.ages.from && !state.education.current) return 'age';
  if (inActivity(state, id)) return 'member';
  // Batch 5: a school team in a sport is the sports career's school rung; you try out for it from the Sports screen.
  if (def.sport !== undefined) return 'sport';
  if (state.teen.activities.filter((a) => content.activities[a.id]?.sport === undefined).length >= content.balance.teen.activities.max) return 'limit';
  const cut = state.teen.turnedAway[id];
  if (cut !== undefined && state.currentYear - cut < content.balance.teen.activities.cutWait) return 'turnedAway';
  return null;
}

/** The school team in a sport (Batch 5), if the game has one. */
export function sportActivity(content: ContentBundle, sportId: string | null): ActivityDef | undefined {
  if (sportId === null) return undefined;
  return Object.values(content.activities).find((a) => a.sport === sportId && !a.retired);
}

/** Why you cannot be on a school team in a sport now (age, school, prison), or null. Cuts and the team limit are the sports system's (a sports team does not count toward the limit). */
export function schoolTeamBlock(state: LifeState, def: ActivityDef, content: ContentBundle): 'age' | 'away' | null {
  if (state.housing.kind === 'incarcerated') return 'away';
  if (state.character.age >= content.balance.relationships.adultAge || state.character.age < def.minAge) return 'age';
  if (state.character.age < content.balance.teen.ages.from && !state.education.current) return 'age';
  return null;
}

/** Puts you on the school team of a sport as its varsity or junior varsity (one record with the sports career); a better place replaces a lesser one. */
export function seatOnSchoolTeam(state: LifeState, def: ActivityDef, tier: 'jv' | 'varsity'): void {
  const mine = state.teen.activities.find((a) => a.id === def.id);
  if (mine) {
    mine.tier = tier;
    return;
  }
  state.teen.activities.push({ id: def.id, since: state.currentYear, tier });
}

/** Takes you off the school team of a sport (it ended, or you moved up or away). */
export function leaveSchoolTeam(state: LifeState, sportId: string | null, content: ContentBundle): boolean {
  const def = sportActivity(content, sportId);
  if (!def || !inActivity(state, def.id)) return false;
  state.teen.activities = state.teen.activities.filter((a) => a.id !== def.id);
  return true;
}

/** The chance of making it: a club takes everyone (1). */
export function tryoutChance(state: LifeState, def: ActivityDef): number {
  if (!def.tryout) return 1;
  let points = def.tryout.base;
  for (const s of def.tryout.stats) points += s.weight * (scoreOf(state, s.key) - 50);
  return clampInt(points, 5, 95) / 100;
}

/** What a year of it costs you now, in your city. */
export function activityCost(state: LifeState, def: ActivityDef, content: ContentBundle): number {
  return wholeDollars(def.cost * costOfLiving(state, content));
}

/** You try out (or sign up): returns whether you are in. */
export function joinActivity(state: LifeState, id: string, content: ContentBundle): boolean {
  if (activityBlock(state, id, content) !== null) return false;
  const def = activityDef(content, id)!;
  if (!chance(state.rng, tryoutChance(state, def))) {
    state.teen.turnedAway[id] = state.currentYear;
    teenHistory(state, 'activityCut', { activity: def.name }, content);
    return false;
  }
  state.teen.activities.push({ id, since: state.currentYear });
  teenHistory(state, 'activityJoined', { activity: def.name }, content);
  return true;
}

export function leaveActivity(state: LifeState, id: string, content: ContentBundle): boolean {
  if (!inActivity(state, id)) return false;
  state.teen.activities = state.teen.activities.filter((a) => a.id !== id);
  teenHistory(state, 'activityLeft', { activity: content.activities[id]?.name ?? 'the team' }, content);
  // Batch 5: a school sports team and the sports career share one record: leaving the team leaves it in both.
  const sport = content.activities[id]?.sport;
  if (sport !== undefined && state.sports.sport === sport && state.sports.team?.level === 'school') {
    state.sports.team = null;
    state.sports.teamless = true;
  }
  return true;
}

/** Passion points a year from the teams and clubs you belong to. */
export function activityPassion(state: LifeState, content: ContentBundle): number {
  return state.teen.activities.reduce((sum, a) => sum + (content.activities[a.id]?.passion ?? 0), 0);
}

/** The yearly part: fees, stat pulls, grades, friends, injuries. A team or club you are too old for (or can't reach) ends. */
export function runActivities(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  if (t.activities.length === 0) return;
  if (state.character.age >= content.balance.relationships.adultAge || state.housing.kind === 'incarcerated') {
    t.activities = [];
    // Batch 5: a school sports team goes with the record.
    if (state.sports.team?.level === 'school') {
      state.sports.team = null;
      state.sports.teamless = true;
    }
    return;
  }
  const grounded = isGrounded(state) ? content.balance.teen.rules.groundedGain : 1;
  for (const a of [...t.activities]) {
    const def = content.activities[a.id];
    if (!def) {
      t.activities = t.activities.filter((x) => x !== a);
      continue;
    }
    // Fees: your savings first; a minor's family covers the rest (a grown teen's shortfall is debt).
    if (state.currentYear > a.since || !isIndependent(state, content)) spend(state, activityCost(state, def, content), content);
    applyStatEffects(state, def.effects);
    const cur = state.education.current;
    if (cur) cur.boost += def.grades;
    applyFriendGain(state, Math.round(def.friends * grounded), content);
    // A team of a sport you play does not roll an injury: the sports season does (and training never does).
    const playsIt = def.sport !== undefined && state.sports.sport === def.sport && state.fame.active && state.fame.main === def.sport;
    if (!playsIt && def.injury > 0 && chance(state.rng, def.injury)) changeSeverity(state, 'broken_bone', nextInt(state.rng, 25, 60), content);
  }
}
