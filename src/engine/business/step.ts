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
import type { Business, BusinessReport, BusinessStaff, LifeState, LocationResult } from '../types';
import { endBusiness, queueBusinessEvent } from './found';
import { incomeBasis } from './funding';
import { locationFigures, managerWage, wageOf } from './model';
import { hasLicenseHolder, managerOf, myBusinesses, yourShare } from './query';
import { moraleAim, quits, removeStaff } from './staff';
import { refreshWorth } from './value';

/** The skill you bring to running this kind of business (0–100): your own stats and traits, and the years you have owned this kind. */
export function ownerSkill(state: LifeState, def: BusinessDef, content: ContentBundle): number {
  let skill = 50;
  for (const s of def.skills) skill += s.weight * (scoreOf(state, s.key) - 50);
  const exp = content.balance.business.owner.experience;
  skill += Math.min(exp.cap, (state.business.experience[def.id] ?? 0) * exp.perYear);
  return clampInt(skill, 0, 100);
}

interface Who {
  skill: number;
  effort: number;
  honestyAtRisk: boolean;
  noManager: boolean;
}

/** Who is running the business this year, with how much skill and effort. */
function whoRuns(state: LifeState, b: Business, def: BusinessDef, content: ContentBundle): Who {
  const bal = content.balance.business;
  const cofounder = b.owners.find((o) => o.role === 'cofounder');
  const cofSkill = cofounder ? clampInt(bal.funding.cofounder.skill.mean + ((state.people[cofounder.id]?.smarts ?? 50) - 50) * 0.5, 0, 100) : null;
  const m = managerOf(b);
  if (b.role === 'manager') {
    if (!m || state.people[m.personId]?.alive !== true) return { skill: 40, effort: bal.manager.effort.min * 0.6, honestyAtRisk: false, noManager: true };
    const e = bal.manager.effort;
    let effort = Math.min(e.max, Math.max(e.min, e.base + (e.slope * (m.skill - 50)) / 100));
    if ((state.relationships[m.personId]?.affection ?? 50) < bal.manager.neglectBelow) effort *= 0.85;
    if (cofSkill !== null) effort = Math.min(e.max, effort + 0.15);
    return { skill: cofSkill !== null ? m.skill * 0.7 + cofSkill * 0.3 : m.skill, effort, honestyAtRisk: (m.honesty ?? 100) < bal.manager.honestyLine, noManager: false };
  }
  const e = bal.owner.effort;
  let effort = state.housing.kind === 'incarcerated' ? 0.1 : b.cityId !== state.character.cityId ? e.away : state.career.job !== null ? e.job : e.self;
  let skill = ownerSkill(state, def, content);
  if (cofSkill !== null) {
    effort = Math.min(1.3, effort + 0.2);
    skill = skill * 0.7 + cofSkill * 0.3;
  }
  return { skill, effort, honestyAtRisk: false, noManager: false };
}

function activeShock(b: Business, year: number): number {
  return b.shocks.filter((s) => s.until >= year).reduce((m, s) => m * s.mult, 1);
}

/** Staff who can no longer work there leave the list: dead, faded out of your life, or moved away from their location's city. */
function reconcile(state: LifeState, b: Business, notes: string[]): void {
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
  }
}

