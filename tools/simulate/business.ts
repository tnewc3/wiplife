/**
 * Businesses, simulated (W3): the player model's starting, buying, running and
 * ending of businesses, and what the run measures about them: how many lives
 * start or buy one (by funding and kind), how long businesses last (1, 5 and 10
 * years, by kind, style, how well the owner decides and how well the owner's
 * skills fit), what they earn and what they cost, how they fail and what
 * is left owing, what happens to staff, investors and co-founders, and whether
 * owning a business out-earns a career without matching risk. Like the other
 * player models, these chances describe the simulated player, not the game, so
 * they live here and not in the balance files.
 */
import { BUSINESS_FUNDING, BUSINESS_STYLES, MARKETING_LEVELS, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, type BusinessFunding, type BusinessStyle, type ContentBundle } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { marketFor } from '../../src/engine/business/market';
import { startBlock, buyBlock } from '../../src/engine/business/found';
import { cofounderCandidates, investorCandidates, loanOffer, type FundingPlan } from '../../src/engine/business/funding';
import { totalToStart } from '../../src/engine/business/model';
import { ownerSkill } from '../../src/engine/business/step';
import { youHoldLicense } from '../../src/engine/business/query';
import { hireBlock } from '../../src/engine/business/staff';
import { peakRung } from '../../src/engine/fame/query';
import { totalDebt } from '../../src/engine/finance';
import { weightedPick } from '../../src/engine/random';
import { chance, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { Business, Id, LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type Policy = 'good' | 'random' | 'poor';

/** What a simulated player does about businesses, fixed for the life. */
export interface BusinessProfile {
  /** The yearly chance of looking to start or buy one, from 22 to 55 (0 for most lives). */
  startChance: number;
  /** The chance they buy one that is for sale rather than start one. */
  buyShare: number;
  /** How they decide each year. */
  policy: Policy;
  /** Funding preferences. */
  funding: readonly (readonly [BusinessFunding, number])[];
  /** The chance they run it themselves rather than hire a manager (a manager when they hold a job). */
  selfRun: number;
}

export function rollBusinessProfile(rng: RngState): BusinessProfile {
  return {
    startChance: weightedPick(rng, [[0, 72], [0.02, 16], [0.06, 9], [0.15, 3]] as const),
    buyShare: weightedPick(rng, [[0, 4], [0.3, 4], [0.7, 2]] as const),
    policy: weightedPick(rng, [['good', 4], ['random', 3], ['poor', 3]] as const),
    funding: [
      ['savings', weightedPick(rng, [[0.5, 2], [3, 2]] as const)],
      ['loan', weightedPick(rng, [[1, 2], [3, 3]] as const)],
      ['investors', weightedPick(rng, [[0.2, 2], [1, 2]] as const)],
      ['cofounder', weightedPick(rng, [[0.2, 2], [1.2, 2]] as const)],
    ],
    selfRun: weightedPick(rng, [[0.4, 2], [0.8, 4]] as const),
  };
}

const RESERVE = 6000;

/** A plan that funds `need` the way the player prefers, or null when none of them can. */
function planFor(life: LifeState, need: number, defId: Id, content: ContentBundle, rng: RngState, profile: BusinessProfile, check: (plan: FundingPlan) => boolean): FundingPlan | null {
  const tries = [...profile.funding].sort((a, b) => b[1] - a[1] + (nextInt(rng, 0, 100) - 50) / 100);
  const savings = life.finances.savings - RESERVE;
  for (const [source] of tries) {
    let plan: FundingPlan | null;
    if (source === 'savings') plan = savings >= need ? { source } : null;
    else if (source === 'loan') {
      const offer = loanOffer(life, need, content.businesses[defId], content);
      plan = offer.block === null && offer.limit > 0 ? { source, loan: offer.limit } : null;
    } else if (source === 'investors') {
      const cands = investorCandidates(life, content).filter((c) => c.willing);
      const asked = cands.slice(0, 2).map((c) => ({ personId: c.personId, amount: Math.min(c.capacity, Math.ceil((need * 0.25) / 100) * 100) }));
      plan = asked.length > 0 ? { source, investors: asked } : null;
    } else {
      const c = cofounderCandidates(life, content).find((x) => x.willing);
      plan = c ? { source, cofounder: { personId: c.personId, share: content.balance.business.funding.cofounder.shares[1] ?? 33 } } : null;
    }
    if (plan && check(plan)) return plan;
  }
  return null;
}

const NAME_SUFFIX = ['', ' II', ' Too', ' & Daughters', ' Again'];

/** What the simulated player does about businesses this year. */
export function chooseBusinessActions(life: LifeState, content: ContentBundle, rng: RngState, profile: BusinessProfile): [LifeActionId, LifeActionParams][] {
  const out: [LifeActionId, LifeActionParams][] = [];
  const bal = content.balance.business;
  const age = life.character.age;
  if (age < bal.limits.minAge) return out;
  const owned = life.business.items;
  // Starting or buying.
  if (owned.length === 0 && age >= 22 && age <= 55 && chance(rng, profile.startChance)) {
    const city = chance(rng, 0.9) ? life.character.cityId : pick(rng, Object.keys(content.cities).sort());
    const role = life.career.job !== null || city !== life.character.cityId ? (chance(rng, 0.7) ? 'manager' : 'self') : chance(rng, profile.selfRun) ? 'self' : 'manager';
    if (chance(rng, profile.buyShare)) {
      const listings = marketFor(life, city, content).filter((l) => l.price <= Math.max(life.finances.savings * 4, 120000));
      const l = listings.length > 0 ? pick(rng, listings) : null;
      if (l) {
        const def = content.businesses[l.defId];
        const plan = planFor(life, l.price, l.defId, content, rng, profile, (p) => buyBlock(life, { listingId: l.id, plan: p, role: l.kind === 'chain' ? 'manager' : role }, content) === null);
        if (plan && def) out.push(['buy_business', { biz: { listingId: l.id, plan, role: l.kind === 'chain' ? 'manager' : role } }]);
      }
    } else {
      const defs = Object.keys(content.businesses).sort().map((id) => content.businesses[id]!).filter((d) => !d.retired);
      const def = pick(rng, defs);
      const style = weightedPick(rng, [['budget', 4], ['standard', 5], ['premium', life.finances.savings > 150000 ? 2 : 0.3]] as const) as BusinessStyle;
      const needsHire = def.license !== undefined && !youHoldLicense(life, def.license);
      const base = totalToStart(def, style, city, needsHire, content);
      const mgr = role === 'manager' ? Math.round(base.total * 0.04) : 0;
      const unused = def.names.filter((n) => !life.business.items.some((b) => b.name === n));
      const name = (unused.length > 0 ? pick(rng, unused) : def.names[0]!) + NAME_SUFFIX[nextInt(rng, 0, 0)];
      const plan = planFor(life, base.total + mgr, def.id, content, rng, profile, (p) => startBlock(life, { defId: def.id, name, cityId: city, style, plan: p, role }, content) === null);
      if (plan) out.push(['start_business', { biz: { defId: def.id, name, cityId: city, style, plan, role } }]);
    }
    return out;
  }
  // Running what they own.
  for (const b of owned) {
    const def = content.businesses[b.defId]!;
    const decisions = decide(b, profile.policy, rng);
    if (decisions && Object.keys(decisions).length > 0) out.push(['set_business_decisions', { biz: { businessId: b.id, decisions } }]);
    // Somebody has to hold the licence the work needs.
    if (def.license && !b.staff.some((s) => s.licensed) && !(b.role === 'self' && youHoldLicense(life, def.license)) && !b.owners.some((o) => o.role === 'cofounder' && life.people[o.id]?.occupation === def.license!.job)) {
      if (hireBlock(life, b, def, { licensed: true, locationId: b.locations[0]!.id }, content) === null) out.push(['hire_staff', { biz: { businessId: b.id, licensed: true } }]);
    }
    // A manager when you have a job and none yet.
    if (b.role === 'self' && life.career.job !== null && chance(rng, 0.5)) out.push(['set_business_role', { biz: { businessId: b.id, role: 'manager' } }]);
    if (profile.policy === 'good') {
      if (b.report && b.report.profit > 0 && b.staff.filter((s) => !s.manager).length < 2 && hireBlock(life, b, def, { locationId: b.locations[0]!.id }, content) === null && chance(rng, 0.3)) out.push(['hire_staff', { biz: { businessId: b.id } }]);
      const r = b.report;
      if (r && r.profit > def.styles[b.style].startup * 0.5 && b.locations.length < 3 && r.year - b.founded >= 3 && b.lossYears === 0 && life.finances.savings > def.styles[b.style].startup * 2.5 && chance(rng, 0.25)) {
        out.push(['open_location', { biz: { businessId: b.id, cityId: b.cityId, style: b.style, funding: 'savings' } }]);
      }
    }
    // Giving up, or selling at the end of a career.
    const giveUp = 4;
    if (b.lossYears >= giveUp && b.cash < 1) out.push(['close_business', { biz: { businessId: b.id } }]);
    else if (age >= 64 && chance(rng, 0.4)) out.push(['sell_business', { biz: { businessId: b.id } }]);
    // Pay an investor back when it can be afforded.
    const inv = b.owners.find((o) => o.role === 'investor');
    if (inv && b.report && b.report.profit > 0 && life.finances.savings > 150000 && chance(rng, 0.1)) out.push(['buyout_owner', { biz: { businessId: b.id, ownerId: inv.id } }]);
  }
  return out;
}

function decide(b: Business, policy: Policy, rng: RngState) {
  if (policy === 'good') {
    return {
      ...(b.prices !== 'fair' ? { prices: 'fair' as const } : {}),
      ...(b.marketing !== (b.founded >= 0 && b.report && b.report.year - b.founded < 3 ? 'light' : 'light') ? { marketing: 'light' as const } : {}),
      ...(b.qualityInvest !== 'some' ? { qualityInvest: 'some' as const } : {}),
      ...(b.pay !== 'fair' ? { pay: 'fair' as const } : {}),
      ...(b.staffing !== 'normal' ? { staffing: 'normal' as const } : {}),
    };
  }
  if (policy === 'poor') {
    return {
      ...(b.prices !== 'high' ? { prices: 'high' as const } : {}),
      ...(b.marketing !== 'none' ? { marketing: 'none' as const } : {}),
      ...(b.qualityInvest !== 'none' ? { qualityInvest: 'none' as const } : {}),
      ...(b.pay !== 'low' ? { pay: 'low' as const } : {}),
      ...(b.staffing !== 'lean' ? { staffing: 'lean' as const } : {}),
    };
  }
  return {
    prices: pick(rng, PRICE_LEVELS),
    marketing: pick(rng, MARKETING_LEVELS),
    qualityInvest: pick(rng, QUALITY_LEVELS),
    pay: pick(rng, PAY_LEVELS),
    staffing: pick(rng, STAFFING_LEVELS),
  };
}

// ── The report ─────────────────────────────────────────────────────────────

interface Cohort {
  /** Businesses that could be judged at 1, 5 and 10 years, and how many were still going (not failed or closed). */
  n: [number, number, number];
  ok: [number, number, number];
}
const cohort = (): Cohort => ({ n: [0, 0, 0], ok: [0, 0, 0] });

export interface BusinessReport {
  lives: number;
  reached: { 30: number; 50: number; 65: number };
  /** Lives that ever started or bought a business (of lives that reached 30). */
  owners: { any: number; started: number; bought: number; chains: number; heirs: number };
  /** Businesses begun, by how, funding, kind and style. */
  begun: { total: number; started: number; bought: number; byFunding: Record<BusinessFunding, number>; byType: Record<string, number>; byStyle: Record<BusinessStyle, number>; managed: number };
  /** Survival: businesses not failed or closed after 1, 5 and 10 years, by cut. */
  survival: { all: Cohort; byType: Record<string, Cohort>; byStyle: Record<BusinessStyle, Cohort>; byPolicy: Record<Policy, Cohort>; bySkill: Record<'low' | 'mid' | 'high', Cohort>; byRole: Record<'self' | 'manager', Cohort>; byFunding: Record<BusinessFunding, Cohort> };
  /** Business-years, and what they earned (whole dollars): profit, paid to the owner, put in. */
  years: { byPolicy: Record<Policy, { n: number; profit: number; profitable: number }>; n: number; profit: number; profitable: number; draw: number; injected: number; revenue: number; staffMorale: number; unlicensed: number };
  /** How businesses ended. */
  ends: { sold: number; closed: number; failed: number; passed: number; estateSold: number };
  /** Failures: the debts left (loans not repaid and the guaranteed shortfall), and lives that went bankrupt within five years. */
  failures: { n: number; debtLeft: number; withDebt: number; bankruptAfter: number; investorsLost: number; lostBy: Record<string, number> };
  /** Staff, investors and co-founders. */
  people: { hires: number; quits: number; namedPeak: number; investors: number; investorsMadeMoney: number; investorsLostMoney: number; cofounders: number; buyouts: number; managerSkims: number };
  /** Owners against people with careers: income a year, and net worth and bankruptcy for lives that reached 65. */
  compare: { ownerYears: number; ownerIncome: number; workerYears: number; workerIncome: number; owners65: number[]; others65: number[]; ownersBankrupt: number; ownersN: number; othersBankrupt: number; othersN: number };
  /** The business events that fired. */
  events: Record<string, number>;
  messages: string[];
}

const zeroBy = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function emptyBusinessReport(content: ContentBundle): BusinessReport {
  const types = Object.keys(content.businesses).sort();
  return {
    lives: 0,
    reached: { 30: 0, 50: 0, 65: 0 },
    owners: { any: 0, started: 0, bought: 0, chains: 0, heirs: 0 },
    begun: { total: 0, started: 0, bought: 0, byFunding: zeroBy(BUSINESS_FUNDING), byType: zeroBy(types), byStyle: zeroBy(BUSINESS_STYLES), managed: 0 },
    survival: {
      all: cohort(),
      byType: Object.fromEntries(types.map((t) => [t, cohort()])),
      byStyle: Object.fromEntries(BUSINESS_STYLES.map((s) => [s, cohort()])) as Record<BusinessStyle, Cohort>,
      byPolicy: { good: cohort(), random: cohort(), poor: cohort() },
      bySkill: { low: cohort(), mid: cohort(), high: cohort() },
      byRole: { self: cohort(), manager: cohort() },
      byFunding: Object.fromEntries(BUSINESS_FUNDING.map((f) => [f, cohort()])) as Record<BusinessFunding, Cohort>,
    },
    years: { byPolicy: { good: { n: 0, profit: 0, profitable: 0 }, random: { n: 0, profit: 0, profitable: 0 }, poor: { n: 0, profit: 0, profitable: 0 } }, n: 0, profit: 0, profitable: 0, draw: 0, injected: 0, revenue: 0, staffMorale: 0, unlicensed: 0 },
    ends: { sold: 0, closed: 0, failed: 0, passed: 0, estateSold: 0 },
    failures: { n: 0, debtLeft: 0, withDebt: 0, bankruptAfter: 0, investorsLost: 0, lostBy: {} },
    people: { hires: 0, quits: 0, namedPeak: 0, investors: 0, investorsMadeMoney: 0, investorsLostMoney: 0, cofounders: 0, buyouts: 0, managerSkims: 0 },
    compare: { ownerYears: 0, ownerIncome: 0, workerYears: 0, workerIncome: 0, owners65: [], others65: [], ownersBankrupt: 0, ownersN: 0, othersBankrupt: 0, othersN: 0 },
    events: {},
    messages: [],
  };
}

interface Record_ {
  id: Id;
  defId: string;
  style: BusinessStyle;
  start: number;
  funding: BusinessFunding;
  skill: 'low' | 'mid' | 'high';
  role: 'self' | 'manager';
  lost: number | null;
  ended: number | null;
  how: 'started' | 'bought' | 'inherited';
}

const HORIZONS = [1, 5, 10] as const;

export class BusinessWatcher {
  private readonly records = new Map<Id, Record_>();
  private pastSeen = 0;
  private everOwned = false;
  private started = false;
  private bought = false;
  private chain = false;
  private inherited = false;
  private pendingFunding: BusinessFunding | null = null;
  private failedYears: number[] = [];
  private readonly seenStaff = new Set<string>();

  constructor(
    private readonly report: BusinessReport,
    private readonly content: ContentBundle,
    private readonly policy: Policy,
  ) {}

  /** The funding of the next business this life begins (the action just taken). */
  planned(source: BusinessFunding): void {
    this.pendingFunding = source;
  }

  observe(before: LifeState, life: LifeState): void {
    const r = this.report;
    // New businesses (begun by an action since the last observation, or inherited).
    for (const b of life.business.items) {
      if (!this.records.has(b.id)) this.begin(b, life);
    }
    // Years run.
    for (const b of life.business.items) {
      const rep = b.report;
      if (!rep || rep.year !== life.currentYear) continue;
      r.years.n++;
      const pol = r.years.byPolicy[this.policy];
      pol.n++;
      pol.profit += rep.profit;
      if (rep.profit > 0) pol.profitable++;
      r.years.profit += rep.profit;
      r.years.revenue += rep.revenue;
      if (rep.profit > 0) r.years.profitable++;
      r.years.draw += rep.draw;
      r.years.injected += rep.injected;
      r.years.staffMorale += rep.morale;
      if (rep.notes.includes('unlicensed')) r.years.unlicensed++;
      r.people.quits += rep.quit;
      r.people.namedPeak = Math.max(r.people.namedPeak, b.staff.length);
    }
    // Owner income against workers' (the year's gross: pay plus what the businesses paid out).
    // (Famous lives are left out of every comparison with careers, as they are from the net worth target: a star's or a pro's pay swamps the average.)
    const famous = peakRung(life) >= this.content.balance.fame.crossover.rung;
    const gross = life.finances.lastLedger?.year === life.currentYear ? life.finances.lastLedger.gross : null;
    if (gross !== null && !famous && life.character.age >= 25 && life.character.age <= 60) {
      if (life.business.items.some((b) => b.report?.year === life.currentYear)) {
        r.compare.ownerYears++;
        r.compare.ownerIncome += gross;
      } else if (life.business.items.length === 0 && life.career.job !== null) {
        r.compare.workerYears++;
        r.compare.workerIncome += gross;
      }
    }
    // Endings.
    for (const p of life.business.past.slice(this.pastSeen)) {
      if (p.end !== 'passed') r.ends[p.end]++;
      const rec = [...this.records.values()].find((x) => x.ended === null && x.defId === p.defId && x.start === p.fromYear);
      if (rec) {
        rec.ended = p.toYear;
        if (p.end === 'failed' || p.end === 'closed') rec.lost = p.toYear;
      }
      if (p.end === 'failed') {
        r.failures.n++;
        r.failures.lostBy[p.defId] = (r.failures.lostBy[p.defId] ?? 0) + 1;
        const debt = life.finances.debts.filter((d) => d.kind === 'business').reduce((s, d) => s + d.balance, 0);
        if (debt > 0) {
          r.failures.withDebt++;
          r.failures.debtLeft += debt;
        }
        this.failedYears.push(life.currentYear);
      }
    }
    this.pastSeen = life.business.past.length;
    // Staff and owners.
    for (const b of life.business.items) {
      for (const s of b.staff) {
        const key = `${b.id}:${s.personId}`;
        if (!this.seenStaff.has(key)) {
          this.seenStaff.add(key);
          r.people.hires++;
        }
      }
      const was = before.business.items.find((x) => x.id === b.id);
      if (was) {
        if (was.owners.length > b.owners.length) r.people.buyouts++;
        if (b.skimmed > was.skimmed) r.people.managerSkims++;
      }
    }
  }

  private begin(b: Business, life: LifeState): void {
    const r = this.report;
    const def = this.content.businesses[b.defId]!;
    const funding = this.pendingFunding ?? (b.owners.some((o) => o.role === 'cofounder') ? 'cofounder' : b.owners.some((o) => o.role === 'investor') ? 'investors' : b.loanIds.length > 0 ? 'loan' : 'savings');
    this.pendingFunding = null;
    const skill = ownerSkill(life, def, this.content);
    const band = skill < 58 ? 'low' : skill >= 64 ? 'high' : 'mid';
    this.records.set(b.id, { id: b.id, defId: b.defId, style: b.style, start: b.founded, funding, skill: band, role: b.role, lost: null, ended: null, how: b.how });
    this.everOwned = true;
    if (b.how === 'inherited') {
      this.inherited = true;
      return;
    }
    r.begun.total++;
    r.begun[b.how === 'bought' ? 'bought' : 'started']++;
    if (b.how === 'bought') this.bought = true;
    else this.started = true;
    if (b.chainId !== undefined) this.chain = true;
    r.begun.byFunding[funding]++;
    r.begun.byType[b.defId] = (r.begun.byType[b.defId] ?? 0) + 1;
    r.begun.byStyle[b.style]++;
    if (b.role === 'manager') r.begun.managed++;
    for (const o of b.owners) {
      if (o.role === 'investor') r.people.investors++;
      if (o.role === 'cofounder') r.people.cofounders++;
    }
  }

  finish(life: LifeState): void {
    const r = this.report;
    r.lives++;
    const age = life.character.age;
    if (age >= 30) r.reached[30]++;
    if (age >= 50) r.reached[50]++;
    if (age >= 65) r.reached[65]++;
    if (age >= 30 && this.everOwned) {
      r.owners.any++;
      if (this.started) r.owners.started++;
      if (this.bought) r.owners.bought++;
      if (this.chain) r.owners.chains++;
    }
    if (this.inherited) r.owners.heirs++;
    // Survival.
    const end = life.currentYear;
    for (const rec of this.records.values()) {
      if (rec.how === 'inherited') continue;
      const cuts = [r.survival.all, r.survival.byType[rec.defId]!, r.survival.byStyle[rec.style], r.survival.byPolicy[this.policy], r.survival.bySkill[rec.skill], r.survival.byRole[rec.role], r.survival.byFunding[rec.funding]];
      HORIZONS.forEach((h, i) => {
        const lostWithin = rec.lost !== null && rec.lost - rec.start <= h;
        const endedBefore = rec.ended !== null && rec.lost === null && rec.ended - rec.start < h;
        // A sale or a death before the horizon says nothing about it, so those are left out.
        const observed = end - rec.start >= h || lostWithin;
        if (endedBefore || !observed) return;
        for (const c of cuts) {
          c.n[i]!++;
          if (!lostWithin) c.ok[i]!++;
        }
      });
    }
    for (const [id, log] of Object.entries(life.eventLog)) {
      const cat = this.content.events[id]?.category;
      if (cat === 'business' || cat === 'bizstart' || cat === 'bizpast') r.events[id] = (r.events[id] ?? 0) + log.count;
    }
    // What became of the businesses still going at death: passed on in kind, or sold for the estate.
    r.ends.passed += life.estate?.businesses.length ?? 0;
    r.ends.estateSold += life.estate ? life.business.items.length - life.estate.businesses.length : 0;
    // Careers against ownership.
    const c = r.compare;
    if (age >= 65 && peakRung(life) < this.content.balance.fame.crossover.rung) {
      const worth = life.finances.savings + (life.housing.homeValue ?? 0) - totalDebt(life);
      if (this.everOwned) {
        c.owners65.push(worth);
        c.ownersN++;
        if (life.finances.bankruptcyYear !== undefined) c.ownersBankrupt++;
      } else {
        c.others65.push(worth);
        c.othersN++;
        if (life.finances.bankruptcyYear !== undefined) c.othersBankrupt++;
      }
    }
    // Bankruptcy within five years of a failure.
    for (const y of this.failedYears) if (life.finances.bankruptcyYear !== undefined && life.finances.bankruptcyYear >= y && life.finances.bankruptcyYear - y <= 5) r.failures.bankruptAfter++;
    // Investors who were paid back or lost out.
    for (const rel of Object.values(life.relationships)) {
      if (rel.memories.some((m) => m.tag === 'made_money_in_your_business')) r.people.investorsMadeMoney++;
      if (rel.memories.some((m) => m.tag === 'lost_money_in_your_business')) r.people.investorsLostMoney++;
    }
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const mean = (sum: number, n: number, digits = 0) => (n > 0 ? (sum / n).toFixed(digits) : 'n/a');
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const median = (xs: number[]) => (xs.length === 0 ? Number.NaN : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);

function survivalLine(label: string, c: Cohort): string {
  return `    ${label.padEnd(14)} ${HORIZONS.map((h, i) => `${h}y ${pct(c.ok[i]!, c.n[i]!).padStart(6)} (n ${String(c.n[i]).padStart(4)})`).join('  ')}`;
}

export function formatBusiness(r: BusinessReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'Businesses (W3):'];
  lines.push(`  ${r.lives} lives; reached 30: ${r.reached[30]}, 50: ${r.reached[50]}, 65: ${r.reached[65]}`);
  lines.push(`  ${pct(r.owners.any, r.reached[30])} of lives reaching 30 started or bought a business (started ${pct(r.owners.started, r.reached[30])}, bought ${pct(r.owners.bought, r.reached[30])}, a chain ${r.owners.chains}); ${r.owners.heirs} heirs inherited one`);
  lines.push(`  begun: ${r.begun.total} (started ${r.begun.started}, bought ${r.begun.bought}, run by a manager ${r.begun.managed}); by funding: ${BUSINESS_FUNDING.map((f) => `${f} ${r.begun.byFunding[f]}`).join(', ')}`);
  lines.push(`    by kind: ${Object.keys(content.businesses).sort().map((t) => `${t} ${r.begun.byType[t] ?? 0}`).join(', ')}; by style: ${BUSINESS_STYLES.map((s) => `${s} ${r.begun.byStyle[s]}`).join(', ')}`);
  for (const p of ['good', 'random', 'poor'] as const) {
    const q = r.years.byPolicy[p];
    lines.push(`  ${p} decisions: ${q.n} business-years, mean profit ${dollars(q.n > 0 ? q.profit / q.n : 0)}, ${pct(q.profitable, q.n)} profitable`);
  }
  lines.push('  survival (not failed or closed after 1, 5 and 10 years):');
  lines.push(survivalLine('all', r.survival.all));
  for (const t of Object.keys(content.businesses).sort()) lines.push(survivalLine(t, r.survival.byType[t]!));
  for (const s of BUSINESS_STYLES) lines.push(survivalLine(s, r.survival.byStyle[s]));
  for (const p of ['good', 'random', 'poor'] as const) lines.push(survivalLine(`${p} decisions`, r.survival.byPolicy[p]));
  for (const s of ['low', 'mid', 'high'] as const) lines.push(survivalLine(`${s} skill fit`, r.survival.bySkill[s]));
  for (const s of ['self', 'manager'] as const) lines.push(survivalLine(`run by ${s}`, r.survival.byRole[s]));
  for (const f of BUSINESS_FUNDING) lines.push(survivalLine(`funded: ${f}`, r.survival.byFunding[f]));
  const y = r.years;
  lines.push(`  business-years ${y.n}: mean profit ${dollars(y.n > 0 ? y.profit / y.n : 0)} (${pct(y.profitable, y.n)} profitable), mean sales ${dollars(y.n > 0 ? y.revenue / y.n : 0)}, paid to the owner ${dollars(y.n > 0 ? y.draw / y.n : 0)} a year, put in to cover losses ${dollars(y.n > 0 ? y.injected / y.n : 0)} a year, mean staff morale ${mean(y.staffMorale, y.n)}, years with nobody licensed ${y.unlicensed}`);
  lines.push(`  endings: sold ${r.ends.sold}, closed ${r.ends.closed}, failed ${r.ends.failed}; at death: passed on to an heir ${r.ends.passed}, sold or handed back by the estate ${r.ends.estateSold}; failed by kind: ${Object.entries(r.failures.lostBy).sort().map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push(`  failures ${r.failures.n}: ${pct(r.failures.withDebt, r.failures.n)} left a debt (mean ${dollars(r.failures.withDebt > 0 ? r.failures.debtLeft / r.failures.withDebt : 0)}); ${pct(r.failures.bankruptAfter, r.failures.n)} of those lives went bankrupt within five years`);
  const p = r.people;
  lines.push(`  people: hires ${p.hires}, quits ${p.quits}, most named staff at once ${p.namedPeak}; investors ${p.investors} (${p.investorsMadeMoney} people made money, ${p.investorsLostMoney} lost it), co-founders ${p.cofounders}, buyouts ${p.buyouts}, managers who skimmed ${p.managerSkims} years`);
  const c = r.compare;
  lines.push(`  against careers: income a year (ages 25–60) owners ${dollars(c.ownerYears > 0 ? c.ownerIncome / c.ownerYears : 0)} (${c.ownerYears} years) against workers ${dollars(c.workerYears > 0 ? c.workerIncome / c.workerYears : 0)} (${c.workerYears} years)`);
  lines.push(`    net worth at 65 (median): owners ${dollars(median(c.owners65))} (n ${c.ownersN}) against others ${dollars(median(c.others65))} (n ${c.othersN}); bankrupt: owners ${pct(c.ownersBankrupt, c.ownersN)} against others ${pct(c.othersBankrupt, c.othersN)}`);
  const ids = Object.keys(content.events).filter((id) => ['business', 'bizstart', 'bizpast'].includes(content.events[id]!.category));
  const never = ids.filter((id) => !r.events[id]).sort();
  const total = Object.values(r.events).reduce((a, b) => a + b, 0);
  lines.push(`  events: ${total} business events fired in all; ${ids.length - never.length} of ${ids.length} fired at least once`);
  if (never.length > 0) lines.push(`    never fired (${never.length}): ${never.slice(0, 50).join(', ')}${never.length > 50 ? ', ...' : ''}`);
  for (const m of r.messages) lines.push(`    ${m}`);
  return lines;
}

/** The W3 targets (balance/targets.yaml), on a report. */
export function businessTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const r = sim.business;
  const t = content.balance.targets.business;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(2);
  const range = (rng: { min?: number | undefined; max?: number | undefined }, f: (x: number) => string) => `${rng.min !== undefined ? f(rng.min) : '…'}–${rng.max !== undefined ? f(rng.max) : '…'}`;
  const add = (label: string, value: number, rng: { min?: number | undefined; max?: number | undefined }, f: (x: number) => string) =>
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal: range(rng, f), met: !Number.isNaN(value) && (rng.min === undefined || value >= rng.min) && (rng.max === undefined || value <= rng.max) });
  const share = (n: number, d: number) => (d > 0 ? n / d : Number.NaN);
  const s = (c: Cohort, i: number) => share(c.ok[i]!, c.n[i]!);
  add('lives reaching 30 that started or bought a business', share(r.owners.any, r.reached[30]), t.ownerShare, pct1);
  add('businesses still going after 1 year', s(r.survival.all, 0), t.survival1, pct1);
  add('businesses still going after 5 years', s(r.survival.all, 1), t.survival5, pct1);
  add('businesses still going after 10 years', s(r.survival.all, 2), t.survival10, pct1);
  // Poor decisions bleed slowly (a business can lose money for years before it fails) and good ones pay for a hard first year, so the measure is the years that made a profit, not the survival at five years.
  const profitShare = (p: 'good' | 'poor') => share(r.years.byPolicy[p].profitable, r.years.byPolicy[p].n);
  add('business-years that made a profit: good decisions above poor ones (points)', 100 * (profitShare('good') - profitShare('poor')), t.decisionGap, (x) => x.toFixed(1));
  add('5-year survival: a good skill fit above a poor one (points)', 100 * (s(r.survival.bySkill.high, 1) - s(r.survival.bySkill.low, 1)), t.skillGap, (x) => x.toFixed(1));
  add('5-year survival with good decisions (not a guarantee)', s(r.survival.byPolicy.good, 1), t.goodSurvival5, pct1);
  add('businesses that ended in failure, of all that ended', share(r.ends.failed, r.ends.failed + r.ends.closed + r.ends.sold), t.failureShare, pct1);
  add('failures that left a debt of the owner’s', share(r.failures.withDebt, r.failures.n), t.failureDebtShare, pct1);
  add('business-years that made a profit', share(r.years.profitable, r.years.n), t.profitableShare, pct1);
  const ownerIncome = r.compare.ownerYears > 0 ? r.compare.ownerIncome / r.compare.ownerYears : Number.NaN;
  const workerIncome = r.compare.workerYears > 0 ? r.compare.workerIncome / r.compare.workerYears : Number.NaN;
  add('owners’ income a year against workers’ (ratio)', ownerIncome / workerIncome, t.incomeRatio, num);
  const ownerBankrupt = share(r.compare.ownersBankrupt, r.compare.ownersN);
  const otherBankrupt = share(r.compare.othersBankrupt, r.compare.othersN);
  add('bankruptcy among owners above the rest (points): the risk that matches the reward', 100 * (ownerBankrupt - otherBankrupt), t.bankruptGap, (x) => x.toFixed(1));
  add('owners’ median net worth at 65 against everyone else’s (ratio)', median(r.compare.owners65) / median(r.compare.others65), t.netWorthRatio, num);
  return out;
}
