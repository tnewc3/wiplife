/**
 * What the UI needs about businesses (W3), read through selectors: the
 * business screen (the yearly report in words and numbers, staff, locations,
 * owners, loans and the decisions), the market of businesses for sale in a
 * city, what starting one would cost with each kind of funding, and the
 * business money on the Money tab. Nothing here changes the life.
 */
import {
  BUSINESS_STYLES,
  MARKETING_LEVELS,
  PAY_LEVELS,
  PRICE_LEVELS,
  QUALITY_LEVELS,
  STAFFING_LEVELS,
  type BusinessKind,
  type BusinessStyle,
  type ContentBundle,
} from '../../content/schemas';
import { paymentDue } from '../finance';
import type { Business, BusinessReport, Id, LifeState } from '../types';
import { checkFunding, cofounderCandidates, investorCandidates, loanOffer, stakeFor, type Candidate, type FundingPlan, type LoanOffer } from './funding';
import { listingById, marketFor, type Listing } from './market';
import { fitMult, managerWage, salePrice, totalToStart, typicalLocation, valuation } from './model';
import { hasLicenseHolder, livingStaff, managerOf, myBusinesses, yourShare, youHoldLicense } from './query';
import { hireCandidates, hiringCost, staffRoom, type Hireable } from './staff';
import { buyoutPrice, expandCost } from './found';
import { sameCountryCities } from '../country';

export interface ReportView {
  year: number;
  customers: string;
  money: string;
  staff: string;
  quality: string;
  notes: string[];
  numbers: BusinessReport;
}

export interface StaffView {
  personId: Id;
  name: string;
  title: string;
  location: string | null;
  skill: number;
  morale: number;
  wage: number;
  licensed: boolean;
  manager: boolean;
  years: number;
  /** In words: how they seem to be feeling. */
  mood: string;
}

export interface OwnerView {
  id: Id | 'you';
  name: string;
  share: number;
  role: 'you' | 'investor' | 'cofounder';
  put: number;
  paid: number;
  /** What buying them out would cost now (0 for you). */
  buyout: number;
}

export interface LocationView {
  id: Id;
  city: string;
  cityId: Id;
  style: string;
  opened: number;
  customers: number;
  revenue: number;
  profit: number | null;
}

export interface LoanView {
  debtId: Id;
  balance: number;
  rate: number;
  due: number;
}

export interface BusinessView {
  id: Id;
  defId: Id;
  name: string;
  kind: string;
  noun: string;
  styleLabel: string;
  style: BusinessStyle;
  city: string;
  cityId: Id;
  founded: number;
  how: Business['how'];
  chain: string | null;
  role: Business['role'];
  decisions: { prices: Business['prices']; marketing: Business['marketing']; qualityInvest: Business['qualityInvest']; pay: Business['pay']; staffing: Business['staffing'] };
  report: ReportView | null;
  cash: number;
  quality: number;
  reputation: number;
  morale: number;
  value: number;
  salePrice: number;
  yourShare: number;
  yourEquity: number;
  staff: StaffView[];
  locations: LocationView[];
  owners: OwnerView[];
  loans: LoanView[];
  needsLicense: string | null;
  licensed: boolean;
  /** Staff you could still hire, with the cost, and people you know who could work there. */
  staffRoom: number;
  hireCost: number;
  managerHireCost: number;
  hireable: Hireable[];
  hasManager: boolean;
  /** What a new location would cost in each style. */
  expandCosts: Record<BusinessStyle, number>;
  canExpand: boolean;
  lossYears: number;
}

export interface ListingView {
  id: string;
  name: string;
  kind: 'business' | 'chain';
  noun: string;
  styleLabel: string;
  city: string;
  cities: string[];
  years: number;
  trait: string;
  reputation: number;
  profit: number;
  revenue: number;
  price: number;
  staff: number;
  locations: number;
  needsLicense: string | null;
}

