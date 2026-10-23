/**
 * Staff (W3): named workers are people in your life, with ties, memories and a
 * wage, a skill and a morale of their own. Everyone else a location needs is
 * crew, paid the market wage by the model. People are hired from your circle or
 * newly met; they leave by quitting, being let go, moving away or dying.
 */
import type { BusinessDef, ContentBundle } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { spend, wholeDollars } from '../finance';
import { ageOf } from '../relationships';
import { clampInt, rollScore } from '../random';
import { chance } from '../rng';
import { addTie, canTie } from '../web/ties';
import type { Business, BusinessStaff, Id, LifeState, Person } from '../types';
import { fitPools, namedAt, setHeadcount } from './crew';
import { craftRole, crewRoles, licensedRole, managerRole, roleById } from './headcount';
import { managerWage, wageOf } from './model';
import { livingStaff, managerOf, staffIds } from './query';
import { removeStaff } from './roster';
import { tieCount } from '../web/ties';

export type HireBlock = 'unknown' | 'age' | 'full' | 'person' | 'location' | 'city' | 'savings' | 'manager' | 'affection' | 'role';

/** Cost of bringing someone on: a share of a year's pay (their first year's pay comes from the business). */
export function hiringCost(def: BusinessDef, b: Business, licensed: boolean, manager: boolean, content: ContentBundle): number {
  const wage = manager ? managerWage(def, b.style, b.cityId, b.pay, 50, content) : wageOf(def, b.style, b.cityId, b.pay, 50, licensed, 1, content);
  return wholeDollars(wage * content.balance.business.staff.hiring);
}

/** Named people all your businesses hold (the crew are counted, not named). */
export function namedTotal(state: LifeState): number {
  return state.business.items.reduce((n, x) => n + x.staff.length, 0);
}

/** Named people one location can still take on: under its own cap and under the cap across all your businesses. */
export function staffRoom(state: LifeState, b: Business, content: ContentBundle, locationId?: Id): number {
  const lim = content.balance.business.limits;
  const here = locationId ?? b.locations[0]!.id;
  const atLocation = b.staff.filter((s) => s.locationId === here).length;
  return Math.max(0, Math.min(lim.namedPerLocation - atLocation, lim.namedTotal - namedTotal(state)));
}

export interface Hireable {
  personId: Id;
  name: string;
  kind: string;
  age: number;
  affection: number;
  licensed: boolean;
}

/** People in your circle who could work in this business: adults who are free, in the city, and fond enough of you. */
export function hireCandidates(state: LifeState, b: Business, def: BusinessDef, content: ContentBundle, cityId?: Id): Hireable[] {
  const pool = content.balance.business.staff.pool;
  const ages = content.balance.business.staff.ages;
  const workingElsewhere = staffIds(state);
  const city = cityId ?? b.cityId;
  const owners = new Set(b.owners.map((o) => o.id));
  return Object.keys(state.relationships)
    .sort((a, c) => a.localeCompare(c, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const p = state.people[id];
      if (!p || !p.alive || rel.status !== 'active' || !pool.kinds.includes(rel.kind)) return [];
      const age = ageOf(state, p);
      if (age < ages.min || age > ages.max + 5 || rel.affection < pool.minAffection) return [];
      if (workingElsewhere.has(id) || owners.has(id) || p.cityId !== city) return [];
      // Nobody who took money from you before.
      if (rel.memories.some((m) => m.tag === 'stole_from_your_business')) return [];
      if (state.housing.partnerId === id && b.role === 'self') {
        // A partner who lives with you may work there too.
      }
      return [{ personId: id, name: `${p.name.first} ${p.name.last}`, kind: rel.kind, age, affection: rel.affection, licensed: def.license !== undefined && p.occupation === def.license.job }];
    });
}

function rollSkill(state: LifeState, p: Person, content: ContentBundle): number {
  const s = content.balance.business.staff;
  return clampInt(rollScore(state.rng, s.skill) + s.smartsLift * (p.smarts - 50), 5, 100);
}

