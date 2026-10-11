/**
 * The event sandbox (development only) gives its throwaway life what a
 * business event asks for, so the event can be previewed and played: a
 * business of the kind and style it needs, with the staff, investors,
 * co-founder, manager, loans, licence and trouble the event requires, and
 * the people cast from it in their places. Never used by a real life.
 */
import { BUSINESS_ROLE, type BusinessCondition, type Condition, type ContentBundle, type EventDef } from '../../content/schemas';
import { addDebt } from '../finance';
import type { Business, BusinessStaff, Id, LifeState } from '../types';
import { newBusiness } from './found';
import { startupCost, workingCapital } from './model';

function required(c: Condition | undefined): Condition[] {
  if (!c) return [];
  if ('all' in c) return c.all.flatMap(required);
  return [c];
}

const lowest = (c: { gt?: number | undefined; gte?: number | undefined; eq?: number | undefined; lte?: number | undefined; lt?: number | undefined } | undefined, fallback: number) =>
  c === undefined ? fallback : (c.eq ?? c.gte ?? (c.gt !== undefined ? c.gt + 1 : c.lte !== undefined ? c.lte : c.lt !== undefined ? c.lt - 1 : fallback));

function staffEntry(b: Business, personId: Id, state: LifeState, over: Partial<BusinessStaff> = {}): BusinessStaff {
  const p = state.people[personId]!;
  if (!p.tags.includes('staff')) p.tags.push('staff');
  return { personId, locationId: b.locations[0]!.id, title: 'worker', skill: 60, morale: 60, since: state.currentYear - 1, licensed: false, raise: 1, wage: 30000, ...over };
}