export interface StartOption {
  defId: Id;
  name: string;
  noun: string;
  kind: BusinessKind;
  blurb: string;
  license: string | null;
  youHoldLicense: boolean;
  names: string[];
  styles: {
    style: BusinessStyle;
    label: string;
    blurb: string;
    fitOut: number;
    capital: number;
    hiring: number;
    /** What hiring a manager would add to the cost. */
    managerHiring: number;
    total: number;
    /** A typical year there once it is established. */
    typicalRevenue: number;
    typicalProfit: number;
    fit: number;
  }[];
}

export interface FundingView {
  loan: LoanOffer;
  investors: (Candidate & { stake: number })[];
  cofounders: Candidate[];
  cofounderShares: number[];
  savings: number;
  maxInvestors: number;
}

export interface BusinessScreenView {
  canOwn: boolean;
  /** Why not (age, prison), or null. */
  blocked: 'age' | 'away' | null;
  owned: BusinessView[];
  full: boolean;
  past: LifeState['business']['past'];
  cities: { id: Id; name: string }[];
  options: StartOption[];
  savings: number;
}

const word = (n: number, ladder: readonly [number, string][], fallback: string): string => ladder.find(([min]) => n >= min)?.[1] ?? fallback;

/** The yearly report in words: customers, money, staff and quality, and the notes. */
export function reportWords(b: Business, content: ContentBundle): ReportView | null {
  const r = b.report;
  if (!r) return null;
  const w = content.text.business.report;
  const ratio = r.customersBefore > 0 ? r.customers / r.customersBefore : 1.1;
  const customers = ratio >= 1.25 ? w.customers.boom : ratio >= 1.05 ? w.customers.up : ratio >= 0.95 ? w.customers.steady : ratio >= 0.75 ? w.customers.down : w.customers.slump;
  const margin = r.revenue > 0 ? r.profit / r.revenue : r.profit < 0 ? -1 : 0;
  const money = margin >= 0.2 ? w.money.strong : margin >= 0.08 ? w.money.profit : margin >= 0 ? w.money.thin : margin >= -0.15 ? w.money.loss : w.money.deep;
  const staff = word(r.morale, [[70, w.staff.happy], [50, w.staff.fine], [35, w.staff.tense]], w.staff.ready_to_quit);
  const quality = word(r.qualityScore, [[65, w.quality.high], [42, w.quality.fine]], w.quality.slipping);
  const notes = r.notes.filter((n) => n in w.notes).map((n) => w.notes[n as keyof typeof w.notes]);
  return { year: r.year, customers, money, staff, quality, notes, numbers: r };
}

function moodWord(morale: number): string {
  return morale >= 70 ? 'Happy' : morale >= 50 ? 'Fine' : morale >= 35 ? 'Tense' : 'Thinking of leaving';
}

function cityName(content: ContentBundle, id: Id): string {
  return content.cities[id]?.name ?? id;
}