function tieToStaff(state: LifeState, b: Business, id: Id, content: ContentBundle): void {
  // Colleagues get to know each other: one friendly tie to someone already working there.
  const others = livingStaff(state, b).filter((s) => s.personId !== id && canTie(state, id, s.personId));
  if (others.length === 0) return;
  addTie(state.web, id, others[0]!.personId, 'friends', rollScore(state.rng, content.balance.web.ties.start.friends), 'context', state.currentYear);
}

export interface HireOptions {
  /** Someone you know (else a new person is met). */
  personId?: Id;
  locationId?: Id | null;
  /** The role they fill (an id from the kind's roles); the craft role, or the licensed one for a licensed hire, when left out. */
  roleId?: Id;
  licensed?: boolean;
  manager?: boolean;
}

/** Why you cannot hire this way, or null. */
export function hireBlock(state: LifeState, b: Business, def: BusinessDef, opts: HireOptions, content: ContentBundle): HireBlock | null {
  const lim = content.balance.business.limits;
  if (state.character.age < lim.minAge) return 'age';
  const loc = opts.locationId === undefined || opts.locationId === null ? null : b.locations.find((l) => l.id === opts.locationId);
  if (opts.locationId !== undefined && opts.locationId !== null && !loc) return 'location';
  if (!opts.manager && staffRoom(state, b, content, loc?.id) <= 0) return 'full';
  if (opts.manager && managerOf(b)) return 'manager';
  if (opts.roleId !== undefined && !opts.manager && !crewRoles(def).some((r) => r.id === opts.roleId)) return 'role';
  if (opts.licensed && !def.license) return 'unknown';
  if (opts.personId !== undefined) {
    const c = hireCandidates(state, b, def, content, loc?.cityId).find((x) => x.personId === opts.personId);
    if (!c) return 'person';
    if (opts.licensed && !c.licensed) return 'person';
  }
  if (state.finances.savings < hiringCost(def, b, opts.licensed === true, opts.manager === true, content)) return 'savings';
  return null;
}

/** Hires someone: a person you know, or someone new. Returns their id (null if it could not be done). */
export function hireStaff(state: LifeState, b: Business, opts: HireOptions, content: ContentBundle, quiet = false): Id | null {
  const def = content.businesses[b.defId];
  if (!def) return null;
  const staffC = content.balance.business.staff;
  const loc = opts.locationId ? b.locations.find((l) => l.id === opts.locationId) : undefined;
  const cityId = loc?.cityId ?? b.cityId;
  let id = opts.personId;
  if (id === undefined) {
    id = createPerson(state, { kind: 'acquaintance', presence: 'city', createIfMissing: true, age: { min: staffC.ages.min, max: staffC.ages.max } }, state.rng, content) ?? undefined;
    if (id === undefined) return null;
    const p = state.people[id]!;
    p.cityId = cityId;
    p.tags = [...p.tags.filter((t) => t !== 'staff'), 'staff'];
    p.wealthLevel = 'working';
  }
  const person = state.people[id]!;
  if (!person.tags.includes('staff')) person.tags = [...person.tags, 'staff'];
  const rel = state.relationships[id]!;
  const licensed = opts.licensed === true || (def.license !== undefined && person.occupation === def.license.job);
  const job = opts.licensed && def.license ? def.license.job : def.occupation !== undefined && !opts.manager ? def.occupation : undefined;
  if (job !== undefined) {
    // A new job starts at the bottom of its track, so the person's level always sits on it.
    if (person.occupation !== job) person.occupation = job;
    if (person.life && (person.life.level < 1 || person.life.level > (content.jobs[job]?.levels.length ?? 1))) person.life.level = 1;
  }
  const skill = opts.manager ? clampInt(rollScore(state.rng, content.balance.business.manager.skill) + staffC.smartsLift * (person.smarts - 50), 5, 100) : rollSkill(state, person, content);
  const honesty = opts.manager ? clampInt(rollScore(state.rng, content.balance.business.manager.honesty) + (rel.affection - 50) * 0.3, 0, 100) : undefined;
  const role = opts.manager ? managerRole(def) : roleById(def, opts.roleId ?? (opts.licensed && licensedRole(def) ? licensedRole(def)!.id : craftRole(def).id));
  const entry: BusinessStaff = {
    personId: id,
    locationId: opts.manager ? null : (loc?.id ?? b.locations[0]!.id),
    roleId: role?.id ?? craftRole(def).id,
    title: opts.manager ? def.managerTitle : licensed && def.license ? def.license.title : (role?.title ?? def.staffTitle),
    skill,
    morale: clampInt(staffC.morale.start + (rel.affection - 50) * staffC.morale.bond, 0, 100),
    since: state.currentYear,
    licensed,
    raise: 1,
    wage: 0,
    ...(opts.manager ? { manager: true as const, honesty: honesty! } : {}),
  };
  entry.wage = opts.manager ? managerWage(def, b.style, b.cityId, b.pay, skill, content) : wageOf(def, b.style, cityId, b.pay, skill, licensed, 1, content, role?.wage ?? 1);
  tieToStaff(state, b, id, content);
  b.staff.push(entry);
  // A named head fills a place in the headcount; with none free there, the headcount grows by one.
  if (!opts.manager && entry.locationId !== null) {
    const have = b.headcount[entry.locationId]?.[entry.roleId] ?? 0;
    if (namedAt(b, entry.locationId, entry.roleId) > have) b.headcount[entry.locationId] = { ...(b.headcount[entry.locationId] ?? {}), [entry.roleId]: namedAt(b, entry.locationId, entry.roleId) };
    fitPools(b, entry.locationId, entry.roleId);
  }
  if (!quiet) spend(state, hiringCost(def, b, licensed, opts.manager === true, content), content);
  return id;
}

