/**
 * Membership (W2): joining and leaving a group, how committed you are, the
 * role you hold, how well regarded you are, the people a group brings into
 * your life (tied to each other through the social web), what it costs and
 * what it asks of your week. Numbers: balance/belonging.yaml (groups).
 */
import { GROUP_ROLE, type Commitment, type ContentBundle, type EventDef, type GroupDef } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { eventWeight } from '../events/selection';
import { clampInt, rollScore, weightedPick } from '../random';
import { nextInt, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import { addTie, canTie } from '../web/ties';
import type { GroupInstance, Id, LifeState, Membership, Person } from '../types';
import { ensureCity, cityGroups, findGroup } from './cities';
import { setPersonFaith } from './faith';
import { leaveGroup } from './leave';
import { instanceOf, isLeader, membershipOf, roleName, yearsIn } from './query';

/** A history line from text/belonging.yaml (values: {group}, {role}, {religion}). */
function history(state: LifeState, key: keyof ContentBundle['text']['belonging']['history'], values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.belonging.history[key], ['belonging', key], { values }, content);
}

/** The most committed hours a minor takes on; a young child goes where the family goes. */
const COMMITTED_AGE = 16;

export type JoinBlock = 'unknown' | 'member' | 'age' | 'away' | 'city' | 'full' | 'committedAge';

/** Why you can't join this group now (as this commitment), or null when you can. */
export function joinBlock(state: LifeState, groupId: Id, commitment: Commitment, content: ContentBundle): JoinBlock | null {
  const g = findGroup(state, groupId, content);
  const def = g && content.groups[g.defId];
  if (!g || !def || def.retired) return 'unknown';
  if (membershipOf(state, groupId)) return 'member';
  if (state.housing.kind === 'incarcerated') return 'away';
  if (g.cityId !== state.character.cityId) return 'city';
  const age = state.character.age;
  if (age < def.minAge || (def.maxAge !== undefined && age > def.maxAge)) return 'age';
  if (commitment === 'committed' && age < COMMITTED_AGE) return 'committedAge';
  if (state.belonging.memberships.length >= content.balance.belonging.groups.max) return 'full';
  return null;
}

/** Why you can't leave this group (you are not in it), or null. */
export const leaveBlock = (state: LifeState, groupId: Id): 'none' | null => (membershipOf(state, groupId) ? null : 'none');

/** The age range of the people a group brings: your own age group, or adults for adults. */
function memberAges(state: LifeState, def: GroupDef, content: ContentBundle): { min: number; max: number } {
  const m = content.balance.belonging.groups.members;
  const age = state.character.age;
  const { adultAge } = content.balance.relationships;
  if (age < adultAge) return { min: Math.max(def.minAge, 5, age - m.youthAge), max: Math.min(adultAge - 1, age + m.youthAge) };
  return { min: Math.max(adultAge, age - m.adultAges.below), max: Math.min(85, age + m.adultAges.above) };
}

/** The people in a group who are still alive and in your life. */
export function livingPeople(state: LifeState, g: GroupInstance): Id[] {
  return g.people.filter((id) => state.people[id]?.alive === true && state.relationships[id] !== undefined && state.relationships[id]!.status !== 'ended');
}

/** Makes one new person for a group: a friend in your city of the right age, who shares its religion if it has one. */
function makePerson(state: LifeState, g: GroupInstance, def: GroupDef, rng: RngState, content: ContentBundle): Id | null {
  const ages = memberAges(state, def, content);
  if (ages.min > ages.max) return null;
  const id = createPerson(state, { kind: 'friend', presence: 'city', createIfMissing: true, age: ages }, rng, content);
  if (id === null) return null;
  const person = state.people[id] as Person;
  const bal = content.balance.belonging;
  person.tags = [...person.tags, `group:${g.id}`];
  if (def.religion !== undefined) setPersonFaith(person, def.religion, rollScore(rng, bal.faith.household));
  state.relationships[id]!.affection = rollScore(rng, bal.groups.members.affection);
  return id;
}

