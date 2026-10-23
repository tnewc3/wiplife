/**
 * Questions about your businesses (W3): what you own, who owns the rest,
 * who works there, the debts that go with it, and the `business` condition.
 * Light on imports, so the condition evaluator can use it.
 */
import { BUSINESS_ROLE, type BusinessCondition, type BusinessDef, type ChainDef, type Compare, type ContentBundle } from '../../content/schemas';
import type { Business, BusinessState, BusinessStaff, Id, LifeState } from '../types';
import { economyPhase } from './world';

export function emptyBusiness(): BusinessState {
  return { items: [], nextBusiness: 1, nextLocation: 1, taken: [], past: [], offered: {}, year: { year: 0, draw: 0, inject: 0 }, experience: {}, worth: 0 };
}

function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export const businessDef = (content: ContentBundle, defId: string): BusinessDef | undefined => content.businesses[defId];
export const chainDef = (content: ContentBundle, chainId: string | undefined): ChainDef | undefined => (chainId === undefined ? undefined : content.chains[chainId]);

export const businessById = (state: LifeState, id: Id | undefined): Business | undefined => (id === undefined ? undefined : state.business.items.find((b) => b.id === id));

/** The business an event is about, from its cast (the pseudo-role `@business`). */
export const castBusinessId = (cast: Record<string, Id> | undefined): Id | undefined => cast?.[BUSINESS_ROLE];

/** Your share of a business, in percent. */
export function yourShare(b: Business): number {
  return b.owners.find((o) => o.id === 'you')?.share ?? 0;
}

/** The debts taken for your businesses: they go with the business, not with the estate. */
export function businessLoanIds(state: LifeState): Set<Id> {
  const ids = new Set<Id>();
  for (const b of state.business.items) for (const id of b.loanIds) ids.add(id);
  return ids;
}

/** What you still owe on a business's loans. */
export function loanBalance(state: LifeState, b: Business): number {
  return b.loanIds.reduce((sum, id) => sum + (state.finances.debts.find((d) => d.id === id)?.balance ?? 0), 0);
}

/** Named staff who are still alive, in your life and in work (everyone on the list but a manager, in the order hired). */
export function livingStaff(state: LifeState, b: Business): BusinessStaff[] {
  return b.staff.filter((s) => state.people[s.personId]?.alive === true && state.relationships[s.personId] !== undefined && state.relationships[s.personId]!.status !== 'ended');
}

export const managerOf = (b: Business): BusinessStaff | undefined => b.staff.find((s) => s.manager === true);

/** The people who own the rest of the business (investors and a co-founder). */
export const otherOwners = (b: Business) => b.owners.filter((o) => o.id !== 'you');

/** True when you hold the trade licence (a trade_license credential, or work in the trade now). */
export function youHoldLicense(state: LifeState, license: { trade: string; job: string }): boolean {
  if (state.education.credentials.some((c) => c.type === 'trade_license' && c.refId === license.trade)) return true;
  return state.career.job?.jobId === license.job;
}

/** True when someone with the business's licence runs it: you (and you work there), or a licensed worker, or a co-founder who holds it. */
export function hasLicenseHolder(state: LifeState, b: Business, def: BusinessDef): boolean {
  const license = def.license;
  if (!license) return true;
  if (b.role === 'self' && youHoldLicense(state, license)) return true;
  if (b.staff.some((s) => s.licensed && state.people[s.personId]?.alive === true)) return true;
  return false;
}

/** Every business that is yours, by id. */
export const myBusinesses = (state: LifeState): Business[] => [...state.business.items].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

/** Staff, investors and co-founders across all your businesses (people who must stay in your life). */
export function businessPeople(state: LifeState): Set<Id> {
  const ids = new Set<Id>();
  for (const b of state.business.items) {
    for (const s of b.staff) ids.add(s.personId);
    for (const o of b.owners) if (o.id !== 'you') ids.add(o.id);
    for (const f of b.franchises) if (f.personId !== null) ids.add(f.personId);
  }
  return ids;
}

/** Staff only (for the people-list rules): the named workers of every business. */
export function staffIds(state: LifeState): Set<Id> {
  const ids = new Set<Id>();
  for (const b of state.business.items) for (const s of b.staff) ids.add(s.personId);
  return ids;
}

/** Cash needed to cover a month... (the yearly costs of a business, from its last report; 0 before one exists). */
export function yearlyCosts(b: Business): number {
  const r = b.report;
  return r ? r.rent + r.wages + r.supplies + r.marketing + r.quality + r.other + (r.hiring ?? 0) + (r.training ?? 0) : 0;
}

