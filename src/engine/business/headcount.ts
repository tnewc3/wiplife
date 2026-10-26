/**
 * Headcount (B2): the people a location has in each role. The staffing level
 * (lean, normal, generous) is a preset that fills the targets; the targets can
 * then be adjusted per role. Roles come from the kind's content; the location
 * manager's role is an extra person on top of the headcount.
 */
import type { BusinessDef, BusinessStyle, ContentBundle, RoleDef, StaffingLevel } from '../../content/schemas';
import type { Business, Id } from '../types';
import { staffNeed } from './model';

/** The roles that make up a location's headcount (everything but the location manager). */
export const crewRoles = (def: BusinessDef): RoleDef[] => def.roles.filter((r) => r.manager !== true);

export const managerRole = (def: BusinessDef): RoleDef | undefined => def.roles.find((r) => r.manager === true);

export const roleById = (def: BusinessDef, id: string): RoleDef | undefined => def.roles.find((r) => r.id === id);

/** The role named staff take by default (the craft role), and the role a licensed hire takes. */
export const craftRole = (def: BusinessDef): RoleDef => def.roles.find((r) => r.craft === true) ?? crewRoles(def)[0]!;
export const licensedRole = (def: BusinessDef): RoleDef | undefined => def.roles.find((r) => r.licensed === true);

/** Spreads `total` heads over the roles by their shares (largest remainder), then keeps each within its range. */
export function apportion(total: number, roles: readonly RoleDef[]): Record<Id, number> {
  const raw = roles.map((r) => total * r.share);
  const heads = raw.map((x) => Math.floor(x));
  let rest = total - heads.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [i, x - Math.floor(x)] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [i] of order) {
    if (rest <= 0) break;
    heads[i]!++;
    rest--;
  }
  const out: Record<Id, number> = {};
  roles.forEach((r, i) => {
    out[r.id] = Math.min(r.max, Math.max(r.min, heads[i]!));
  });
  return out;
}

/** The preset headcount of one location at a staffing level. */
export function presetHeads(def: BusinessDef, style: BusinessStyle, level: StaffingLevel, content: ContentBundle): Record<Id, number> {
  return apportion(staffNeed(def, style, level, content), crewRoles(def));
}

/** The most heads one location can hold. */
export const maxHeads = (def: BusinessDef, style: BusinessStyle, content: ContentBundle): number => Math.max(1, Math.round(def.styles[style].staff * content.balance.business.headcount.maxMultiple));

/** What each role needs at the normal preset (the headcount the style is sized for). */
export function needs(def: BusinessDef, style: BusinessStyle, content: ContentBundle): Record<Id, number> {
  return presetHeads(def, style, 'normal', content);
}

export interface Slot {
  roleId: Id;
  weight: number;
  need: number;
  count: number;
  skillSum: number;
}

/** The share of the need a location meets, from heads in each role (each role counts at most `roleCap` times its need). */
export function staffedRatio(slots: readonly Slot[], def: BusinessDef, style: BusinessStyle, content: ContentBundle): number {
  const cap = content.balance.business.headcount.roleCap;
  let got = 0;
  let want = 0;
  for (const s of slots) {
    const role = roleById(def, s.roleId);
    const fractional = (role?.share ?? 0) * def.styles[style].staff;
    got += s.weight * Math.min(s.count, cap * Math.max(s.need, fractional));
    want += s.weight * s.need;
  }
  return want > 0 ? Math.min(cap, got / want) : 1;
}

/** Target heads at a location by role: what the business holds, else the normal preset. */
export function targetHeads(b: Business, locationId: Id): Record<Id, number> {
  return b.headcount[locationId] ?? {};
}

export function totalHeads(b: Business): number {
  let n = 0;
  for (const loc of Object.values(b.headcount)) for (const v of Object.values(loc)) n += v;
  return n;
}
