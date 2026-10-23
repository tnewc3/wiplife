/**
 * The business step of the year pipeline (W3), after fame and before the
 * ledger: for each business you own, its locations' demand, revenue, costs
 * and profit; its staff (morale, skill, quitting); quality and reputation;
 * the cash the business keeps, what it pays out to its owners (your share is
 * income for the ledger, taxed like pay) and what you must put in to cover a
 * loss; and failure when the money runs out. The ledger (systems/economy.ts)
 * then pays tax, loan payments and your costs from what this step set aside
 * in `business.year`. Every random number comes from the life's own rng.
 */
import type { BusinessDef, ContentBundle } from '../../content/schemas';
import { scoreOf } from '../events/checks';
import { totalDebt, wholeDollars } from '../finance';
import { clampInt, rollNormal } from '../random';
import { chance } from '../rng';
import { applyStatEffects } from '../systems/economy';
import type { Business, BusinessFocus, BusinessReport, BusinessStaff, Id, LifeState, LineResult, LocationResult } from '../types';
import { crewPay, crewPool, ensureModel, levelFromRatio, syncCrew, trainSkill, turnover } from './crew';
import { stepFranchises, topRisk } from './franchise';
import { endBusiness, queueBusinessEvent } from './found';
import { incomeBasis } from './funding';
import { crewRoles, managerRole, needs, roleById, type Slot } from './headcount';
import { managerWage, wageOf } from './model';
import { activeLines, itemOf } from './products';
import { hasLicenseHolder, managerOf, myBusinesses, yourShare } from './query';
import { moraleAim, quits, removeStaff } from './staff';
import { tradeLocation } from './trade';
import { refreshWorth } from './value';
import { economyPhase, supplierIndex, supplierMove } from './world';

/** The skill you bring to running this kind of business (0–100): your own stats and traits, and the years you have owned this kind. */
export function ownerSkill(state: LifeState, def: BusinessDef, content: ContentBundle): number {
  let skill = 50;
  for (const s of def.skills) skill += s.weight * (scoreOf(state, s.key) - 50);
  const exp = content.balance.business.owner.experience;
  skill += Math.min(exp.cap, (state.business.experience[def.id] ?? 0) * exp.perYear);
  return clampInt(skill, 0, 100);
}

/** Whoever runs one location this year, with how much skill and effort they bring. */
interface Runner {
  skill: number;
  effort: number;
  /** A manager (general or of the location) honest enough that nobody worries, or not. */
  honestyAtRisk: boolean;
  kind: 'owner' | 'away' | 'location' | 'general' | 'nobody';
  /** The location manager, when that is who it is. */
  person?: BusinessStaff;
}

/** How hard a manager works: their skill lifts it, and one who is not well liked by you neglects the place. */
function managerRun(state: LifeState, bal: ContentBundle['balance']['business'], m: BusinessStaff, cofSkill: number | null): { skill: number; effort: number; risky: boolean } {
  const e = bal.manager.effort;
  let effort = Math.min(e.max, Math.max(e.min, e.base + (e.slope * (m.skill - 50)) / 100));
  if ((state.relationships[m.personId]?.affection ?? 50) < bal.manager.neglectBelow) effort *= 0.85;
  if (cofSkill !== null) effort = Math.min(e.max, effort + 0.15);
  return { skill: cofSkill !== null ? m.skill * 0.7 + cofSkill * 0.3 : m.skill, effort, risky: (m.honesty ?? 100) < bal.manager.honestyLine };
}

/**
 * Who runs each location: its manager; else you, when you run the business and are in its city (away from it, with less
 * effort); else the general manager; else nobody. Whoever runs several locations spreads thinner, and every other business you
 * run yourself takes a share of your effort.
 */