/** You let someone go: severance, and they remember it. */
export function fireStaff(state: LifeState, b: Business, personId: Id, content: ContentBundle): boolean {
  const s = b.staff.find((x) => x.personId === personId);
  const def = content.businesses[b.defId];
  if (!s || !def) return false;
  spend(state, wholeDollars(s.wage * content.balance.business.staff.severance), content);
  const rel = state.relationships[personId];
  if (rel) {
    rel.affection = clampInt(rel.affection - 8, 0, 100);
    rel.trust = clampInt(rel.trust - 6, 0, 100);
  }
  removeStaff(state, b, personId);
  return true;
}

/** A raise: pay up and morale up. */
export function raiseStaff(b: Business, personId: Id, content: ContentBundle): boolean {
  const s = b.staff.find((x) => x.personId === personId);
  if (!s) return false;
  const r = content.balance.business.staff.raise;
  s.raise = Math.round((s.raise + r.pay) * 1000) / 1000;
  s.morale = clampInt(s.morale + r.morale, 0, 100);
  return true;
}

/** Morale for one worker for the coming year: pulled toward an aim set by pay, staffing, your kindness and how the business is doing. */
export function moraleAim(state: LifeState, b: Business, s: BusinessStaff, profitable: boolean, content: ContentBundle, extra = 0, level: Business['staffing'] = b.staffing): number {
  const m = content.balance.business.staff.morale;
  const lv = content.balance.business.levels;
  const rel = state.relationships[s.personId];
  let aim = extra + m.base + lv.pay[b.pay].morale + lv.staffing[level].morale + (state.character.personality.kindness - 50) * m.kindness + ((rel?.affection ?? 50) - 50) * m.bond;
  aim += profitable ? m.profit : m.loss;
  // Work given to someone out of a job, and being there for their family, are remembered.
  if (rel?.memories.some((x) => x.tag === 'you_gave_them_work')) aim += m.loyalty.work;
  if (rel?.memories.some((x) => x.tag === 'you_were_there_for_their_family')) aim += m.loyalty.family;
  if (s.manager && b.role === 'manager') aim += 3;
  return aim;
}

export function quitChance(morale: number, content: ContentBundle): number {
  const pts = content.balance.business.staff.quit;
  if (morale <= pts[0]!.at) return pts[0]!.x;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const c = pts[i]!;
    if (morale <= c.at) return a.x + ((c.x - a.x) * (morale - a.at)) / (c.at - a.at || 1);
  }
  return pts[pts.length - 1]!.x;
}

/** Whether a named worker quits this year (a roll). */
export function quits(state: LifeState, s: BusinessStaff, content: ContentBundle): boolean {
  return chance(state.rng, quitChance(s.morale, content));
}

// ── B2: transfers, location managers and people from the crew ─────────────────