/** Ties a new person to a few of the people already in the group, as friends (E4); the rest they only know of. */
function tieIn(state: LifeState, g: GroupInstance, id: Id, rng: RngState, content: ContentBundle): void {
  const { tieAffection, tiesPerMember } = content.balance.belonging.groups.members;
  const others = livingPeople(state, g).filter((other) => other !== id && canTie(state, id, other));
  for (let n = 0; n < tiesPerMember && others.length > 0; n++) {
    const [other] = others.splice(nextInt(rng, 0, others.length - 1), 1);
    addTie(state.web, id, other!, 'friends', rollScore(rng, tieAffection), 'context', state.currentYear);
  }
}

/** The people a group brings: made once, when you first join (3 to 5), tied to each other as friends. */
export function ensureMembers(state: LifeState, g: GroupInstance, rng: RngState, content: ContentBundle): void {
  const def = content.groups[g.defId];
  if (!def) return;
  g.people = livingPeople(state, g);
  if (g.people.length >= 2) return;
  const count = nextInt(rng, content.balance.belonging.groups.members.count.min, content.balance.belonging.groups.members.count.max);
  for (let i = 0; i < count; i++) {
    const id = makePerson(state, g, def, rng, content);
    if (id === null) continue;
    tieIn(state, g, id, rng, content);
    g.people.push(id);
  }
}

/** A committed member gets to know one more person there. */
export function growGroup(state: LifeState, g: GroupInstance, rng: RngState, content: ContentBundle): void {
  const def = content.groups[g.defId];
  if (!def || livingPeople(state, g).length >= content.balance.belonging.groups.members.max) return;
  const id = makePerson(state, g, def, rng, content);
  if (id === null) return;
  tieIn(state, g, id, rng, content);
  g.people.push(id);
}

/** You join a group. Does nothing if you can't. */
export function joinGroup(state: LifeState, groupId: Id, commitment: Commitment, content: ContentBundle, extra: { family?: true } = {}): boolean {
  if (joinBlock(state, groupId, commitment, content) !== null) return false;
  ensureCity(state, state.character.cityId, content);
  const g = instanceOf(state, groupId);
  const def = g && content.groups[g.defId];
  if (!g || !def) return false;
  const b = state.belonging;
  const year = state.currentYear;
  b.memberships.push({ groupId, since: year, commitment, rung: 0, rungSince: year, standing: content.balance.belonging.groups.standing.start, ...(extra.family ? { family: true as const } : {}) });
  ensureMembers(state, g, state.rng, content);
  history(state, extra.family ? 'family_took_along' : 'joined', { group: g.name }, content);
  return true;
}

/** Changes how committed you are to a group. */
export function setCommitment(state: LifeState, groupId: Id, commitment: Commitment): boolean {
  const m = membershipOf(state, groupId);
  if (!m || m.commitment === commitment) return false;
  if (commitment === 'committed' && state.character.age < COMMITTED_AGE) return false;
  m.commitment = commitment;
  // A role that needs a committed member can't be kept by someone who steps back.
  return true;
}

/** Why a member can't rise to the next role now, or null when they can. */
export function riseBlock(state: LifeState, m: Membership, content: ContentBundle): 'top' | 'years' | 'standing' | 'committed' | 'age' | null {
  const g = instanceOf(state, m.groupId);
  const def = g && content.groups[g.defId];
  if (!def) return 'top';
  const next = def.ladder[m.rung + 1];
  if (!next) return 'top';
  if (state.character.age < content.balance.relationships.adultAge && m.rung >= 1) return 'age';
  if (yearsIn(state, m) < next.minYears) return 'years';
  if (m.standing < next.minStanding) return 'standing';
  if (next.committed && m.commitment !== 'committed') return 'committed';
  return null;
}

