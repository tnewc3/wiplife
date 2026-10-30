/**
 * Load (C2): the roles you have take time, by how hard you work at each; the
 * total is your load. Above what you can carry, the points over cost Stress
 * and burnout and take from performance in every role, and way over, something
 * gives. A pro contract counts as a full-time job. Numbers: balance/careers.yaml hub.
 */
import type { ContentBundle } from '../../content/schemas';
import type { CommitLevel, Id, LifeState, RoleId } from '../types';

export const ROLE_IDS: readonly RoleId[] = ['school', 'job', 'gig', 'sports', 'fame', 'band', 'business', 'crime', 'social'];

/** How hard you work at a role now (steady unless you chose otherwise). */
export function commitOf(state: LifeState, role: RoleId): CommitLevel {
  // Sports, arts and media and social media share the commitment of the fame career (E6b); every other role has its own.
  if (role === 'sports' || role === 'fame' || role === 'social') return state.fame.commitment;
  return state.hub.commit[role] ?? 'steady';
}

/** Whether you play a sport on a team now (youth, school, college or pro). */
export function playsSport(state: LifeState): boolean {
  const s = state.sports;
  return state.fame.active && s.sport !== null && state.fame.main === s.sport && s.retired === undefined && (s.team !== null || s.club !== null) && !s.teamless;
}

/** The sport pays you as a full-time job (a pro contract). */
export function proContract(state: LifeState): boolean {
  return playsSport(state) && state.sports.pro && state.sports.contract !== null;
}

/** The paths of arts and media you work (not sports, not social media). */
export function artsPaths(state: LifeState, content: ContentBundle): Id[] {
  const f = state.fame;
  if (!f.active) return [];
  // A path with a band is the band's role; a faded career that has put nothing out for years takes no time.
  return [f.main, f.second].filter(
    (p): p is Id => p !== null && f.paths[p] !== undefined && content.famePaths[p] !== undefined && content.famePaths[p]!.sport === undefined && p !== 'social' && f.band?.path !== p && f.paths[p]!.last >= state.currentYear - 2,
  );
}

/** The roles you have now. */
export function activeRoles(state: LifeState, content: ContentBundle): RoleId[] {
  const out: RoleId[] = [];
  if (state.education.current !== null) out.push('school');
  if (state.career.job !== null) out.push('job');
  else if (state.career.gig) out.push('gig');
  if (playsSport(state)) out.push('sports');
  if (artsPaths(state, content).length > 0) out.push('fame');
  if (state.fame.active && state.fame.band !== null) out.push('band');
  if (state.business.items.length > 0) out.push('business');
  if (state.crime.crew !== null) out.push('crime');
  if (state.fame.active && (state.fame.main === 'social' || state.fame.second === 'social')) out.push('social');
  return out;
}

/** Points a role takes now. */
export function roleCost(state: LifeState, role: RoleId, content: ContentBundle): number {
  const costs = content.balance.careers.hub.roles;
  const level = commitOf(state, role);
  if (role === 'sports' && proContract(state)) return costs.proSports[level];
  return costs[role][level];
}

export interface LoadView {
  total: number;
  /** Points over what you can carry (0 when under). */
  over: number;
  comfortable: number;
  shares: Partial<Record<RoleId, number>>;
}

/** Your load now: each role's share and the total. A role at all-in adds a little extra. Reads only. */
export function loadNow(state: LifeState, content: ContentBundle): LoadView {
  const h = content.balance.careers.hub;
  const shares: Partial<Record<RoleId, number>> = {};
  let total = 0;
  for (const role of activeRoles(state, content)) {
    const cost = roleCost(state, role, content) + (commitOf(state, role) === 'all' ? h.over.allIn : 0);
    shares[role] = cost;
    total += cost;
  }
  return { total, over: Math.max(0, total - h.comfortable), comfortable: h.comfortable, shares };
}

/** The performance points lost to load and burnout in every role (0 under the load you can carry with no burnout). */
export function performancePenalty(state: LifeState, content: ContentBundle): number {
  const h = content.balance.careers.hub;
  const over = loadNow(state, content).over;
  const burn = Math.max(0, state.hub.burnout - h.burnout.above);
  const gave = state.hub.gave?.year === state.currentYear && state.hub.gave.what === 'job' ? h.gives.job : 0;
  return Math.round((over * h.over.performance + burn * h.burnout.performance + gave) * 10) / 10;
}