export type TransferBlock = 'unknown' | 'same' | 'location' | 'room' | 'savings' | 'family' | 'unwilling' | 'manager';
export type Willing = 'likely' | 'unsure' | 'unlikely';

/** How willing someone is to move to another city, from their morale, how fond of you they are, their ties and who is already there: a number, never a roll. */
export function willingness(state: LifeState, b: Business, s: BusinessStaff, toLocationId: Id, content: ContentBundle): number {
  const w = content.balance.business.locationManagers.willing;
  const rel = state.relationships[s.personId];
  const colleagues = b.staff.filter((x) => x.locationId === toLocationId && x.personId !== s.personId).length;
  return w.base + w.morale * s.morale + w.affection * (rel?.affection ?? 50) + w.ties * Math.min(3, colleagues + Math.min(2, tieCount(state.web, s.personId) / 4));
}

export function willingWord(score: number, content: ContentBundle): Willing {
  const w = content.balance.business.locationManagers.willing;
  return score >= w.likely ? 'likely' : score >= w.unlikely ? 'unsure' : 'unlikely';
}

/** What moving someone costs: a share of a year's wage, more for another city. */
export function transferCost(b: Business, s: BusinessStaff, toLocationId: Id, content: ContentBundle): number {
  const t = content.balance.business.locationManagers.transfer;
  const from = b.locations.find((l) => l.id === s.locationId);
  const to = b.locations.find((l) => l.id === toLocationId);
  return wholeDollars(s.wage * (from && to && from.cityId !== to.cityId ? t.otherCity : t.sameCity));
}

/** Someone who lives with a partner or children of their own cannot be moved to another city. */
export function tiedDown(state: LifeState, personId: Id): boolean {
  const life = state.people[personId]?.life;
  return life !== undefined && (life.partner !== null || life.children.length > 0);
}

export function transferBlock(state: LifeState, b: Business, personId: Id, locationId: Id, content: ContentBundle): TransferBlock | null {
  const s = b.staff.find((x) => x.personId === personId);
  const to = b.locations.find((l) => l.id === locationId);
  if (!s || s.manager) return 'unknown';
  if (!to) return 'location';
  if (s.locationId === locationId) return 'same';
  if (b.locations.some((l) => l.manager === personId)) return 'manager';
  if (staffRoom(state, b, content, locationId) <= 0) return 'room';
  const from = b.locations.find((l) => l.id === s.locationId);
  if (from && from.cityId !== to.cityId) {
    if (tiedDown(state, personId)) return 'family';
    if (willingWord(willingness(state, b, s, locationId, content), content) === 'unlikely') return 'unwilling';
  }
  return state.finances.savings >= transferCost(b, s, locationId, content) ? null : 'savings';
}

/** Moves a named person to another location of the business (another city too, if they are willing: then they move there). */
export function transferStaff(state: LifeState, b: Business, personId: Id, locationId: Id, content: ContentBundle): boolean {
  if (transferBlock(state, b, personId, locationId, content) !== null) return false;
  const s = b.staff.find((x) => x.personId === personId)!;
  const to = b.locations.find((l) => l.id === locationId)!;
  const from = b.locations.find((l) => l.id === s.locationId);
  const t = content.balance.business.locationManagers.transfer;
  const far = from !== undefined && from.cityId !== to.cityId;
  const word = far ? willingWord(willingness(state, b, s, locationId, content), content) : 'likely';
  spend(state, transferCost(b, s, locationId, content), content);
  s.locationId = locationId;
  s.morale = clampInt(s.morale + t.morale * (far ? (word === 'unsure' ? 2 : 1.5) : 1), 0, 100);
  const person = state.people[personId];
  if (far && person) person.cityId = to.cityId;
  // The role keeps its place at the new location.
  const target = b.headcount[locationId] ?? {};
  if (namedAt(b, locationId, s.roleId) > (target[s.roleId] ?? 0)) b.headcount[locationId] = { ...target, [s.roleId]: namedAt(b, locationId, s.roleId) };
  fitPools(b, locationId, s.roleId);
  if (from) fitPools(b, from.id, s.roleId);
  return true;
}

export type ManagerBlock = 'unknown' | 'person' | 'taken' | 'savings' | 'none';

