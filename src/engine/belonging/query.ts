/**
 * Questions about belonging (W2): the groups you belong to, your place in
 * them, what they ask of your week, your faith and your values. Light on
 * imports, so the condition evaluator can use it.
 */
import type { Compare, ContentBundle, FaithCondition, GroupCondition, GroupDef, ValueId } from '../../content/schemas';
import { GROUP_ROLE, VALUE_IDS } from '../../content/schemas';
import type { BelongingState, GroupInstance, Id, LifeState, Membership } from '../types';

export function emptyBelonging(): BelongingState {
  return {
    household: { faith: null, devotion: 0 },
    faith: { id: null, strength: 0, raised: null, since: null, changes: 0 },
    values: Object.fromEntries(VALUE_IDS.map((v) => [v, 50])) as Record<ValueId, number>,
    temperament: Object.fromEntries(VALUE_IDS.map((v) => [v, 50])) as Record<ValueId, number>,
    groups: {},
    cities: {},
    memberships: [],
    past: [],
    nextGroup: 1,
    community: 45,
    repCarry: 0,
    offered: {},
  };
}

function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export const groupDef = (content: ContentBundle, defId: string): GroupDef | undefined => content.groups[defId];

/** The group (a club, congregation or cause in a city) with this id, if you have seen it. */
export const instanceOf = (state: LifeState, groupId: Id | undefined): GroupInstance | undefined => (groupId === undefined ? undefined : state.belonging.groups[groupId]);

export const membershipOf = (state: LifeState, groupId: Id | undefined): Membership | undefined =>
  groupId === undefined ? undefined : state.belonging.memberships.find((m) => m.groupId === groupId);

/** The group an event is about, from its cast (the pseudo-role `@group`). */
export const castGroupId = (cast: Record<string, Id> | undefined): Id | undefined => cast?.[GROUP_ROLE];

/** The definition behind one of your groups. */
export function defOfGroup(state: LifeState, groupId: Id, content: ContentBundle): GroupDef | undefined {
  const g = instanceOf(state, groupId);
  return g ? content.groups[g.defId] : undefined;
}

/** Years you have been in a group. */
export const yearsIn = (state: LifeState, m: Membership): number => state.currentYear - m.since;

/** Your role in a group, in words ("Organizer"). */
export function roleName(m: Membership, def: GroupDef): string {
  return def.ladder[Math.min(m.rung, def.ladder.length - 1)]!.name;
}

/** At the top of the ladder. */
export const isLeader = (m: Membership, def: GroupDef): boolean => m.rung >= def.ladder.length - 1;

/** The hours a week your groups take: each membership's hours, stretched or eased by how intense the group is. */
export function weeklyHours(state: LifeState, content: ContentBundle): number {
  let hours = 0;
  for (const m of state.belonging.memberships) {
    const g = instanceOf(state, m.groupId);
    const def = g && content.groups[g.defId];
    if (!g || !def) continue;
    hours += def.commitment[m.commitment].hours * (0.7 + (0.6 * g.intense) / 100);
  }
  return Math.round(hours * 10) / 10;
}

/** The faith's name for text: "Catholicism", or the word for no religion. */
export function faithName(content: ContentBundle, id: Id | null): string {
  return id === null ? content.registries.belonging.noneName : (content.registries.belonging.faiths[id]?.name ?? id);
}

/** What a follower is called: "Catholic", or "someone with no religion". */
export function adherentName(content: ContentBundle, id: Id | null): string {
  return id === null ? content.registries.belonging.noneName.toLowerCase() : (content.registries.belonging.faiths[id]?.adherent ?? id);
}

/** Memberships in a group of your own religion. */
export function ownFaithMemberships(state: LifeState, content: ContentBundle): Membership[] {
  const id = state.belonging.faith.id;
  if (id === null) return [];
  return state.belonging.memberships.filter((m) => {
    const g = instanceOf(state, m.groupId);
    return g !== undefined && content.groups[g.defId]?.religion === id;
  });
}

