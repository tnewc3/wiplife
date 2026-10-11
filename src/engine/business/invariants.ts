/**
 * Invariants for businesses (W3): the owners add up to the whole, the people
 * on staff exist and are marked as staff, loans are real debts of the right
 * kind and belong to one business, money is whole and cash is never
 * negative, and no one under the minimum age owns one.
 */
import { BUSINESS_STYLES, MARKETING_LEVELS, OWNER_ROLES, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, type ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

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
    if (b.staff.filter((s) => !s.manager).length > bal.limits.namedStaff) fail(`${label}: more named staff than the limit`);
    // Loans.
    for (const id of b.loanIds) {
      const d = state.finances.debts.find((x) => x.id === id);
      if (!d) fail(`${label}: loan ${id} is not a debt`);
      else if (d.kind !== 'business') fail(`${label}: loan ${id} is a ${d.kind} debt`);
      if (loanOwner.has(id)) fail(`${label}: loan ${id} also belongs to ${loanOwner.get(id)}`);
      loanOwner.set(id, b.id);
    }
    if (b.report) {
      for (const k of ['customers', 'demand', 'revenue', 'rent', 'wages', 'supplies', 'marketing', 'quality', 'other', 'profit', 'loanPayments', 'paidOut', 'draw', 'injected', 'cash'] as const) money(`${label}.report.${k}`, b.report[k]);
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