/** One business for the screen. */
export function businessView(state: LifeState, b: Business, content: ContentBundle): BusinessView {
  const def = content.businesses[b.defId]!;
  const staff = livingStaff(state, b).map((s) => {
    const p = state.people[s.personId]!;
    const loc = s.locationId === null ? null : b.locations.find((l) => l.id === s.locationId);
    return { personId: s.personId, name: `${p.name.first} ${p.name.last}`, title: s.title, location: loc ? cityName(content, loc.cityId) : null, skill: s.skill, morale: s.morale, wage: s.wage, licensed: s.licensed, manager: s.manager === true, years: state.currentYear - s.since, mood: moodWord(s.morale) };
  });
  const value = valuation(b, content);
  const share = yourShare(b);
  const manager = managerOf(b);
  const loans = b.loanIds.flatMap((id) => {
    const d = state.finances.debts.find((x) => x.id === id);
    return d ? [{ debtId: id, balance: d.balance, rate: d.annualRate, due: paymentDue(d) }] : [];
  });
  const expandCosts = Object.fromEntries(BUSINESS_STYLES.map((s) => [s, expandCost(def, b.cityId, s, content)])) as Record<BusinessStyle, number>;
  return {
    id: b.id,
    defId: b.defId,
    name: b.name,
    kind: def.name,
    noun: def.noun,
    styleLabel: def.styles[b.style].label,
    style: b.style,
    city: cityName(content, b.cityId),
    cityId: b.cityId,
    founded: b.founded,
    how: b.how,
    chain: b.chainId !== undefined ? (content.chains[b.chainId]?.name ?? null) : null,
    role: b.role,
    decisions: { prices: b.prices, marketing: b.marketing, qualityInvest: b.qualityInvest, pay: b.pay, staffing: b.staffing },
    report: reportWords(b, content),
    cash: b.cash,
    quality: b.quality,
    reputation: b.reputation,
    morale: b.morale,
    value,
    salePrice: salePrice(b, content),
    yourShare: share,
    yourEquity: Math.round((value * share) / 100),
    staff,
    locations: b.locations.map((l) => ({ id: l.id, city: cityName(content, l.cityId), cityId: l.cityId, style: def.styles[l.style].label, opened: l.opened, customers: l.result?.customers ?? 0, revenue: l.result?.revenue ?? 0, profit: l.result ? l.result.profit : null })),
    owners: b.owners.map((o) => ({ id: o.id, name: o.name, share: o.share, role: o.role, put: o.put, paid: o.paid, buyout: o.id === 'you' ? 0 : buyoutPrice(b, o.id, content) })),
    loans,
    needsLicense: def.license?.title ?? null,
    licensed: hasLicenseHolder(state, b, def) || (def.license !== undefined && b.owners.some((o) => o.role === 'cofounder' && state.people[o.id]?.occupation === def.license!.job)),
    staffRoom: staffRoom(state, b, content),
    hireCost: hiringCost(def, b, false, false, content),
    managerHireCost: hiringCost(def, b, false, true, content),
    hireable: hireCandidates(state, b, def, content),
    hasManager: manager !== undefined,
    expandCosts,
    canExpand: b.locations.length < content.balance.business.limits.locations,
    lossYears: b.lossYears,
  };
}

/** What each kind of business would cost to start in a city, in each style. */
export function startOptions(state: LifeState, cityId: Id, content: ContentBundle): StartOption[] {
  return Object.keys(content.businesses)
    .sort()
    .map((id) => content.businesses[id]!)
    .filter((d) => !d.retired)
    .map((d) => {
      const holds = d.license ? youHoldLicense(state, d.license) : true;
      return {
        defId: d.id,
        name: d.name,
        noun: d.noun,
        kind: d.kind,
        blurb: d.blurb,
        license: d.license?.title ?? null,
        youHoldLicense: holds,
        names: d.names,
        styles: BUSINESS_STYLES.map((style) => {
          const t = totalToStart(d, style, cityId, d.license !== undefined && !holds, content);
          const typical = typicalLocation(d, style, cityId, content.balance.business.reputation.start + 5, d.styles[style].quality, content);
          return { style, label: d.styles[style].label, blurb: d.styles[style].blurb, fitOut: t.fitOut, capital: t.capital, hiring: t.hiring, managerHiring: hiringCost(d, { style, cityId, pay: 'fair' } as Business, false, true, content), total: t.total, typicalRevenue: typical.revenue, typicalProfit: typical.profit, fit: Math.round(fitMult(d, style, cityId, content) * 100) };
        }),
      };
    });
}

/** What can fund `need`: a loan, people who could invest, people who could be a co-founder. */
export function fundingView(state: LifeState, need: number, defId: Id | undefined, content: ContentBundle): FundingView {
  const f = content.balance.business.funding;
  return {
    loan: loanOffer(state, need, defId ? content.businesses[defId] : undefined, content),
    investors: investorCandidates(state, content).map((c) => ({ ...c, stake: stakeFor(c.capacity, need, content) })),
    cofounders: cofounderCandidates(state, content),
    cofounderShares: [...f.cofounder.shares],
    savings: state.finances.savings,
    maxInvestors: f.investors.max,
  };
}

export interface FundingCheck {
  /** Why the plan cannot be carried out (a key into BUSINESS_BLOCK_LABELS), or null. */
  block: string | null;
  /** What you would pay from savings, borrow, and what the others put in. */
  own: number;
  loan: number;
  others: number;
}

