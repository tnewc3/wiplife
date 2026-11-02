/**
 * The band, the C2 way: "Find members" holds auditions and shows who came (a
 * pool whose quality depends on fame, city and reputation); you hire one of
 * them for the open part. Members are people in your life with ties to each
 * other (E4). Rehearsal makes the band tighter and the weaker players better,
 * through the shared skills rules. Band strength (the members' skill and the
 * chemistry) feeds the quality of the work (fame/band.ts bandQuality).
 * Numbers: balance/skills.yaml band.
 */
import type { ContentBundle } from '../../content/schemas';
import { audition, leaderBlock, liveMembers, memberAgeRange, recruitBlock, tieIn, type BandBlock } from '../fame/band';
import { curveAt } from '../curve';
import { pathDef } from '../fame/query';
import { clampInt } from '../random';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { commitOf } from './load';
import { auditionPool } from './pool';
import { memberKey, markOf, touchMark, useSkill } from './skills';
import { hasTalentFor } from '../fame/query';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Why you can't hold auditions for this part now, or null. */
export function findBlock(state: LifeState, part: Id, content: ContentBundle): BandBlock | null {
  return recruitBlock(state, part, content);
}

/** You hold auditions for a part. The people who came are kept until the year ends. */
export function findMembers(state: LifeState, part: Id, content: ContentBundle, rng: RngState): boolean {
  if (findBlock(state, part, content) !== null) return false;
  state.hub.pool = { year: state.currentYear, part, candidates: auditionPool(state, part, memberAgeRange(state, content), content, rng) };
  state.hub.totals.auditions += 1;
  return true;
}

/** The pool that is still good (the year it was held in). */
export function currentPool(state: LifeState): NonNullable<LifeState['hub']['pool']> | null {
  const pool = state.hub.pool;
  return pool !== null && pool.year === state.currentYear ? pool : null;
}

export function hireBlock(state: LifeState, index: number, content: ContentBundle): BandBlock | 'pool' | null {
  const pool = currentPool(state);
  const c = pool?.candidates[index];
  if (!pool || !c) return 'pool';
  return recruitBlock(state, pool.part, content);
}

/** You hire one of the people who came. They join the band and the people you know, tied to the rest of the band. */
export function hireMember(state: LifeState, index: number, content: ContentBundle, rng: RngState): boolean {
  if (hireBlock(state, index, content) !== null) return false;
  const pool = currentPool(state)!;
  const c = pool.candidates[index]!;
  const band = state.fame.band!;
  const m = audition(state, pool.part, c.skill, 'band_joined_you', content, rng, c.age, c.temper);
  if (!m) return false;
  band.members.push(m);
  tieIn(state, m.id, rng);
  state.fame.totals.memberChanges += 1;
  state.hub.totals.hired += 1;
  state.hub.pool = null;
  return true;
}

/** Replacing a member costs you with the one who goes (and, a little, with the others): the part is open for auditions next. */
export function replaceCost(state: LifeState, id: Id, content: ContentBundle): void {
  const r = content.balance.skills.band.replace;
  for (const m of liveMembers(state)) {
    const rel = state.relationships[m.id];
    if (!rel) continue;
    rel.affection = clampInt(rel.affection + (m.id === id ? r.affection : r.others), 0, 100);
  }
}

// ── Rehearsal ──────────────────────────────────────────────────────────────

/** Rehearsals this year so far. */
export function rehearsalsThisYear(state: LifeState): number {
  return state.hub.rehearsals.year === state.currentYear ? state.hub.rehearsals.count : 0;
}

export function rehearsalBudget(state: LifeState, content: ContentBundle): number {
  return content.balance.skills.band.sessions[commitOf(state, 'band')];
}

export type RehearseBlock = 'inactive' | 'prison' | 'none' | 'budget' | 'alone';

export function rehearseBlock(state: LifeState, content: ContentBundle): RehearseBlock | null {
  if (!state.fame.active) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (!state.fame.band) return 'none';
  if (liveMembers(state).length === 0) return 'alone';
  if (rehearsalsThisYear(state) >= rehearsalBudget(state, content)) return 'budget';
  return null;
}

/** What one rehearsal adds to a player at this skill: the band's chemistry makes it count for more. */
export function rehearsalGain(state: LifeState, skill: number, content: ContentBundle): number {
  const R = content.balance.skills.band.rehearsal;
  const chem = state.fame.band?.chemistry ?? 50;
  return Math.max(0, curveAt(R.year, skill) * R.perSession * (1 + (chem - 50) * R.chemistry));
}

/** A rehearsal: every member gets a little better (the weakest most), the band gets tighter and your own playing grows. Returns whether it was held. */
export function rehearse(state: LifeState, content: ContentBundle): boolean {
  if (rehearseBlock(state, content) !== null) return false;
  const f = state.fame;
  const band = f.band!;
  for (const m of liveMembers(state)) {
    const next = round1(Math.min(100, m.skill + rehearsalGain(state, m.skill, content)));
    m.skill = next;
    touchMark(state, memberKey(m.id), next);
  }
  band.chemistry = clampInt(band.chemistry + 1, 0, 100);
  // Your own playing: the part you play.
  const def = pathDef(content, band.path);
  const mine = def?.skills?.find((s) => s.id === band.part || (s.instrument === true && band.part === f.instrument));
  if (mine) useSkill(state, band.path, mine.id, content.balance.skills.growth.session, commitOf(state, 'band'), def !== undefined && hasTalentFor(state, def), content);
  const h = state.hub.rehearsals;
  state.hub.rehearsals = h.year === state.currentYear ? { year: h.year, count: h.count + 1 } : { year: state.currentYear, count: 1 };
  state.hub.totals.rehearsals += 1;
  return true;
}

/** The band's year: playing together makes the players better, whether or not you held rehearsals (a share of a full year's). Run by the hub step. */
export function bandYearGrowth(state: LifeState, content: ContentBundle): void {
  const band = state.fame.band;
  if (!band) return;
  const R = content.balance.skills.band.rehearsal;
  for (const m of liveMembers(state)) {
    const key = memberKey(m.id);
    const mark = markOf(state, key, m.skill);
    const gain = curveAt(R.year, m.skill) * R.baseline * (1 + (band.chemistry - 50) * R.chemistry);
    const next = round1(Math.min(100, m.skill + Math.max(0, gain)));
    m.skill = next;
    state.hub.marks[key] = { peak: Math.max(mark.peak, next), last: state.currentYear };
  }
}

/** Band strength (0–100): the members' playing and the chemistry. Reads only. */
export function bandStrength(state: LifeState, content: ContentBundle): number {
  const band = state.fame.band;
  const members = liveMembers(state);
  if (!band || members.length === 0) return 0;
  const S = content.balance.skills.band.strength;
  const skill = members.reduce((sum, m) => sum + m.skill, 0) / members.length;
  return clampInt(Math.round(skill * S.skill + band.chemistry * S.chemistry), 0, 100);
}

/** True when the player could lead auditions now. */
export function canLead(state: LifeState): boolean {
  return leaderBlock(state) === null;
}