function runnersFor(state: LifeState, b: Business, def: BusinessDef, content: ContentBundle): Map<Id, Runner> {
  const bal = content.balance.business;
  const cofounder = b.owners.find((o) => o.role === 'cofounder');
  const cofSkill = cofounder ? clampInt(bal.funding.cofounder.skill.mean + ((state.people[cofounder.id]?.smarts ?? 50) - 50) * 0.5, 0, 100) : null;
  const m = managerOf(b);
  const gmAlive = m !== undefined && state.people[m.personId]?.alive === true;
  const e = bal.owner.effort;
  const incarcerated = state.housing.kind === 'incarcerated';
  const selfRun = state.business.items.filter((x) => x.role === 'self').length;
  const attention = Math.max(bal.owner.attention.floor, 1 - bal.owner.attention.perExtraBusiness * Math.max(0, selfRun - 1));
  const out = new Map<Id, Runner>();
  let owned = 0;
  let general = 0;
  for (const loc of b.locations) {
    const lm = loc.manager !== undefined ? b.staff.find((s) => s.personId === loc.manager && state.people[s.personId]?.alive === true) : undefined;
    if (lm) {
      const r = managerRun(state, bal, lm, null);
      out.set(loc.id, { skill: r.skill, effort: r.effort, honestyAtRisk: r.risky, kind: 'location', person: lm });
    } else if (b.role === 'self') {
      const here = !incarcerated && loc.cityId === state.character.cityId;
      let skill = ownerSkill(state, def, content);
      let effort = incarcerated ? 0.1 : here ? (state.career.job !== null ? e.job : e.self) : e.away;
      if (cofSkill !== null) {
        effort = Math.min(1.3, effort + 0.2);
        skill = skill * 0.7 + cofSkill * 0.3;
      }
      out.set(loc.id, { skill, effort: here ? effort * attention : effort, honestyAtRisk: false, kind: here ? 'owner' : 'away' });
      if (here) owned++;
    } else if (gmAlive) {
      const r = managerRun(state, bal, m!, cofSkill);
      out.set(loc.id, { skill: r.skill, effort: r.effort, honestyAtRisk: r.risky, kind: 'general', person: m! });
      general++;
    } else {
      out.set(loc.id, { skill: 40, effort: bal.manager.effort.min * 0.6, honestyAtRisk: false, kind: 'nobody' });
    }
  }
  const span = bal.owner.span;
  const stretch = (n: number) => Math.max(span.floor, 1 - span.perLocation * Math.max(0, n - 1));
  for (const r of out.values()) {
    if (r.kind === 'owner') r.effort *= stretch(owned);
    else if (r.kind === 'general') r.effort *= stretch(general);
  }
  return out;
}

function activeShock(b: Business, year: number): number {
  return b.shocks.filter((s) => s.until >= year && (s.kind === 'buzz' || s.kind === 'rival')).reduce((m, s) => m * s.mult, 1);
}

/** Staff who can no longer work there leave the list: dead, faded out of your life, or moved away from their location's city. */
function reconcile(state: LifeState, b: Business, def: BusinessDef, notes: string[]): void {
  for (const s of [...b.staff]) {
    const person = state.people[s.personId];
    const rel = state.relationships[s.personId];
    const loc = s.locationId === null ? null : b.locations.find((l) => l.id === s.locationId);
    const gone = !person || !person.alive || !rel || rel.status === 'ended';
    const away = !gone && loc && person!.cityId !== loc.cityId;
    if (gone || away) {
      removeStaff(state, b, s.personId);
      if (s.manager) b.role = 'self';
      if (away) notes.push('quit');
      continue;
    }
    // Someone whose location closed works at the first one.
    if (s.locationId !== null && !loc) s.locationId = b.locations[0]!.id;
    if (!s.manager && !roleById(def, s.roleId)) s.roleId = crewRoles(def)[0]!.id;
  }
  for (const l of b.locations) if (l.manager !== undefined && !b.staff.some((s) => s.personId === l.manager)) delete l.manager;
}

/** The supplier categories a business buys from (its lines on at some location, and its service pools). */
function categoriesOf(b: Business, def: BusinessDef): string[] {
  const set = new Set<string>();
  for (const loc of b.locations) for (const { product } of activeLines(b, def, loc.style)) {
    const item = itemOf(def, product);
    if (item) set.add(item.category);
  }
  return [...set].sort();
}

