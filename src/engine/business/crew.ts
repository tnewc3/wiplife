/**
 * The crew (B2): everyone a location has who is not a named person, counted
 * per location and role with an average skill and morale and no identity. A
 * business holds a target headcount per location and role; named people fill
 * some of those heads and the crew pool the rest. A pool loses heads at the quit
 * chance for its morale (one roll per pool a year) and refills to its target at
 * a hiring cost, so turnover is a cost and a morale problem, not clicking.
 * Numbers: balance/business.yaml (crew, headcount, training).
 */
import type { BusinessDef, ContentBundle, StaffingLevel } from '../../content/schemas';
import { wholeDollars } from '../finance';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { Business, BusinessLocation, CrewPool, Id } from '../types';
import { crewRoles, maxHeads, presetHeads, roleById } from './headcount';
import { defaultLines } from './products';
import { marketWage } from './model';
import { quitChance } from './staff';

/** Named staff at a location in a role (the general manager and a location manager are not part of a headcount). */
export function namedAt(b: Business, locationId: Id, roleId: Id): number {
  return b.staff.filter((s) => s.manager !== true && s.locationId === locationId && s.roleId === roleId).length;
}

/** The named people of the business that count against the caps (everyone but the general manager). */
export function namedCount(b: Business): number {
  return b.staff.filter((s) => s.manager !== true).length;
}

export const crewPool = (b: Business, locationId: Id, roleId: Id): CrewPool | undefined => b.crew.find((p) => p.locationId === locationId && p.roleId === roleId);

/** Crew heads at a location. */
export function crewAt(b: Business, locationId: Id): number {
  return b.crew.filter((p) => p.locationId === locationId).reduce((s, p) => s + p.count, 0);
}

/** Makes sure every location has targets, every kind's line is on the list, and no pool or target belongs to a location that is gone. */
export function ensureModel(b: Business, def: BusinessDef, content: ContentBundle): void {
  const ids = new Set(b.locations.map((l) => l.id));
  for (const loc of b.locations) {
    loc.stock ??= {};
    loc.forecast ??= {};
    if (b.headcount[loc.id] === undefined) {
      b.headcount[loc.id] = presetHeads(def, loc.style, b.staffing, content);
      // A place is fitted out with its crew (the start-up cost covers them): their pools begin full, at no hiring cost.
      const c = content.balance.business.crew;
      for (const role of crewRoles(def)) {
        const need = (b.headcount[loc.id]![role.id] ?? 0) - namedAt(b, loc.id, role.id);
        if (need > 0 && !crewPool(b, loc.id, role.id)) b.crew.push({ locationId: loc.id, roleId: role.id, count: need, skill: c.skill.mean, morale: b.morale });
      }
    }
  }
  for (const id of Object.keys(b.headcount)) if (!ids.has(id)) delete b.headcount[id];
  b.crew = b.crew.filter((p) => ids.has(p.locationId));
  for (const line of defaultLines(def, b.style, content)) if (!b.lines.some((l) => l.productId === line.productId)) b.lines.push({ ...line, on: false });
}

/** Brings the model into line after named people were added, moved or removed: targets cover the named heads, and pools never exceed their targets. */
export function reconcileHeadcount(b: Business, def: BusinessDef, content: ContentBundle): void {
  ensureModel(b, def, content);
  for (const s of b.staff) {
    if (s.manager === true || s.locationId === null || !crewRoles(def).some((r) => r.id === s.roleId)) continue;
    const have = b.headcount[s.locationId]?.[s.roleId] ?? 0;
    const named = namedAt(b, s.locationId, s.roleId);
    if (named > have) b.headcount[s.locationId] = { ...(b.headcount[s.locationId] ?? {}), [s.roleId]: named };
  }
  for (const p of b.crew) {
    const target = b.headcount[p.locationId]?.[p.roleId] ?? 0;
    p.count = Math.max(0, Math.min(p.count, target - namedAt(b, p.locationId, p.roleId)));
  }
  b.crew = b.crew.filter((p) => p.count > 0);
}

/** The preset fills every location's targets (and keeps named heads in them). */
export function applyPreset(b: Business, def: BusinessDef, level: StaffingLevel, content: ContentBundle): void {
  for (const loc of b.locations) {
    const preset = presetHeads(def, loc.style, level, content);
    const target: Record<Id, number> = {};
    for (const r of crewRoles(def)) target[r.id] = Math.max(preset[r.id] ?? 0, namedAt(b, loc.id, r.id));
    b.headcount[loc.id] = target;
  }
}

export function headcountTotal(b: Business, locationId: Id): number {
  return Object.values(b.headcount[locationId] ?? {}).reduce((s, n) => s + n, 0);
}

export type HeadcountBlock = 'unknown' | 'role' | 'low' | 'high' | 'location' | 'named';