/** Checks a funding plan for `need` dollars: what each side would pay, or why it cannot be done. */
export function fundingCheck(state: LifeState, need: number, plan: FundingPlan, defId: Id | undefined, content: ContentBundle): FundingCheck {
  const checked = checkFunding(state, need, plan, defId ? content.businesses[defId] : undefined, content);
  if ('block' in checked) return { block: checked.block, own: 0, loan: 0, others: 0 };
  return { block: null, own: checked.result.own, loan: checked.result.loan, others: checked.result.others };
}

function listingView(l: Listing, content: ContentBundle): ListingView {
  const def = content.businesses[l.defId]!;
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    noun: def.noun,
    styleLabel: def.styles[l.style].label,
    city: cityName(content, l.cityId),
    cities: [...new Set(l.locations.map((x) => cityName(content, x.cityId)))],
    years: l.years,
    trait: l.trait,
    reputation: l.reputation,
    profit: l.profit,
    revenue: l.revenue,
    price: l.price,
    staff: l.staff,
    locations: l.locations.length,
    needsLicense: def.license?.title ?? null,
  };
}

/** The businesses for sale in a city. */
export function getMarketView(state: LifeState, cityId: Id, content: ContentBundle): ListingView[] {
  return marketFor(state, cityId, content)
    .map((l) => listingView(l, content))
    .sort((a, b) => a.price - b.price);
}

/** One listing, if it is still for sale. */
export function getListingView(state: LifeState, id: string, content: ContentBundle): ListingView | null {
  const l = listingById(state, id, content);
  return l ? listingView(l, content) : null;
}

export function getBusinessScreen(state: LifeState, content: ContentBundle): BusinessScreenView {
  const lim = content.balance.business.limits;
  const blocked = state.character.age < lim.minAge ? 'age' : state.housing.kind === 'incarcerated' ? 'away' : null;
  return {
    canOwn: blocked === null,
    blocked,
    owned: myBusinesses(state).map((b) => businessView(state, b, content)),
    full: state.business.items.length >= lim.businesses,
    past: state.business.past,
    cities: sameCountryCities(state.character.cityId, content)
      .map((id) => ({ id, name: content.cities[id]!.name })),
    options: startOptions(state, state.character.cityId, content),
    savings: state.finances.savings,
  };
}

export interface BusinessMoneyView {
  businesses: { id: Id; name: string; profit: number | null; draw: number; injected: number; cash: number; value: number; equity: number; owed: number; loanDue: number }[];
  /** This year's: what your businesses paid you and what you put into them. */
  draws: number;
  injected: number;
  owed: number;
  equity: number;
  loanDue: number;
}

/** Business money for the Money tab: what each paid you or cost you this year, what you owe on their loans and what your share is worth. */
export function getBusinessMoney(state: LifeState, content: ContentBundle): BusinessMoneyView | null {
  if (state.business.items.length === 0 && state.business.past.length === 0) return null;
  const rows = myBusinesses(state).map((b) => {
    const v = businessView(state, b, content);
    return { id: b.id, name: b.name, profit: b.report ? b.report.profit : null, draw: b.report?.draw ?? 0, injected: b.report?.injected ?? 0, cash: b.cash, value: v.value, equity: v.yourEquity, owed: v.loans.reduce((s, l) => s + l.balance, 0), loanDue: v.loans.reduce((s, l) => s + l.due, 0) };
  });
  return {
    businesses: rows,
    draws: state.business.year.year === state.currentYear ? state.business.year.draw : 0,
    injected: state.business.year.year === state.currentYear ? state.business.year.inject : 0,
    owed: rows.reduce((s, r) => s + r.owed, 0),
    equity: rows.reduce((s, r) => s + r.equity, 0),
    loanDue: rows.reduce((s, r) => s + r.loanDue, 0),
  };
}

export const MENU_LEVELS = { prices: PRICE_LEVELS, marketing: MARKETING_LEVELS, qualityInvest: QUALITY_LEVELS, pay: PAY_LEVELS, staffing: STAFFING_LEVELS } as const;

/** Used by the screen to show what a manager would cost a year. */
export function managerCost(b: Business, content: ContentBundle): number {
  const def = content.businesses[b.defId]!;
  return managerWage(def, b.style, b.cityId, b.pay, 50, content);
}