const merge = (into: Map<string, LineResult>, l: LineResult): void => {
  const have = into.get(l.productId);
  if (!have) into.set(l.productId, { ...l });
  else {
    have.demand += l.demand;
    have.sold += l.sold;
    have.lost += l.lost;
    have.spoiled += l.spoiled;
    have.revenue += l.revenue;
    have.cost += l.cost;
  }
};

function stepBusiness(state: LifeState, b: Business, content: ContentBundle, fund: { left: number }): void {
  const bal = content.balance.business;
  const def = content.businesses[b.defId];
  if (!def) return;
  const year = state.currentYear;
  const seed = state.seed;
  const notes: string[] = [];
  reconcile(state, b, def, notes);
  b.shocks = b.shocks.filter((s) => s.until >= year);
  ensureModel(b, def, content);
  const economy = economyPhase(seed, year, content);
  const cats = categoriesOf(b, def);

  // Supplier trouble and luck: a shortage this year, a better deal for a few.
  let newShortage: string | null = null;
  let newDeal: string | null = null;
  for (const cat of cats) {
    if (!b.shocks.some((s) => s.kind === 'shortage' && s.category === cat) && chance(state.rng, bal.suppliers.shortage.chance)) {
      b.shocks.push({ kind: 'shortage', mult: bal.suppliers.shortage.supply, until: year + bal.suppliers.shortage.years - 1, category: cat });
      newShortage = newShortage ?? cat;
    }
    if (!b.shocks.some((s) => s.kind === 'deal' && s.category === cat) && chance(state.rng, bal.suppliers.deal.chance)) {
      b.shocks.push({ kind: 'deal', mult: 1 - bal.suppliers.deal.discount, until: year + bal.suppliers.deal.years - 1, category: cat });
      newDeal = newDeal ?? cat;
    }
  }
  if (b.shocks.length > 12) b.shocks.splice(0, b.shocks.length - 12);
  const deals: Record<string, number> = {};
  const supply: Record<string, number> = {};
  for (const s of b.shocks) {
    if (s.category === undefined) continue;
    if (s.kind === 'deal') deals[s.category] = Math.min(deals[s.category] ?? 1, s.mult);
    if (s.kind === 'shortage') supply[s.category] = Math.min(supply[s.category] ?? 1, s.mult);
  }
  if (newShortage !== null) notes.push('shortage');
  if (Object.keys(deals).length > 0) notes.push('deal');

  const runners = runnersFor(state, b, def, content);
  if (b.role === 'manager' && !managerOf(b)) b.role = 'self';
  const shock = activeShock(b, year);
  const luck = state.character.hidden.luck;
  const season = Math.max(0.4, 1 + rollNormal(state.rng, { mean: 0, sd: bal.demand.season.sd }) + (bal.demand.season.luck * (luck - 50)) / 50);
  const licensed = hasLicenseHolder(state, b, def) || (def.license !== undefined && b.owners.some((o) => o.role === 'cofounder' && state.people[o.id]?.occupation === def.license!.job));
  if (!licensed) notes.push('unlicensed');
  if (b.shocks.some((s) => s.kind === 'rival')) notes.push('rival');
  if (b.shocks.some((s) => s.kind === 'buzz')) notes.push('buzz');

  // The crew comes up to its targets (the heads hired this step cost something).
  const crewHired = syncCrew(b, def, content);
  const mgrRole = managerRole(def);
  const training = bal.training[b.training];

  const results: LocationResult[] = [];
  const lines = new Map<string, LineResult>();
  const perCity = new Map<string, number>();
  let revenue = 0;
  let rent = 0;
  let wages = 0;
  let supplies = 0;
  let goodsCost = 0;
  let waste = 0;
  let lostSales = 0;
  let marketing = 0;
  let qualityCost = 0;
  let other = 0;
  let customers = 0;
  let demand = 0;
  let skillSum = 0;
  let workerSum = 0;
  let short = 0;
  let stockValue = 0;
  let staffedSum = 0;
  let workloadSum = 0;
  let badManagers = 0;
  let heads = 0;
  let skimTaken = 0;
  let lostShare = 0;
  // What wears on the people at each place: too many customers for the heads, and a manager who is not up to it.
  const strain = new Map<Id, number>();
  for (const loc of b.locations) {
    const rank = perCity.get(loc.cityId) ?? 0;
    perCity.set(loc.cityId, rank + 1);
    const runner = runners.get(loc.id)!;
    let payroll = 0;
    const slots: Slot[] = [];
    const need = needs(def, loc.style, content);
    for (const role of crewRoles(def)) {
      const named = b.staff.filter((s) => s.manager !== true && s.locationId === loc.id && s.roleId === role.id);
      const pool = crewPool(b, loc.id, role.id);
      let count = named.length;
      let skills = 0;
      for (const s of named) {
        s.wage = wageOf(def, loc.style, loc.cityId, b.pay, s.skill, s.licensed, s.raise, content, role.wage);
        payroll += s.wage;
        skills += s.skill;
      }
      if (pool) {
        count += pool.count;
        skills += pool.count * pool.skill;
        payroll += pool.count * crewPay(def, loc, role.id, pool.skill, b.pay, content);
      }
      slots.push({ roleId: role.id, weight: role.weight, need: need[role.id] ?? 0, count, skillSum: skills });
    }
    // A location manager is paid on top of the headcount.
    if (loc.manager !== undefined && runner.person) {
      runner.person.wage = wageOf(def, loc.style, loc.cityId, b.pay, runner.person.skill, false, runner.person.raise, content, mgrRole?.wage ?? 1);
      payroll += runner.person.wage;
    }
    const f = tradeLocation(
      {
        def,
        style: loc.style,
        cityId: loc.cityId,
        yearsOpen: year - loc.opened,
        rank,
        reputation: b.reputation,
        quality: b.quality,
        marketing: b.marketing,
        qualityInvest: b.qualityInvest,
        pay: b.pay,
        skill: runner.skill,
        effort: runner.effort,
        season,
        shock,
        licensed,
        lines: activeLines(b, def, loc.style).map(({ product, line }) => ({ product, price: line.price })),
        stock: loc.stock,
        forecast: loc.forecast,
        orders: b.orders,
        slots,
        wages: payroll,
        deals,
        supply,
        seed,
        year,
      },
      content,
    );
    loc.stock = f.nextStock;
    loc.forecast = f.nextForecast;
    stockValue += f.stockValue;
    let locProfit = f.profit;
    // A dishonest location manager may skim from a profitable year.
    if (runner.kind === 'location' && runner.honestyAtRisk && locProfit > 0 && chance(state.rng, bal.manager.skimChance)) {
      const take = wholeDollars(locProfit * bal.manager.skim);
      b.skimmed += take;
      skimTaken += take;
      locProfit -= take;
      if (b.auditedYear === year) notes.push('skimmed');
    }
    if (runner.kind === 'location' && (runner.person!.skill < bal.locationManagers.drag.below || runner.honestyAtRisk)) badManagers++;
    revenue += f.revenue;
    rent += f.rent;
    wages += f.wages;
    supplies += f.supplies;
    goodsCost += f.goodsCost;
    waste += f.waste;
    lostSales += f.lostSales;
    marketing += f.marketing;
    qualityCost += f.quality;
    other += f.other;
    customers += f.customers;
    demand += f.demand;
    skillSum += f.skill * f.workers;
    workerSum += f.workers;
    heads += f.workers;
    short += Math.max(0, 1 - f.staffed);
    staffedSum += f.staffed;
    workloadSum += f.workload;
    const badBoss = runner.kind === 'location' && (runner.person!.skill < bal.locationManagers.drag.below || runner.honestyAtRisk);
    strain.set(loc.id, Math.max(0, f.workload - bal.headcount.workload.limit) * 10 * bal.headcount.workload.morale + (badBoss ? bal.locationManagers.drag.morale : 0));
    for (const l of f.lines) merge(lines, l);
    for (const l of f.lines) lostShare = Math.max(lostShare, l.demand > 0 ? l.lost / l.demand : 0);
    const result: LocationResult = { year, demand: f.demand, customers: f.customers, revenue: f.revenue, rent: f.rent, wages: f.wages, supplies: f.supplies, other: f.other + f.marketing + f.quality, profit: locProfit, goodsCost: f.goodsCost, waste: f.waste, lostSales: f.lostSales, lines: f.lines };
    results.push(result);
    loc.result = result;
  }
  const m = managerOf(b);
  const managerPay = b.role === 'manager' && m ? managerWage(def, b.style, b.cityId, b.pay, m.skill, content) : 0;
  if (m) m.wage = b.role === 'manager' ? managerPay : wageOf(def, b.style, b.cityId, b.pay, m.skill, false, m.raise, content);
  wages += b.role === 'manager' ? managerPay : 0;

  // Franchises: royalties come in, the brand's support goes out.
  const fr = stepFranchises(state, b, def, season, content);
  if (fr.royalties > 0) notes.push('royalties');
  if (fr.exits.length > 0) notes.push('brandRisk');
  if (topRisk(b) > bal.franchise.risk.line) notes.push('brandRisk');

  // Training and turnover cost money.
  const trainingCost = wholeDollars(wages * training.share);
  const lost = turnover(b, def, state.rng, content);
  const hiring = crewHired.cost + lost.cost;
  if (lost.lost > 0) notes.push('turnover');

  const gross = revenue + fr.royalties - fr.support;
  let profit = gross - rent - wages - supplies - marketing - qualityCost - other - hiring - trainingCost;
  const gm = runners.get(b.locations[0]!.id);
  // A dishonest general manager may skim from a profitable year; the owner does not see it unless they look.
  if (b.role === 'manager' && gm?.honestyAtRisk && profit > 0 && chance(state.rng, bal.manager.skimChance)) {
    const take = wholeDollars(profit * bal.manager.skim);
    b.skimmed += take;
    profit -= take;
    other += take;
    if (b.auditedYear === year) notes.push('skimmed');
  }
  profit -= skimTaken;
  other += skimTaken;
  const avgSkill = workerSum > 0 ? skillSum / workerSum : 50;
  const nLoc = b.locations.length;
  const avgStaffed = staffedSum / nLoc;
  const level = levelFromRatio(avgStaffed);
  const runnerList = [...runners.values()];
  const runSkill = runnerList.reduce((s, r) => s + r.skill, 0) / runnerList.length;
  const runEffort = runnerList.reduce((s, r) => s + r.effort, 0) / runnerList.length;

  // Quality and reputation.
  const aimBase = b.locations.reduce((s, l) => s + def.styles[l.style].quality, 0) / nLoc;
  const aim =
    aimBase +
    bal.levels.quality[b.qualityInvest].aim +
    bal.staff.skillQuality * (avgSkill - 50) +
    bal.quality.skill * (runSkill - 50) * Math.min(1.2, runEffort) +
    bal.levels.staffing[level].quality +
    bal.quality.morale * (b.morale - 55) -
    bal.quality.shortfall * (short / nLoc) -
    bal.locationManagers.drag.quality * (badManagers / nLoc) +
    rollNormal(state.rng, { mean: 0, sd: bal.quality.noise });
  const oldQuality = b.quality;
  b.quality = clampInt(bal.quality.carry * b.quality + (1 - bal.quality.carry) * aim - fr.dragQuality, 0, 100);
  // Running out of what people came for costs a name.
  const lostOverall = revenue + lostSales > 0 ? lostSales / (revenue + lostSales) : 0;
  const stockoutHit = lostShare > bal.products.stockout.line ? Math.min(bal.products.stockout.cap, bal.products.stockout.perShare * lostOverall) : 0;
  b.reputation = clampInt(b.reputation + bal.reputation.pull * (oldQuality - b.reputation) + bal.levels.price[b.prices].reputation + rollNormal(state.rng, { mean: 0, sd: bal.reputation.noise }) * 0.5 - stockoutHit - fr.dragReputation, 0, 100);
  if (short / nLoc > 0.15) notes.push('understaffed');
  if (stockoutHit > 0) notes.push('ranOut');
  if (goodsCost > 0 && waste / goodsCost > bal.products.wasteLine) notes.push('spoiled');
  if (workloadSum / nLoc > bal.headcount.workload.limit) notes.push('overworked');
  if (b.locations.some((l) => l.opened === year)) notes.push('newLocation');

  // Staff morale (named and crew), training, and quitting.
  const profitable = profit > 0;
  let quit = 0;
  for (const s of [...b.staff]) {
    const extra = training.morale - (strain.get(s.locationId ?? '') ?? 0);
    const aimM = moraleAim(state, b, s, profitable, content, extra, level);
    s.morale = clampInt(s.morale + bal.staff.morale.pull * (aimM - s.morale) + rollNormal(state.rng, { mean: 0, sd: bal.staff.morale.noise }) * 0.5, 0, 100);
    if (training.skill > 0) s.skill = clampInt(trainSkill(s.skill, training.skill, content), 0, 100);
  }
  const crewBase = moraleAim(state, b, { personId: '', locationId: null, roleId: '', title: '', skill: 50, morale: 50, since: year, licensed: false, raise: 1, wage: 0 } as BusinessStaff, profitable, content, training.morale, level);
  for (const pool of b.crew) {
    pool.morale = clampInt(pool.morale + bal.crew.pull * (crewBase - (strain.get(pool.locationId) ?? 0) - pool.morale) + rollNormal(state.rng, { mean: 0, sd: bal.staff.morale.noise }) * 0.5, 0, 100);
    if (training.skill > 0) pool.skill = trainSkill(pool.skill, training.skill, content);
  }
  for (const s of [...b.staff]) {
    if (!quits(state, s, content)) continue;
    removeStaff(state, b, s.personId);
    quit += 1;
    if (s.manager) {
      b.role = 'self';
      queueBusinessEvent(state, 'manager', b.id, content, 'now');
    }
  }
  if (quit > 0) notes.push('quit');
  const moraleN = b.staff.length + b.crew.reduce((s, p) => s + p.count, 0);
  const moraleSum = b.staff.reduce((s, x) => s + x.morale, 0) + b.crew.reduce((s, p) => s + p.morale * p.count, 0);
  b.morale = moraleN > 0 ? clampInt(moraleSum / moraleN, 0, 100) : clampInt(crewBase, 0, 100);

  // Cash: the reserve is kept, profit beyond it is paid out by share, a loss it cannot cover is put in by the owners.
  // Stock bought and not sold is inventory, not an expense: it leaves cash now and comes back as cost when sold.
  b.assets = wholeDollars(b.assets * (1 - bal.costs.depreciation));
  const costs = rent + wages + supplies + marketing + qualityCost + other + hiring + trainingCost;
  const reserve = wholeDollars(costs * bal.cash.reserve);
  const newStock = wholeDollars(stockValue);
  b.cash = wholeDollars(b.cash + profit - (newStock - b.stockValue));
  b.stockValue = newStock;
  let paidOut = 0;
  let draw = 0;
  let injected = 0;
  let failed = false;
  let unmet = 0;
  const you = b.owners.find((o) => o.id === 'you')!;
  if (b.cash > reserve && profit > 0) {
    paidOut = Math.min(b.cash - reserve, profit);
    b.cash -= paidOut;
    let others = 0;
    for (const o of b.owners) {
      if (o.id === 'you') continue;
      const part = Math.floor((paidOut * o.share) / 100);
      o.paid += part;
      others += part;
      if (part > 0 && state.relationships[o.id]) {
        const rel = state.relationships[o.id]!;
        rel.affection = clampInt(rel.affection + 1, 0, 100);
      }
    }
    draw = paidOut - others;
    you.paid += draw;
  } else if (b.cash < 0) {
    const need = -b.cash;
    const cof = b.owners.find((o) => o.role === 'cofounder');
    const cofPays = cof ? Math.floor((need * cof.share) / 100) : 0;
    const yourNeed = need - cofPays;
    if (yourNeed <= fund.left) {
      injected = yourNeed;
      fund.left -= yourNeed;
      if (cof) cof.put += cofPays;
      you.put += yourNeed;
      b.cash = 0;
    } else {
      failed = true;
      unmet = yourNeed;
      b.cash = 0;
    }
  }
  b.profits.push(profit);
  if (b.profits.length > 5) b.profits.splice(0, b.profits.length - 5);
  b.lossYears = profit < 0 ? b.lossYears + 1 : 0;
  state.business.experience[b.defId] = (state.business.experience[b.defId] ?? 0) + 1;

  // The year in words: what the world did.
  const moves = cats.map((c) => [c, supplierIndex(seed, c, year, content)] as [string, number]);
  if (cats.some((c) => supplierMove(seed, c, year, content) > bal.suppliers.riseThreshold)) notes.push('supplierUp');
  else if (cats.some((c) => supplierMove(seed, c, year, content) < -bal.suppliers.riseThreshold)) notes.push('supplierDown');
  if (economy === 'boom') notes.push('economyBoom');
  else if (economy === 'slowdown') notes.push('economySlowdown');
  else if (economy === 'recession') notes.push('economyRecession');

  const loanPayments = b.loanIds.reduce((sum, id) => {
    const d = state.finances.debts.find((x) => x.id === id);
    return sum + (d ? Math.min(d.minPayment, d.balance) : 0);
  }, 0);
  const report: BusinessReport = {
    year,
    customers,
    customersBefore: b.report?.customers ?? 0,
    demand,
    revenue,
    rent,
    wages,
    supplies,
    marketing,
    quality: qualityCost,
    other,
    profit,
    loanPayments,
    paidOut,
    draw,
    injected,
    cash: b.cash,
    morale: b.morale,
    reputation: b.reputation,
    qualityScore: b.quality,
    quit,
    notes,
    locations: results,
    goodsCost,
    waste,
    lostSales,
    hiring,
    training: trainingCost,
    royalties: fr.royalties,
    support: fr.support,
    turnover: lost.lost,
    heads,
    economy,
    lines: [...lines.values()],
    supplierMoves: moves.sort((x, y) => Math.abs(y[1] - 1) - Math.abs(x[1] - 1)).slice(0, 4),
  };
  b.report = report;
  state.business.year.draw += draw;
  state.business.year.inject += injected;

  // How it feels to run it.
  const stress = bal.owner.stress;
  if (b.role === 'self') {
    const pull = stress.run * runEffort + (profit < 0 ? stress.loss : 0);
    applyStatEffects(state, { stress: { perYear: Math.min(pull, 6), limit: stress.limit } });
  }
  const h = bal.happiness;
  applyStatEffects(state, profit > 0 ? { happiness: { perYear: h.profit, limit: h.limit } } : { happiness: { perYear: h.loss, limit: 20 } });

  // Trouble and chances, as events.
  if (failed) {
    endBusiness(state, b.id, 'failed', content, unmet);
    queueBusinessEvent(state, 'failure', b.id, content, 'now');
    if (state.business.past.at(-1)?.end === 'failed' && state.business.past.at(-1)!.net < 0) queueBusinessEvent(state, 'investorLoss', b.id, content, 'now');
    return;
  }
  const cool = bal.events.coolOff;
  const last = (k: string) => state.business.offered[k];
  const ok = (k: string) => last(k) === undefined || year - last(k)! >= cool;
  const queue = (trigger: Parameters<typeof queueBusinessEvent>[1], focus?: BusinessFocus): void => {
    b.focus = focus;
    queueBusinessEvent(state, trigger, b.id, content, 'now');
  };
  const costsYear = Math.max(1, costs);
  if ((b.lossYears >= bal.failure.nearYears || b.cash < costsYear * bal.failure.nearCash) && profit < 0 && ok('nearFailure')) queue('nearFailure');
  else if (profit > 0 && year - b.founded >= bal.events.expansionYears && profit > def.styles[b.style].startup * bal.events.expansionProfit && b.locations.length < bal.limits.locations && chance(state.rng, bal.events.expansion) && ok('expansion')) queue('expansion');
  if (b.owners.some((o) => o.role === 'cofounder') && chance(state.rng, bal.events.cofounder) && ok('cofounder')) queue('cofounder');
  if (b.role === 'manager' && m && (m.skill < 45 || (m.honesty ?? 100) < bal.manager.honestyLine) && chance(state.rng, bal.events.manager) && ok('manager')) queue('manager');
  if (!licensed && chance(state.rng, bal.events.license) && ok('license')) queue('license');
  // B2: the market and the people.
  const worstLine = [...lines.values()].sort((x, y) => y.lost - x.lost)[0];
  if (stockoutHit > 0 && ok('stockout')) queue('stockout', worstLine ? { productId: worstLine.productId } : undefined);
  if (goodsCost > 0 && waste / goodsCost > bal.products.wasteLine && ok('waste')) queue('waste', { productId: [...lines.values()].sort((x, y) => y.spoiled - x.spoiled)[0]?.productId });
  const risen = cats.find((c) => supplierMove(seed, c, year, content) > bal.suppliers.riseThreshold);
  if (risen !== undefined && ok('supplierRise')) queue('supplierRise', { category: risen });
  if (newShortage !== null && ok('shortage')) queue('shortage', { category: newShortage });
  if (newDeal !== null && ok('deal')) queue('deal', { category: newDeal });
  if (economy !== economyPhase(seed, year - 1, content) && economy !== 'steady' && ok('economy')) queue('economy');
  if (chance(state.rng, bal.events.market) && ok('market')) queue('market');
  if (chance(state.rng, bal.events.places) && ok('places')) queue('places', { locationId: b.locations.length > 1 ? b.locations[b.locations.length - 1]!.id : undefined });
  if (chance(state.rng, bal.events.people) && ok('people')) queue('people');
  if (b.staff.some((s) => !s.manager) && chance(state.rng, bal.events.staffRequest) && ok('staffRequest')) queue('staffRequest', { locationId: b.staff.find((s) => !s.manager)?.locationId ?? undefined });
  if ((b.franchises.length > 0 || fr.exits.length > 0 || franchiseAsk(state, b, content)) && chance(state.rng, bal.franchise.inquiry) && ok('franchise')) queue('franchise');
}

