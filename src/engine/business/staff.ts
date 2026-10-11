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
import { managerWage, wageOf } from './model';
import { livingStaff, managerOf, staffIds } from './query';

export type HireBlock = 'unknown' | 'age' | 'full' | 'person' | 'location' | 'city' | 'savings' | 'manager' | 'affection';

/** Cost of bringing someone on: a share of a year's pay (their first year's pay comes from the business). */
export function hiringCost(def: BusinessDef, b: Business, licensed: boolean, manager: boolean, content: ContentBundle): number {
  const wage = manager ? managerWage(def, b.style, b.cityId, b.pay, 50, content) : wageOf(def, b.style, b.cityId, b.pay, 50, licensed, 1, content);
  return wholeDollars(wage * content.balance.business.staff.hiring);
}

/** Named staff a business can still take on (a manager and a co-founder don't count). */
export function staffRoom(state: LifeState, b: Business, content: ContentBundle): number {
  return content.balance.business.limits.namedStaff - livingStaff(state, b).filter((s) => !s.manager).length;
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
  licensed?: boolean;
  manager?: boolean;
}

/** Why you cannot hire this way, or null. */
export function hireBlock(state: LifeState, b: Business, def: BusinessDef, opts: HireOptions, content: ContentBundle): HireBlock | null {
  const lim = content.balance.business.limits;
  if (state.character.age < lim.minAge) return 'age';
  if (!opts.manager && staffRoom(state, b, content) <= 0) return 'full';
  if (opts.manager && managerOf(b)) return 'manager';
  const loc = opts.locationId === undefined || opts.locationId === null ? null : b.locations.find((l) => l.id === opts.locationId);
  if (opts.locationId !== undefined && opts.locationId !== null && !loc) return 'location';
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
  if (opts.licensed && def.license) person.occupation = def.license.job;
  else if (def.occupation !== undefined && !opts.manager) person.occupation = def.occupation;
  const skill = opts.manager ? clampInt(rollScore(state.rng, content.balance.business.manager.skill) + staffC.smartsLift * (person.smarts - 50), 5, 100) : rollSkill(state, person, content);
  const honesty = opts.manager ? clampInt(rollScore(state.rng, content.balance.business.manager.honesty) + (rel.affection - 50) * 0.3, 0, 100) : undefined;
  const entry: BusinessStaff = {
    personId: id,
    locationId: opts.manager ? null : (loc?.id ?? b.locations[0]!.id),
    title: opts.manager ? def.managerTitle : licensed && def.license ? def.license.title : def.staffTitle,
    skill,
    morale: clampInt(staffC.morale.start + (rel.affection - 50) * staffC.morale.bond, 0, 100),
    since: state.currentYear,
    licensed,
    raise: 1,
    wage: 0,
    ...(opts.manager ? { manager: true as const, honesty: honesty! } : {}),
  };
  entry.wage = opts.manager ? managerWage(def, b.style, b.cityId, b.pay, skill, content) : wageOf(def, b.style, cityId, b.pay, skill, licensed, 1, content);
  tieToStaff(state, b, id, content);
  b.staff.push(entry);
  if (!quiet) spend(state, hiringCost(def, b, licensed, opts.manager === true, content), content);
  return id;
}

/** Someone leaves the staff: the person stays in your life, no longer protected as staff. */
export function removeStaff(state: LifeState, b: Business, personId: Id): void {
  const gone = b.staff.find((s) => s.personId === personId);
  b.staff = b.staff.filter((s) => s.personId !== personId);
  // With the manager gone, you are running it again.
  if (gone?.manager && b.role === 'manager') b.role = 'self';
  const person = state.people[personId];
  if (person && !staffIds(state).has(personId)) person.tags = person.tags.filter((t) => t !== 'staff');
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
export function moraleAim(state: LifeState, b: Business, s: BusinessStaff, profitable: boolean, content: ContentBundle): number {
  const m = content.balance.business.staff.morale;
  const lv = content.balance.business.levels;
  const rel = state.relationships[s.personId];
  let aim = m.base + lv.pay[b.pay].morale + lv.staffing[b.staffing].morale + (state.character.personality.kindness - 50) * m.kindness + ((rel?.affection ?? 50) - 50) * m.bond;
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