/** True when the memberships/instances fit every field of the group condition. */
function fits(q: GroupCondition, state: LifeState, group: GroupInstance, m: Membership | undefined, content: ContentBundle): boolean {
  const def = content.groups[group.defId];
  if (!def) return false;
  if (q.type && !q.type.includes(def.type)) return false;
  if (q.def && !q.def.includes(def.id)) return false;
  if (q.religion && !(def.religion !== undefined && q.religion.includes(def.religion))) return false;
  if (q.welcome && !compare(group.welcome, q.welcome)) return false;
  if (q.strict && !compare(group.strict, q.strict)) return false;
  if (q.intense && !compare(group.intense, q.intense)) return false;
  const needsMembership = q.commitment || q.rung || q.leader !== undefined || q.years || q.standing;
  if (needsMembership) {
    if (!m) return false;
    if (q.commitment && !q.commitment.includes(m.commitment)) return false;
    if (q.rung && !compare(m.rung, q.rung)) return false;
    if (q.leader !== undefined && isLeader(m, def) !== q.leader) return false;
    if (q.years && !compare(yearsIn(state, m), q.years)) return false;
    if (q.standing && !compare(m.standing, q.standing)) return false;
  }
  return true;
}

/** The `group` condition (W2). With `assumeBound`, what is about the event's own group holds until a group is cast. */
export function groupHolds(q: GroupCondition, state: LifeState, cast: Record<string, Id> | undefined, content: ContentBundle | undefined, assumeBound = false): boolean {
  const b = state.belonging;
  if (q.count && !compare(b.memberships.length, q.count)) return false;
  if (q.community && !compare(b.community, q.community)) return false;
  if (q.hours) {
    if (!content || !compare(weeklyHours(state, content), q.hours)) return false;
  }
  const fieldsAboutGroup = q.type || q.def || q.religion || q.commitment || q.rung || q.leader !== undefined || q.years || q.standing || q.welcome || q.strict || q.intense;
  const bound = instanceOf(state, castGroupId(cast));
  // Before an event is cast, the group it is about is not known yet: what asks about that group is assumed to hold (it is checked again once cast).
  if (!bound && assumeBound && (q.member !== undefined || fieldsAboutGroup)) return true;
  if (bound) {
    const m = membershipOf(state, bound.id);
    if (q.member !== undefined && (m !== undefined) !== q.member) return false;
    if (!fieldsAboutGroup) return true;
    return content !== undefined && fits(q, state, bound, m, content);
  }
  if (!fieldsAboutGroup) return q.member === undefined || (b.memberships.length > 0) === q.member;
  if (!content) return false;
  const any = b.memberships.some((m) => {
    const g = instanceOf(state, m.groupId);
    return g !== undefined && fits(q, state, g, m, content);
  });
  // Without a group bound, `member: false` with fields means you belong to no group that fits them.
  return q.member === false ? !any : any;
}

/** The `faith` condition (W2). */
export function faithHolds(q: FaithCondition, state: LifeState, content: ContentBundle | undefined): boolean {
  const b = state.belonging;
  const f = b.faith;
  const name = f.id ?? 'none';
  if (q.id && !q.id.includes(name)) return false;
  if (q.strength && !compare(f.strength, q.strength)) return false;
  if (q.wavering !== undefined) {
    const line = content?.balance.belonging.faith.wavering;
    if (line === undefined || (f.id !== null && f.strength <= line) !== q.wavering) return false;
  }
  if (q.devout !== undefined) {
    const line = content?.balance.belonging.faith.devout;
    if (line === undefined || (f.id !== null && f.strength >= line) !== q.devout) return false;
  }
  if (q.raised && !q.raised.includes(f.raised ?? 'none')) return false;
  if (q.changed && !(f.since !== null && compare(state.currentYear - f.since, q.changed))) return false;
  if (q.leaning !== undefined && (state.character.latent.faith !== undefined) !== q.leaning) return false;
  if (q.pull) {
    const latent = state.character.latent.faith;
    if (!latent) return false;
    const pull = latent.id === null ? 'lose' : f.id === null ? 'find' : 'convert';
    if (!q.pull.includes(pull)) return false;
  }
  if (q.congregation !== undefined) {
    if (!content || f.id === null || (ownFaithMemberships(state, content).length > 0) !== q.congregation) return false;
  }
  return true;
}

/** A value's current level. */
export const valueOf = (state: LifeState, key: ValueId): number => state.belonging.values[key];