/** True when the business fits every field of the condition. */
function fits(q: BusinessCondition, state: LifeState, b: Business, content: ContentBundle): boolean {
  const def = content.businesses[b.defId];
  if (!def) return false;
  if (q.type && !q.type.includes(def.id)) return false;
  if (q.kind && !q.kind.includes(def.kind)) return false;
  if (q.style && !q.style.includes(b.style)) return false;
  if (q.role && !q.role.includes(b.role)) return false;
  if (q.years && !compare(state.currentYear - b.founded, q.years)) return false;
  if (q.locations && !compare(b.locations.length, q.locations)) return false;
  if (q.staff && !compare(livingStaff(state, b).filter((s) => !s.manager).length, q.staff)) return false;
  if (q.morale && !compare(b.morale, q.morale)) return false;
  if (q.reputation && !compare(b.reputation, q.reputation)) return false;
  if (q.quality && !compare(b.quality, q.quality)) return false;
  if (q.profit && !compare(b.report?.profit ?? 0, q.profit)) return false;
  if (q.cash && !compare(b.cash, q.cash)) return false;
  if (q.lossYears && !compare(b.lossYears, q.lossYears)) return false;
  if (q.chain !== undefined && (b.chainId !== undefined) !== q.chain) return false;
  if (q.investors !== undefined && b.owners.some((o) => o.role === 'investor') !== q.investors) return false;
  if (q.cofounder !== undefined && b.owners.some((o) => o.role === 'cofounder') !== q.cofounder) return false;
  if (q.loan !== undefined && (b.loanIds.some((id) => state.finances.debts.some((d) => d.id === id))) !== q.loan) return false;
  if (q.manager !== undefined && (managerOf(b) !== undefined) !== q.manager) return false;
  if (q.licensed !== undefined) {
    if (!def.license) return false;
    const held = hasLicenseHolder(state, b, def);
    if (held !== q.licensed) return false;
  }
  if (q.needsLicense !== undefined && (def.license !== undefined) !== q.needsLicense) return false;
  if (q.skimmed !== undefined && (b.skimmed > 0) !== q.skimmed) return false;
  if (q.rival !== undefined && b.shocks.some((s) => s.kind === 'rival' && s.until >= state.currentYear) !== q.rival) return false;
  // B2.
  if (q.sells && !q.sells.some((id) => b.lines.some((l) => l.on && l.productId === id))) return false;
  if (q.economy && !q.economy.includes(economyPhase(state.seed, state.currentYear, content))) return false;
  if (q.stocked) {
    const lines = b.report?.lines ?? [];
    const short = lines.some((l) => l.demand > 0 && l.lost / l.demand > content.balance.business.products.stockout.line);
    const surplus = (b.report?.goodsCost ?? 0) > 0 && (b.report?.waste ?? 0) / b.report!.goodsCost! > content.balance.business.products.wasteLine;
    const stateNow = short ? 'short' : surplus ? 'surplus' : 'fine';
    if (!q.stocked.includes(stateNow)) return false;
  }
  if (q.headcount && !compare(b.report?.heads ?? 0, q.headcount)) return false;
  if (q.crew && !compare(b.crew.reduce((s, p) => s + p.count, 0), q.crew)) return false;
  if (q.franchises && !compare(b.franchises.length, q.franchises)) return false;
  if (q.brandRisk && !compare(b.franchises.reduce((m, f) => Math.max(m, f.risk), 0), q.brandRisk)) return false;
  if (q.hasLocationManager !== undefined && b.locations.some((l) => l.manager !== undefined) !== q.hasLocationManager) return false;
  if (q.namedRoom !== undefined && (b.staff.length < content.balance.business.limits.namedPerLocation * b.locations.length && state.business.items.reduce((n, x) => n + x.staff.length, 0) < content.balance.business.limits.namedTotal) !== q.namedRoom) return false;
  if (q.understaffed !== undefined && (b.report?.notes.some((n) => n === 'understaffed' || n === 'overworked') ?? false) !== q.understaffed) return false;
  if (q.franchiseReady !== undefined) {
    const f = content.balance.business.franchise;
    const ready = state.currentYear - b.founded >= f.minYears && b.locations.length >= f.minLocations && b.quality >= f.minQuality && b.reputation >= f.minReputation && b.franchises.length < content.balance.business.limits.franchises;
    if (ready !== q.franchiseReady) return false;
  }
  return true;
}

const hasFields = (q: BusinessCondition): boolean => Object.keys(q).some((k) => k !== 'owned' && k !== 'count' && k !== 'failedWithin' && k !== 'soldWithin' && k !== 'experience');

/** The `business` condition (W3). With `assumeBound`, what asks about the event's own business holds until one is cast. */
export function businessHolds(q: BusinessCondition, state: LifeState, cast: Record<string, Id> | undefined, content: ContentBundle | undefined, assumeBound = false): boolean {
  const items = state.business.items;
  if (q.count && !compare(items.length, q.count)) return false;
  if (q.failedWithin !== undefined && !state.business.past.some((p) => p.end === 'failed' && state.currentYear - p.toYear <= q.failedWithin!)) return false;
  if (q.soldWithin !== undefined && !state.business.past.some((p) => p.end === 'sold' && state.currentYear - p.toYear <= q.soldWithin!)) return false;
  if (q.experience && !compare(Object.values(state.business.experience).reduce((a, n) => a + n, 0), q.experience)) return false;
  const bound = businessById(state, castBusinessId(cast));
  if (!bound && assumeBound && (q.owned !== undefined || hasFields(q))) return true;
  if (bound) {
    if (q.owned !== undefined && !q.owned) return false;
    if (!hasFields(q)) return true;
    return content !== undefined && fits(q, state, bound, content);
  }
  if (!hasFields(q)) return q.owned === undefined || (items.length > 0) === q.owned;
  if (!content) return false;
  const any = items.some((b) => fits(q, state, b, content));
  return q.owned === false ? !any : any;
}

/** What you own of all your businesses, as the share of their value that is yours (the caller passes the valuer). */
export function equityOf(state: LifeState, valueOf: (b: Business) => number): number {
  return state.business.items.reduce((sum, b) => sum + Math.round((valueOf(b) * yourShare(b)) / 100), 0);
}
