/**
 * Career hub actions (C2): how hard you work at each role, auditions and hiring for the band, rehearsal, a young
 * player quitting a sport, and performance enhancers. Each takes effect at once, between years; the common
 * checks (between years, input validation, the input log) live in ./index.ts.
 */
import type { CommitLevel, RoleId } from '../types';
import { kickBlock, kickMember } from '../fame/band';
import { findBlock, findMembers, hireBlock, hireMember, rehearse, rehearseBlock, replaceCost } from '../hub/band';
import { enhancerBlock, startEnhancers, stopEnhancers } from '../hub/enhancers';
import { ROLE_IDS, activeRoles } from '../hub/load';
import { leaveForSwitch, youthSwitchable } from '../hub/shelf';
import { leaveSchoolTeam } from '../teen/activities';
import { retireSports } from '../sports/retire';
import { endScholarship } from '../sports/scholarship';
import { isLifeActionAvailable, type LifeActionParams, type LifeActionRule } from './life';

export const HUB_ACTION_IDS = ['set_role_commit', 'find_members', 'hire_member', 'replace_member', 'rehearse', 'quit_sport', 'start_enhancers', 'stop_enhancers'] as const;
export type HubActionId = (typeof HUB_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const none = (params: unknown): LifeActionParams | null => (params === undefined || only(params, []) ? {} : null);
const COMMITS: readonly CommitLevel[] = ['back', 'steady', 'all'];

export const HUB_ACTIONS: Record<HubActionId, LifeActionRule> = {
  set_role_commit: {
    parse: (params) => {
      const roleId = field(params, 'roleId');
      const commitment = field(params, 'commitment');
      return only(params, ['roleId', 'commitment']) && (ROLE_IDS as readonly unknown[]).includes(roleId) && (COMMITS as readonly unknown[]).includes(commitment)
        ? { roleId: roleId as RoleId, commitment: commitment as CommitLevel }
        : null;
    },
    allowed: (state, p, content) => {
      if (p.roleId === undefined || !activeRoles(state, content).includes(p.roleId)) return false;
      // The fame career's commitment is shared by sports, arts and social media: the same limits as E6b (a minor cannot go all in; a contract asks for its own).
      if ((p.roleId === 'sports' || p.roleId === 'fame' || p.roleId === 'social') && p.commitment !== state.fame.commitment) return isLifeActionAvailable(state, 'set_commitment', { commitment: p.commitment! }, content);
      return true;
    },
    apply: (state, p) => {
      const role = p.roleId!;
      // Sports, arts and media and social media share the fame career's commitment (E6b).
      if (role === 'sports' || role === 'fame' || role === 'social') state.fame.commitment = p.commitment!;
      else state.hub.commit[role] = p.commitment!;
    },
  },
  find_members: {
    parse: (params) => {
      const part = field(params, 'part');
      return only(params, ['part']) && typeof part === 'string' && part.length > 0 && part.length <= 40 ? { part } : null;
    },
    allowed: (state, p, content) => p.part !== undefined && findBlock(state, p.part, content) === null,
    apply: (state, p, content) => void findMembers(state, p.part!, content, state.rng),
  },
  hire_member: {
    parse: (params) => {
      const index = field(params, 'index');
      return only(params, ['index']) && typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 12 ? { index } : null;
    },
    allowed: (state, p, content) => p.index !== undefined && hireBlock(state, p.index, content) === null,
    apply: (state, p, content) => void hireMember(state, p.index!, content, state.rng),
  },
  // Replace a member: they go (it costs you with them and, a little, with the others) and auditions for their part open.
  replace_member: {
    parse: (params) => {
      const personId = field(params, 'personId');
      return only(params, ['personId']) && typeof personId === 'string' && personId.length > 0 && personId.length <= 60 ? { personId } : null;
    },
    allowed: (state, p) => p.personId !== undefined && kickBlock(state, p.personId) === null,
    apply: (state, p, content) => {
      const part = state.fame.band?.members.find((m) => m.id === p.personId)?.part;
      replaceCost(state, p.personId!, content);
      if (kickMember(state, p.personId!, content) && part !== undefined) findMembers(state, part, content, state.rng);
    },
  },
  rehearse: {
    parse: none,
    allowed: (state, _p, content) => rehearseBlock(state, content) === null,
    apply: (state, _p, content) => void rehearse(state, content),
  },
  // A child or teen leaves their sport with no wait: its skills are shelved, a band and the fans stay.
  quit_sport: {
    parse: none,
    allowed: (state, _p, content) => youthSwitchable(state, content),
    apply: (state, _p, content) => {
      const def = state.sports.sport!;
      state.hub.enhancers.on = false;
      if (state.fame.second === null) {
        retireSports(state, null, 'retired', content, state.rng);
        return;
      }
      // A second career (a band) goes on as the main one.
      const second = state.fame.second;
      leaveSchoolTeam(state, def, content);
      endScholarship(state, content);
      const kept = leaveForSwitch(state);
      const f = state.fame;
      f.active = true;
      f.main = second;
      f.second = null;
      f.paths[second] = kept.secondPath!;
      if (kept.oldPath) f.paths[kept.sport] = kept.oldPath;
      f.band = kept.band;
      f.instrument = kept.instrument;
      f.offers = kept.offers;
      f.image = kept.image;
      f.mood = kept.mood;
      f.fans = kept.fans;
      f.burnout = kept.burnout;
      f.commitment = kept.commitment;
      state.sports.team = null;
      state.sports.club = null;
      state.sports.sport = null;
      state.sports.seasons = kept.seasons;
    },
  },
  start_enhancers: {
    parse: none,
    allowed: (state, _p, content) => enhancerBlock(state, true, content) === null,
    apply: (state, _p, content) => void startEnhancers(state, content),
  },
  stop_enhancers: {
    parse: none,
    allowed: (state, _p, content) => enhancerBlock(state, false, content) === null,
    apply: (state, _p, content) => void stopEnhancers(state, content),
  },
};