/** Whether the business has earned a franchise inquiry (the franchise events ask for it themselves; this only decides whether to look). */
function franchiseAsk(state: LifeState, b: Business, content: ContentBundle): boolean {
  const f = content.balance.business.franchise;
  return state.currentYear - b.founded >= f.minYears && b.locations.length >= f.minLocations && b.quality >= f.minQuality && b.reputation >= f.minReputation;
}

/** Step 'business'. */
export function runBusiness(state: LifeState, content: ContentBundle): void {
  const bs = state.business;
  bs.year = { year: state.currentYear, draw: 0, inject: 0 };
  // The listings you bought last round are forgotten once the round is over.
  if (bs.taken.length > 0) {
    const round = Math.floor(state.currentYear / content.balance.business.market.refreshYears);
    bs.taken = bs.taken.filter((id) => Number(id.split('_').at(-2)) === round);
  }
  if (bs.items.length === 0) {
    bs.worth = 0;
    return;
  }
  const f = content.balance.business.failure;
  const credit = Math.max(0, f.creditIncomeMultiple * incomeBasis(state) + f.creditFloor - totalDebt(state));
  const fund = { left: state.finances.savings + credit };
  for (const b of myBusinesses(state)) stepBusiness(state, b, content, fund);
  // Doing well in business builds a name in the city; failing costs one (see endBusiness).
  const re = content.balance.business.reputationEffect;
  const doing = bs.items.filter((b) => b.report && b.report.profit > 0 && yourShare(b) > 0).length;
  if (doing > 0) state.character.hidden.reputation = clampInt(state.character.hidden.reputation + Math.min(re.cap, re.perYear * doing), 0, 100);
  refreshWorth(state, content);
}