export function giveSampleBusiness(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const parts = required(def.requires);
  const bc: BusinessCondition = Object.assign({}, ...parts.flatMap((c) => ('business' in c ? [c.business] : [])));
  const bs = state.business;
  if (bc.failedWithin !== undefined) {
    bs.past.push({ name: 'The Last Place', defId: 'cafe', style: 'standard', cityId: state.character.cityId, fromYear: state.currentYear - 4, toYear: state.currentYear - Math.min(bc.failedWithin, 1), end: 'failed', totalProfit: -30000, net: -50000 });
    for (const [, id] of Object.entries(cast)) {
      const rel = state.relationships[id];
      if (rel && parts.some((c) => 'memory' in c)) rel.memories.push({ tag: 'lost_money_in_your_business', year: state.currentYear - 1 });
    }
    return;
  }
  if (bc.owned !== true) return;
  const defId = bc.type?.[0] ?? (bc.kind?.[0] !== undefined ? Object.values(content.businesses).find((d) => d.kind === bc.kind![0])?.id : undefined) ?? (bc.licensed !== undefined || bc.needsLicense === true ? 'plumbing' : 'cafe');
  const bdef = content.businesses[defId] ?? content.businesses.cafe!;
  const style = bc.style?.[0] ?? 'standard';
  const b = newBusiness(state, bdef, bdef.names[0]!, state.character.cityId, style, 'started', content);
  const years = lowest(bc.years, 3);
  b.founded = state.currentYear - Math.max(0, years);
  b.locations[0]!.opened = b.founded;
  const extra = Math.max(0, lowest(bc.locations, 1) - 1);
  for (let i = 0; i < extra; i++) b.locations.push({ id: `l${bs.nextLocation++}`, cityId: b.cityId, style, opened: b.founded });
  b.cash = workingCapital(bdef, style, b.cityId, content);
  b.assets = startupCost(bdef, style, b.cityId, content);
  b.owners = [{ id: 'you', name: `${state.character.name.first} ${state.character.name.last}`, share: 100, put: b.assets, year: b.founded, paid: 0, role: 'you' }];
  b.role = bc.role?.[0] ?? 'self';
  if (bc.chain) b.chainId = Object.keys(content.chains).sort()[0]!;
  bs.items.push(b);

  // The people cast from the business, in their places.
  const used = new Set<Id>();
  for (const [role, spec] of Object.entries(def.cast ?? {})) {
    const id = cast[role];
    if (id === undefined || spec.business === undefined) continue;
    used.add(id);
    if (spec.business === 'investor' || spec.business === 'cofounder') {
      const take = spec.business === 'investor' ? 20 : 33;
      const you = b.owners[0]!;
      you.share -= take;
      b.owners.push({ id, name: `${state.people[id]!.name.first} ${state.people[id]!.name.last}`, share: take, put: 20000, year: b.founded, paid: 0, role: spec.business });
    } else if (spec.business === 'manager') {
      b.staff.push(staffEntry(b, id, state, { manager: true, locationId: null, title: bdef.managerTitle, honesty: 70, skill: 60 }));
      b.role = 'manager';
    } else if (spec.business === 'licensed') {
      b.staff.push(staffEntry(b, id, state, { licensed: true, title: bdef.license?.title ?? 'worker' }));
    } else {
      b.staff.push(staffEntry(b, id, state, { title: bdef.staffTitle }));
    }
  }
  // Anyone the event asks for beyond the cast: more staff, an investor, a co-founder, a manager.
  const person = (): Id => {
    const id = Object.keys(state.people).sort().find((x) => !used.has(x) && state.people[x]!.alive && state.relationships[x] !== undefined && state.currentYear - state.people[x]!.birthYear >= 20 && state.people[x]!.cityId === state.character.cityId);
    if (id === undefined) return '';
    used.add(id);
    return id;
  };
  const wantStaff = lowest(bc.staff, 0);
  while (b.staff.filter((s) => !s.manager).length < wantStaff) {
    const id = person();
    if (id === '') break;
    b.staff.push(staffEntry(b, id, state, { title: bdef.staffTitle }));
  }
  if (bc.investors && !b.owners.some((o) => o.role === 'investor')) {
    const id = person();
    if (id !== '') {
      b.owners[0]!.share -= 20;
      b.owners.push({ id, name: 'An investor', share: 20, put: 20000, year: b.founded, paid: 0, role: 'investor' });
    }
  }
  if (bc.cofounder && !b.owners.some((o) => o.role === 'cofounder')) {
    const id = person();
    if (id !== '') {
      b.owners[0]!.share -= 33;
      b.owners.push({ id, name: 'A partner', share: 33, put: 30000, year: b.founded, paid: 0, role: 'cofounder' });
    }
  }
  if ((bc.manager || b.role === 'manager') && !b.staff.some((s) => s.manager)) {
    const id = person();
    if (id !== '') {
      b.staff.push(staffEntry(b, id, state, { manager: true, locationId: null, title: bdef.managerTitle, honesty: 70 }));
      b.role = 'manager';
    }
  }
  if (b.role === 'manager' && !b.staff.some((s) => s.manager)) b.role = 'self';
  if (bdef.license && bc.licensed === true && !b.staff.some((s) => s.licensed)) {
    const id = person();
    if (id !== '') b.staff.push(staffEntry(b, id, state, { licensed: true, title: bdef.license.title }));
  }
  if (bdef.license && bc.licensed === false) b.staff = b.staff.filter((s) => !s.licensed);
  if (bc.loan) b.loanIds.push(addDebt(state, 'business', 40000, content).id);
  if (bc.rival) b.shocks.push({ kind: 'rival', mult: 0.85, until: state.currentYear + 1 });
  if (bc.skimmed) b.skimmed = 6000;
  b.morale = Math.max(0, Math.min(100, lowest(bc.morale, 60)));
  b.reputation = Math.max(0, Math.min(100, lowest(bc.reputation, 55)));
  b.quality = Math.max(0, Math.min(100, lowest(bc.quality, 55)));
  b.lossYears = Math.max(0, lowest(bc.lossYears, 0));
  const profit = bc.profit?.lt !== undefined || (bc.profit?.lte ?? 1) < 0 ? -20000 : lowest(bc.profit, 20000) + (bc.profit?.gt !== undefined ? 20000 : 0);
  if (bc.cash) b.cash = Math.max(0, lowest(bc.cash, b.cash));
  b.profits = [profit];
  b.report = {
    year: state.currentYear,
    customers: 20000,
    customersBefore: 20000,
    demand: 20000,
    revenue: 300000,
    rent: 30000,
    wages: 120000,
    supplies: 90000,
    marketing: 0,
    quality: 0,
    other: 20000,
    profit,
    loanPayments: 0,
    paidOut: 0,
    draw: 0,
    injected: 0,
    cash: b.cash,
    morale: b.morale,
    reputation: b.reputation,
    qualityScore: b.quality,
    quit: 0,
    notes: [],
    locations: [],
  };
  if (def.bindBusiness) cast[BUSINESS_ROLE] = b.id;
}