function stepBusiness(state: LifeState, b: Business, content: ContentBundle, fund: { left: number }): void {
  const bal = content.balance.business;
  const def = content.businesses[b.defId];
  if (!def) return;
  const year = state.currentYear;
  const notes: string[] = [];
  reconcile(state, b, notes);
  b.shocks = b.shocks.filter((s) => s.until >= year);
  const who = whoRuns(state, b, def, content);
  if (who.noManager) b.role = 'self';
  const shock = activeShock(b, year);
  const luck = state.character.hidden.luck;
  const season = Math.max(0.4, 1 + rollNormal(state.rng, { mean: 0, sd: bal.demand.season.sd }) + (bal.demand.season.luck * (luck - 50)) / 50);
  const licensed = hasLicenseHolder(state, b, def) || (def.license !== undefined && b.owners.some((o) => o.role === 'cofounder' && state.people[o.id]?.occupation === def.license!.job));
  if (!licensed) notes.push('unlicensed');
  if (b.shocks.some((s) => s.kind === 'rival')) notes.push('rival');
  if (b.shocks.some((s) => s.kind === 'buzz')) notes.push('buzz');

  const results: LocationResult[] = [];
  const perCity = new Map<string, number>();
  let revenue = 0;
  let rent = 0;
  let wages = 0;
  let supplies = 0;
  let marketing = 0;
  let qualityCost = 0;
  let other = 0;
  let customers = 0;
  let demand = 0;
  let skillSum = 0;
  let workerSum = 0;
  let short = 0;
  for (const loc of b.locations) {
    const rank = perCity.get(loc.cityId) ?? 0;
    perCity.set(loc.cityId, rank + 1);
    const named = b.staff
      .filter((s) => !s.manager && s.locationId === loc.id)
      .map((s) => {
        s.wage = wageOf(def, loc.style, loc.cityId, b.pay, s.skill, s.licensed, s.raise, content);
        return { wage: s.wage, skill: s.skill };
      });
    const f = locationFigures(
      {
        def,
        style: loc.style,
        cityId: loc.cityId,
        yearsOpen: year - loc.opened,
        rank,
        reputation: b.reputation,
        quality: b.quality,
        prices: b.prices,
        marketing: b.marketing,
        qualityInvest: b.qualityInvest,
        pay: b.pay,
        staffing: b.staffing,
        skill: who.skill,
        effort: who.effort,
        named,
        season,
        shock,
        licensed,
      },
      content,
    );
    revenue += f.revenue;
    rent += f.rent;
    wages += f.wages;
    supplies += f.supplies;
    marketing += f.marketing;
    qualityCost += f.quality;
    other += f.other;
    customers += f.customers;
    demand += f.demand;
    skillSum += f.skill * f.workers;
    workerSum += f.workers;
    short += Math.max(0, 1 - f.staffed);
    const result: LocationResult = { year, demand: f.demand, customers: f.customers, revenue: f.revenue, rent: f.rent, wages: f.wages, supplies: f.supplies, other: f.other + f.marketing + f.quality, profit: f.profit };
    results.push(result);
    loc.result = result;
  }
  const m = managerOf(b);
  const managerPay = b.role === 'manager' && m ? managerWage(def, b.style, b.cityId, b.pay, m.skill, content) : 0;
  if (m) m.wage = b.role === 'manager' ? managerPay : wageOf(def, b.style, b.cityId, b.pay, m.skill, false, m.raise, content);
  wages += b.role === 'manager' ? managerPay : 0;
  let profit = revenue - rent - wages - supplies - marketing - qualityCost - other;
  // A dishonest manager may skim from a profitable year; the owner does not see it unless they look.
  if (who.honestyAtRisk && profit > 0 && chance(state.rng, bal.manager.skimChance)) {
    const take = wholeDollars(profit * bal.manager.skim);
    b.skimmed += take;
    profit -= take;
    other += take;
    if (b.auditedYear === year) notes.push('skimmed');
  }
  const avgSkill = workerSum > 0 ? skillSum / workerSum : 50;

  // Quality and reputation.
  const aimBase = b.locations.reduce((s, l) => s + def.styles[l.style].quality, 0) / b.locations.length;
  const aim =
    aimBase +
    bal.levels.quality[b.qualityInvest].aim +
    bal.staff.skillQuality * (avgSkill - 50) +
    bal.quality.skill * (who.skill - 50) * Math.min(1.2, who.effort) +
    bal.levels.staffing[b.staffing].quality -
    bal.quality.shortfall * (short / b.locations.length) +
    rollNormal(state.rng, { mean: 0, sd: bal.quality.noise });
  const oldQuality = b.quality;
  b.quality = clampInt(bal.quality.carry * b.quality + (1 - bal.quality.carry) * aim, 0, 100);
  b.reputation = clampInt(b.reputation + bal.reputation.pull * (oldQuality - b.reputation) + rollNormal(state.rng, { mean: 0, sd: bal.reputation.noise }) * 0.5, 0, 100);
  if (short / b.locations.length > 0.15) notes.push('understaffed');
  if (b.locations.some((l) => l.opened === year)) notes.push('newLocation');

  // Staff morale and quitting.
  const profitable = profit > 0;
  let quit = 0;
  for (const s of [...b.staff]) {
    const aimM = moraleAim(state, b, s, profitable, content);
    s.morale = clampInt(s.morale + bal.staff.morale.pull * (aimM - s.morale) + rollNormal(state.rng, { mean: 0, sd: bal.staff.morale.noise }) * 0.5, 0, 100);
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
  const named = b.staff.filter((s) => !s.manager);
  const crewAim = moraleAim(state, b, { personId: '', locationId: null, title: '', skill: 50, morale: 50, since: year, licensed: false, raise: 1, wage: 0 } as BusinessStaff, profitable, content);
  b.morale = named.length > 0 ? clampInt(named.reduce((s, x) => s + x.morale, 0) / named.length, 0, 100) : clampInt(crewAim, 0, 100);

  // Cash: the reserve is kept, profit beyond it is paid out by share, a loss it cannot cover is put in by the owners.
  b.assets = wholeDollars(b.assets * (1 - bal.costs.depreciation));
  const costs = rent + wages + supplies + marketing + qualityCost + other;
  const reserve = wholeDollars(costs * bal.cash.reserve);
  b.cash = wholeDollars(b.cash + profit);
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
  };
  b.report = report;
  state.business.year.draw += draw;
  state.business.year.inject += injected;

  // How it feels to run it.
  const stress = bal.owner.stress;
  if (b.role === 'self') {
    const pull = stress.run * who.effort + (profit < 0 ? stress.loss : 0);
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
  const costsYear = Math.max(1, costs);
  if ((b.lossYears >= bal.failure.nearYears || b.cash < costsYear * bal.failure.nearCash) && profit < 0 && ok('nearFailure')) queueBusinessEvent(state, 'nearFailure', b.id, content, 'now');
  else if (profit > 0 && year - b.founded >= bal.events.expansionYears && profit > def.styles[b.style].startup * bal.events.expansionProfit && b.locations.length < bal.limits.locations && chance(state.rng, bal.events.expansion) && ok('expansion')) queueBusinessEvent(state, 'expansion', b.id, content, 'now');
  if (b.owners.some((o) => o.role === 'cofounder') && chance(state.rng, bal.events.cofounder) && ok('cofounder')) queueBusinessEvent(state, 'cofounder', b.id, content, 'now');
  if (b.role === 'manager' && m && (m.skill < 45 || (m.honesty ?? 100) < bal.manager.honestyLine) && chance(state.rng, bal.events.manager) && ok('manager')) queueBusinessEvent(state, 'manager', b.id, content, 'now');
  if (!licensed && chance(state.rng, bal.events.license) && ok('license')) queueBusinessEvent(state, 'license', b.id, content, 'now');
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
