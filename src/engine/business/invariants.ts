/**
 * Invariants for businesses (W3): the owners add up to the whole, the people
 * on staff exist and are marked as staff, loans are real debts of the right
 * kind and belong to one business, money is whole and cash is never
 * negative, and no one under the minimum age owns one.
 */
import { BUSINESS_STYLES, MARKETING_LEVELS, ORDER_LEVELS, OWNER_ROLES, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, TRAINING_LEVELS, type ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { namedAt } from './crew';
import { crewRoles, managerRole, maxHeads } from './headcount';

export function businessFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (m: string) => failures.push(m);
  const bs = state.business;
  const bal = content.balance.business;
  const money = (label: string, n: number) => {
    if (!Number.isInteger(n) || !Number.isSafeInteger(n)) fail(`${label} is not a whole amount (${n})`);
  };
  const score = (label: string, n: number) => {
    if (!Number.isInteger(n) || n < 0 || n > 100) fail(`${label} must be a whole number from 0 to 100 (${n})`);
  };
  if (bs.items.length > bal.limits.businesses) fail(`more than ${bal.limits.businesses} businesses`);
  if (bs.items.reduce((n, b) => n + b.locations.length, 0) > bal.limits.totalLocations) fail(`more than ${bal.limits.totalLocations} locations in all`);
  if (bs.items.reduce((n, b) => n + b.staff.length, 0) > bal.limits.namedTotal) fail(`more than ${bal.limits.namedTotal} named people in all`);
  if (bs.items.length > 0 && state.character.age < bal.limits.minAge) fail('a business owner under the minimum age');
  money('business.year.draw', bs.year.draw);
  money('business.year.inject', bs.year.inject);
  if (bs.year.draw < 0 || bs.year.inject < 0) fail('business.year holds a negative amount');
  const ids = new Set<string>();
  const loanOwner = new Map<string, string>();
  const locationIds = new Set<string>();
  for (const b of bs.items) {
    const label = `business ${b.id}`;
    if (ids.has(b.id)) fail(`${label}: duplicate id`);
    ids.add(b.id);
    const def = content.businesses[b.defId];
    if (!def) {
      fail(`${label}: unknown kind "${b.defId}"`);
      continue;
    }
    if (!(BUSINESS_STYLES as readonly string[]).includes(b.style)) fail(`${label}: unknown style`);
    if (!content.cities[b.cityId]) fail(`${label}: unknown city`);
    if (!b.name.trim() || b.name.length > bal.limits.nameLength) fail(`${label}: bad name`);
    if (b.founded > state.currentYear) fail(`${label}: founded in the future`);
    for (const [key, list] of [['prices', PRICE_LEVELS], ['marketing', MARKETING_LEVELS], ['qualityInvest', QUALITY_LEVELS], ['pay', PAY_LEVELS], ['staffing', STAFFING_LEVELS], ['role', OWNER_ROLES]] as const) {
      if (!(list as readonly string[]).includes(b[key])) fail(`${label}: unknown ${key} "${b[key]}"`);
    }
    for (const [key, n] of [['quality', b.quality], ['reputation', b.reputation], ['morale', b.morale]] as const) score(`${label}.${key}`, n);
    money(`${label}.cash`, b.cash);
    money(`${label}.assets`, b.assets);
    money(`${label}.skimmed`, b.skimmed);
    if (b.cash < 0 || b.assets < 0 || b.skimmed < 0) fail(`${label}: a negative amount`);
    if (b.locations.length < 1 || b.locations.length > bal.limits.locations) fail(`${label}: ${b.locations.length} locations`);
    for (const l of b.locations) {
      if (locationIds.has(l.id)) fail(`${label}: location id ${l.id} used twice`);
      locationIds.add(l.id);
      if (!content.cities[l.cityId]) fail(`${label}: location in an unknown city`);
      if (!(BUSINESS_STYLES as readonly string[]).includes(l.style)) fail(`${label}: location with an unknown style`);
      if (l.opened > state.currentYear) fail(`${label}: location opened in the future`);
    }
    // Owners: whole percents that add up to 100, you among them.
    const total = b.owners.reduce((s, o) => s + o.share, 0);
    if (total !== 100) fail(`${label}: owners hold ${total} percent`);
    if (b.owners.filter((o) => o.id === 'you').length !== 1) fail(`${label}: you must be an owner exactly once`);
    for (const o of b.owners) {
      if (!Number.isInteger(o.share) || o.share < 1 || o.share > 100) fail(`${label}: an owner holds ${o.share} percent`);
      money(`${label} owner put`, o.put);
      money(`${label} owner paid`, o.paid);
      if (o.put < 0 || o.paid < 0) fail(`${label}: an owner with a negative amount`);
      if (o.role === 'investor' && o.share > bal.funding.investors.maxTotal) fail(`${label}: an investor holds more than the cap`);
    }
    if (b.owners.filter((o) => o.role === 'investor').reduce((s, o) => s + o.share, 0) > bal.funding.investors.maxTotal) fail(`${label}: investors hold more than ${bal.funding.investors.maxTotal} percent`);
    if (b.owners.filter((o) => o.role === 'cofounder').length > 1) fail(`${label}: more than one co-founder`);
    // Staff.
    const seen = new Set<string>();
    let managers = 0;
    for (const s of b.staff) {
      if (seen.has(s.personId)) fail(`${label}: ${s.personId} on staff twice`);
      seen.add(s.personId);
      const p = state.people[s.personId];
      if (!p) fail(`${label}: staff member ${s.personId} is not a person in the life`);
      else {
        if (!p.tags.includes('staff')) fail(`${label}: staff member ${s.personId} is not marked as staff`);
        if (p.alive && state.relationships[s.personId] === undefined) fail(`${label}: staff member ${s.personId} has no relationship`);
      }
      score(`${label} staff skill`, s.skill);
      score(`${label} staff morale`, s.morale);
      if (s.manager) managers += 1;
      if (s.manager && s.locationId !== null) fail(`${label}: the manager is tied to one location`);
      if (!s.manager && (s.locationId === null || !b.locations.some((l) => l.id === s.locationId))) fail(`${label}: staff member ${s.personId} works at no location`);
      if (s.licensed && !def.license) fail(`${label}: a licensed worker where no licence is needed`);
    }
    if (managers > 1) fail(`${label}: more than one manager`);
    if (b.role === 'manager' && managers === 0) fail(`${label}: run by a manager it has not got`);
    for (const l of b.locations) {
      if (b.staff.filter((s) => s.locationId === l.id).length > bal.limits.namedPerLocation) fail(`${label}: more than ${bal.limits.namedPerLocation} named people at location ${l.id}`);
    }
    // B2: roles, headcount, crew, lines, stock and franchises.
    const crew = new Set(crewRoles(def).map((r) => r.id));
    const mgr = managerRole(def)?.id;
    for (const s of b.staff) {
      if (!crew.has(s.roleId) && s.roleId !== mgr) fail(`${label}: staff member ${s.personId} has an unknown role "${s.roleId}"`);
      if (s.manager !== true && s.locationId !== null) {
        const loc = b.locations.find((l) => l.id === s.locationId);
        const person = state.people[s.personId];
        if (loc && person && person.alive && person.cityId !== loc.cityId) fail(`${label}: staff member ${s.personId} lives in ${person.cityId}, not where their location is (${loc.cityId})`);
        if (s.roleId === mgr && loc?.manager !== s.personId) fail(`${label}: staff member ${s.personId} is a location manager of nowhere`);
      }
    }
    for (const l of b.locations) {
      for (const [k, n] of Object.entries(l.stock)) if (!Number.isFinite(n) || n < 0) fail(`${label}: location ${l.id} holds ${n} of ${k}`);
      for (const [k, n] of Object.entries(l.forecast)) if (!Number.isFinite(n) || n < 0) fail(`${label}: location ${l.id} forecasts ${n} of ${k}`);
      if (l.manager !== undefined) {
        const s = b.staff.find((x) => x.personId === l.manager);
        if (!s || s.roleId !== mgr || s.locationId !== l.id) fail(`${label}: location ${l.id} has a manager who is not a manager there`);
      }
      const target = b.headcount[l.id];
      if (!target) {
        fail(`${label}: location ${l.id} has no headcount`);
        continue;
      }
      let total = 0;
      for (const [role, n] of Object.entries(target)) {
        if (!crew.has(role)) fail(`${label}: headcount for unknown role "${role}"`);
        if (!Number.isInteger(n) || n < 0) fail(`${label}: headcount ${n} for ${role} at ${l.id}`);
        if (namedAt(b, l.id, role) > n) fail(`${label}: more named people than the headcount for ${role} at ${l.id}`);
        total += n;
      }
      if (total > maxHeads(def, l.style, content)) fail(`${label}: ${total} heads at ${l.id}, more than the cap`);
    }
    for (const id of Object.keys(b.headcount)) if (!b.locations.some((l) => l.id === id)) fail(`${label}: headcount for a location that is gone (${id})`);
    const poolKeys = new Set<string>();
    for (const p of b.crew) {
      const key = `${p.locationId}:${p.roleId}`;
      if (poolKeys.has(key)) fail(`${label}: two crew pools for ${key}`);
      poolKeys.add(key);
      if (!Number.isInteger(p.count) || p.count < 0) fail(`${label}: a crew pool with ${p.count} heads (${key})`);
      if (!b.locations.some((l) => l.id === p.locationId)) fail(`${label}: a crew pool at a location that is gone (${key})`);
      if (!crew.has(p.roleId)) fail(`${label}: a crew pool in an unknown role (${key})`);
      if (p.count + namedAt(b, p.locationId, p.roleId) > (b.headcount[p.locationId]?.[p.roleId] ?? 0)) fail(`${label}: the crew and named people in ${key} are more than the headcount`);
      score(`${label} crew skill`, Math.round(p.skill));
      score(`${label} crew morale`, Math.round(p.morale));
    }
    if (!(TRAINING_LEVELS as readonly string[]).includes(b.training)) fail(`${label}: unknown training "${b.training}"`);
    for (const [k, level] of Object.entries(b.orders)) if (!(ORDER_LEVELS as readonly string[]).includes(level)) fail(`${label}: unknown order level for ${k}`);
    const lineIds = new Set<string>();
    for (const line of b.lines) {
      if (lineIds.has(line.productId)) fail(`${label}: line ${line.productId} twice`);
      lineIds.add(line.productId);
      if (!def.products.some((p) => p.id === line.productId)) fail(`${label}: unknown line "${line.productId}"`);
      if (!(PRICE_LEVELS as readonly string[]).includes(line.price)) fail(`${label}: unknown price level for ${line.productId}`);
    }
    money(`${label}.stockValue`, b.stockValue);
    if (b.stockValue < 0) fail(`${label}: negative stock value`);
    if (b.franchises.length > bal.limits.franchises) fail(`${label}: more than ${bal.limits.franchises} franchises`);
    const fids = new Set<string>();
    for (const f of b.franchises) {
      if (fids.has(f.id) || locationIds.has(f.id)) fail(`${label}: franchise id ${f.id} used twice`);
      fids.add(f.id);
      if (!content.cities[f.cityId]) fail(`${label}: franchise in an unknown city`);
      score(`${label} franchise risk`, f.risk);
      score(`${label} franchise skill`, f.skill);
      money(`${label} franchise fee`, f.fee);
      money(`${label} franchise royalty`, f.royaltyPaid);
      if (f.royalty <= 0 || f.royalty > 0.5) fail(`${label}: a franchise with a royalty of ${f.royalty}`);
    }
    // Loans.
    for (const id of b.loanIds) {
      const d = state.finances.debts.find((x) => x.id === id);
      if (!d) fail(`${label}: loan ${id} is not a debt`);
      else if (d.kind !== 'business') fail(`${label}: loan ${id} is a ${d.kind} debt`);
      if (loanOwner.has(id)) fail(`${label}: loan ${id} also belongs to ${loanOwner.get(id)}`);
      loanOwner.set(id, b.id);
    }
    if (b.report) {
      for (const k of ['customers', 'demand', 'revenue', 'rent', 'wages', 'supplies', 'marketing', 'quality', 'other', 'profit', 'loanPayments', 'paidOut', 'draw', 'injected', 'cash', 'goodsCost', 'waste', 'lostSales', 'hiring', 'training', 'royalties', 'support'] as const) if (b.report[k] !== undefined) money(`${label}.report.${k}`, b.report[k]!);
      if (b.report.draw > b.report.paidOut) fail(`${label}: draw is more than was paid out`);
    }
  }
  for (const p of bs.past) {
    money('business.past net', p.net);
    money('business.past totalProfit', p.totalProfit);
  }
  // Every person marked as staff is on a staff list.
  const onStaff = new Set(bs.items.flatMap((b) => b.staff.map((s) => s.personId)));
  for (const [id, p] of Object.entries(state.people)) if (p.tags.includes('staff') && !onStaff.has(id)) fail(`person ${id} is marked as staff but works nowhere`);
  return failures;
}