/** Why a target cannot be set: out of the role's range, over the location's cap, or below the named people already there. */
export function headcountBlock(b: Business, def: BusinessDef, locationId: Id, roleId: Id, count: number, content: ContentBundle): HeadcountBlock | null {
  const loc = b.locations.find((l) => l.id === locationId);
  if (!loc) return 'location';
  const role = crewRoles(def).find((r) => r.id === roleId);
  if (!role) return 'role';
  if (!Number.isInteger(count) || count < role.min) return 'low';
  if (count > role.max) return 'high';
  if (count < namedAt(b, locationId, roleId)) return 'named';
  const others = headcountTotal(b, locationId) - (b.headcount[locationId]?.[roleId] ?? 0);
  if (others + count > maxHeads(def, loc.style, content)) return 'high';
  return null;
}

/** Keeps a pool within its target after named people took heads or the target fell: named and crew together never exceed the target. */
export function fitPools(b: Business, locationId: Id, roleId: Id): void {
  const pool = b.crew.find((p) => p.locationId === locationId && p.roleId === roleId);
  if (!pool) return;
  const target = b.headcount[locationId]?.[roleId] ?? 0;
  pool.count = Math.max(0, Math.min(pool.count, target - namedAt(b, locationId, roleId)));
  if (pool.count === 0) b.crew = b.crew.filter((p) => p !== pool);
}

export function setHeadcount(b: Business, def: BusinessDef, locationId: Id, roleId: Id, count: number, content: ContentBundle): boolean {
  if (headcountBlock(b, def, locationId, roleId, count, content) !== null) return false;
  b.headcount[locationId] = { ...(b.headcount[locationId] ?? {}), [roleId]: count };
  fitPools(b, locationId, roleId);
  return true;
}

/** The pay of one crew head: the market wage, the role's multiple, the pay level and the pool's skill. */
export function crewPay(def: BusinessDef, loc: BusinessLocation, roleId: Id, skill: number, pay: Business['pay'], content: ContentBundle): number {
  const b = content.balance.business;
  const role = roleById(def, roleId);
  return marketWage(def, loc.style, loc.cityId, content) * b.costs.crewWage * b.levels.pay[pay].mult * (role?.wage ?? 1) * (1 + b.staff.skillWage * (skill - 50));
}

/**
 * Brings the pools to their targets: named people fill some heads, the crew the
 * rest. Returns the heads added (hired this step) with the cost of hiring them.
 */
export function syncCrew(b: Business, def: BusinessDef, content: ContentBundle): { hired: number; cost: number } {
  const c = content.balance.business.crew;
  let hired = 0;
  let cost = 0;
  for (const loc of b.locations) {
    const target = b.headcount[loc.id] ?? {};
    for (const role of crewRoles(def)) {
      const named = namedAt(b, loc.id, role.id);
      const want = Math.max(named, target[role.id] ?? 0);
      if (want > (target[role.id] ?? 0)) target[role.id] = want;
      const pool = crewPool(b, loc.id, role.id);
      const need = want - named;
      if (!pool) {
        if (need > 0) {
          b.crew.push({ locationId: loc.id, roleId: role.id, count: need, skill: c.skill.mean, morale: b.morale });
          hired += need;
          cost += need * crewPay(def, loc, role.id, c.skill.mean, b.pay, content) * content.balance.business.staff.hiring;
        }
        continue;
      }
      if (need > pool.count) {
        const add = need - pool.count;
        pool.skill = (pool.skill * pool.count + c.skill.mean * add) / need;
        hired += add;
        cost += add * crewPay(def, loc, role.id, pool.skill, b.pay, content) * content.balance.business.staff.hiring;
      }
      pool.count = need;
    }
    b.headcount[loc.id] = target;
  }
  b.crew = b.crew.filter((p) => p.count > 0);
  return { hired, cost: wholeDollars(cost) };
}

/** One roll per pool: heads leave at the quit chance for the pool's morale and are replaced at the refill cost. Returns heads lost and the cost. */
export function turnover(b: Business, def: BusinessDef, rng: Parameters<typeof chance>[0], content: ContentBundle): { lost: number; cost: number } {
  const c = content.balance.business.crew;
  let lost = 0;
  let cost = 0;
  for (const pool of b.crew) {
    const loc = b.locations.find((l) => l.id === pool.locationId);
    if (!loc || pool.count === 0) continue;
    const expected = pool.count * quitChance(pool.morale, content);
    const whole = Math.floor(expected);
    const left = Math.min(pool.count, whole + (chance(rng, expected - whole) ? 1 : 0));
    if (left === 0) continue;
    lost += left;
    cost += left * crewPay(def, loc, pool.roleId, pool.skill, b.pay, content) * c.refill;
    pool.skill = clampInt((pool.skill * (pool.count - left) + c.skill.mean * left) / pool.count, 0, 100);
  }
  return { lost, cost: wholeDollars(cost) };
}

/** Training lifts skill toward a ceiling. */
export function trainSkill(skill: number, gain: number, content: ContentBundle): number {
  const ceiling = content.balance.business.crew.ceiling;
  return skill >= ceiling ? skill : Math.min(ceiling, skill + gain);
}

/** The staffing level the actual headcount amounts to (its effects on morale and quality follow what is there, not the preset). */
export function levelFromRatio(ratio: number): StaffingLevel {
  return ratio < 0.87 ? 'lean' : ratio > 1.12 ? 'full' : 'normal';
}