/** Your standing in a group moves, within the floor and the ceiling. */
export function addStanding(state: LifeState, groupId: Id, delta: number, content: ContentBundle): void {
  const m = membershipOf(state, groupId);
  if (!m) return;
  const s = content.balance.belonging.groups.standing;
  m.standing = clampInt(m.standing + delta, s.floor, s.ceiling);
}

/** You rise a rung. The caller checks `riseBlock` unless an event decided it. */
export function promote(state: LifeState, groupId: Id, content: ContentBundle): boolean {
  const m = membershipOf(state, groupId);
  const g = instanceOf(state, groupId);
  const def = g && content.groups[g.defId];
  if (!m || !g || !def || m.rung + 1 >= def.ladder.length) return false;
  m.rung += 1;
  m.rungSince = state.currentYear;
  const bal = content.balance.belonging;
  addStanding(state, groupId, bal.groups.rise.standing, content);
  state.belonging.community = clampInt(state.belonging.community + bal.groups.rise.community, 0, 100);
  history(state, 'rose', { group: g.name, role: roleName(m, def) }, content);
  return true;
}

/** You step down a rung. */
export function demote(state: LifeState, groupId: Id, content: ContentBundle): boolean {
  const m = membershipOf(state, groupId);
  const g = instanceOf(state, groupId);
  const def = g && content.groups[g.defId];
  if (!m || !g || !def || m.rung <= 0) return false;
  const was = roleName(m, def);
  m.rung -= 1;
  m.rungSince = state.currentYear;
  history(state, 'stepped_down', { group: g.name, role: was }, content);
  return true;
}

/** What a year in a group costs you: its dues, scaled by the city, and a share of what you earn; never more than a share of your income (and nothing if you earn nothing). */
export function groupCosts(state: LifeState, content: ContentBundle, gross: number, adult: boolean): number {
  if (!adult || state.belonging.memberships.length === 0 || gross <= 0) return 0;
  const bal = content.balance.belonging.groups.cost;
  const city = content.cities[state.character.cityId];
  const col = city?.costOfLiving ?? 1;
  const wealth = bal.wealth[state.character.familyWealth];
  let total = 0;
  for (const m of state.belonging.memberships) {
    const g = instanceOf(state, m.groupId);
    const def = g && content.groups[g.defId];
    if (!g || !def) continue;
    const cost = def.commitment[m.commitment].cost;
    total += cost.flat * col * wealth + cost.share * gross;
  }
  return Math.min(Math.round(total), Math.floor(bal.incomeCap * gross));
}

/** Each membership's yearly cost, for the Groups screen (the same arithmetic, before the cap). */
export function costOf(state: LifeState, m: Membership, content: ContentBundle, gross: number): number {
  const g = instanceOf(state, m.groupId);
  const def = g && content.groups[g.defId];
  if (!g || !def) return 0;
  const col = content.cities[state.character.cityId]?.costOfLiving ?? 1;
  const cost = def.commitment[m.commitment].cost;
  return Math.round(cost.flat * col * content.balance.belonging.groups.cost.wealth[state.character.familyWealth] + cost.share * Math.max(0, gross));
}

/** The memberships of a given type. */
export function membershipsOfType(state: LifeState, type: GroupDef['type'], content: ContentBundle): Membership[] {
  return state.belonging.memberships.filter((m) => {
    const g = instanceOf(state, m.groupId);
    return g !== undefined && content.groups[g.defId]?.type === type;
  });
}

/**
 * Queues one of a trigger's events for a group (picked by weight among those that fit now with the group bound), unless
 * one of them is already waiting for this year. `now` is this year's step; `next` the year that begins next.
 */
export function queueGroupEvent(state: LifeState, ids: readonly Id[], groupId: Id, content: ContentBundle, due: 'now' | 'next' = 'now'): boolean {
  const cast = { [GROUP_ROLE]: groupId };
  const options = ids.flatMap((id) => {
    const def: EventDef | undefined = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content, cast);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  const dueYear = due === 'now' ? state.currentYear : state.currentYear + 1;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  return true;
}

export { cityGroups, isLeader, leaveGroup };