export function appointFee(s: BusinessStaff, content: ContentBundle): number {
  return wholeDollars(s.wage * content.balance.business.locationManagers.appointFee);
}

/** A location manager is a named person already working at that location. */
export function appointBlock(state: LifeState, b: Business, def: BusinessDef, personId: Id, locationId: Id, content: ContentBundle): ManagerBlock | null {
  const loc = b.locations.find((l) => l.id === locationId);
  const s = b.staff.find((x) => x.personId === personId);
  if (!loc || !managerRole(def)) return 'unknown';
  if (!s || s.manager || s.locationId !== locationId) return 'person';
  if (loc.manager !== undefined) return 'taken';
  return state.finances.savings >= appointFee(s, content) ? null : 'savings';
}

export function appointManager(state: LifeState, b: Business, def: BusinessDef, personId: Id, locationId: Id, content: ContentBundle): boolean {
  if (appointBlock(state, b, def, personId, locationId, content) !== null) return false;
  const loc = b.locations.find((l) => l.id === locationId)!;
  const s = b.staff.find((x) => x.personId === personId)!;
  const role = managerRole(def)!;
  spend(state, appointFee(s, content), content);
  const rel = state.relationships[personId];
  s.honesty = clampInt(55 + ((rel?.affection ?? 50) - 50) * 0.4 + (s.skill - 50) * 0.2, 0, 100);
  s.skill = clampInt(s.skill + 6, 0, 100);
  const was = s.roleId;
  s.roleId = role.id;
  s.title = role.title;
  loc.manager = personId;
  fitPools(b, locationId, was);
  return true;
}

export function removeManagerBlock(b: Business, locationId: Id): ManagerBlock | null {
  const loc = b.locations.find((l) => l.id === locationId);
  return loc?.manager !== undefined ? null : 'none';
}

/** The manager steps back to an ordinary place at the location. */
export function removeLocationManager(b: Business, def: BusinessDef, locationId: Id): boolean {
  if (removeManagerBlock(b, locationId) !== null) return false;
  const loc = b.locations.find((l) => l.id === locationId)!;
  const s = b.staff.find((x) => x.personId === loc.manager);
  delete loc.manager;
  if (s) {
    const role = s.licensed && licensedRole(def) ? licensedRole(def)! : craftRole(def);
    delete s.honesty;
    s.roleId = role.id;
    s.title = s.licensed && def.license ? def.license.title : role.title;
    const have = b.headcount[locationId]?.[role.id] ?? 0;
    if (namedAt(b, locationId, role.id) > have) b.headcount[locationId] = { ...(b.headcount[locationId] ?? {}), [role.id]: namedAt(b, locationId, role.id) };
    fitPools(b, locationId, role.id);
  }
  return true;
}

/**
 * An event picks one of the crew and makes them a person: a named worker with ties, memories and gossip. The place they held in the
 * crew becomes theirs. Returns their id, or null when there is no crew there or no room for another named person.
 */
export function promoteFromCrew(state: LifeState, b: Business, content: ContentBundle, locationId?: Id): Id | null {
  const def = content.businesses[b.defId];
  if (!def) return null;
  const pools = b.crew.filter((p) => p.count > 0 && (locationId === undefined || p.locationId === locationId)).sort((x, y) => y.count - x.count || x.locationId.localeCompare(y.locationId, 'en', { numeric: true }) || x.roleId.localeCompare(y.roleId));
  const pool = pools.find((p) => staffRoom(state, b, content, p.locationId) > 0);
  if (!pool) return null;
  const id = hireStaff(state, b, { locationId: pool.locationId, roleId: pool.roleId }, content, true);
  if (id !== null) fitPools(b, pool.locationId, pool.roleId);
  return id;
}

/** A crew hire: the target for a role at a location grows by one (the head is hired and paid for when the year turns). */
export function hireCrew(b: Business, def: BusinessDef, locationId: Id, roleId: Id, content: ContentBundle): boolean {
  return setHeadcount(b, def, locationId, roleId, (b.headcount[locationId]?.[roleId] ?? 0) + 1, content);
}

export { leaveStaff, removeStaff } from './roster';

export { fitPools } from './crew';
