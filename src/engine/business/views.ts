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
import type { Business, BusinessReport, Id, LifeState, LineResult } from '../types';
import { checkFunding, cofounderCandidates, investorCandidates, loanOffer, stakeFor, type Candidate, type FundingPlan, type LoanOffer } from './funding';
import { listingById, marketFor, type Listing } from './market';
import { fitMult, managerWage, salePrice, totalToStart, typicalLocation, valuation } from './model';
import { hasLicenseHolder, livingStaff, managerOf, myBusinesses, yourShare, youHoldLicense } from './query';
import { hireCandidates, hiringCost, staffRoom, type Hireable } from './staff';
import { buyoutPrice, expandCost, lineBlock, switchFee } from './found';
import { crewAt, namedAt, crewPool, headcountBlock } from './crew';
import { crewRoles, managerRole, maxHeads, roleById } from './headcount';
import { baseUnitCost, itemOf, productsOf } from './products';
import { franchiseConditions, franchiseEligible, franchiseFee, franchiseeCandidates } from './franchise';
import { appointBlock, appointFee, namedTotal, transferBlock, transferCost, willingWord, willingness, type Willing } from './staff';
import { economyAt, supplierIndex, supplierMove } from './world';
import type { EconomyPhase, OrderLevel, PriceLevel, StockState } from '../../content/schemas';
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
  depth: DepthView;
}

/** B2: one product line for the Products tab. */
export interface LineView {
  productId: Id;
  name: string;
  type: 'goods' | 'service';
  core: boolean;
  on: boolean;
  soldHere: boolean;
  price: PriceLevel;
  /** What it nets on a unit at the going rate, as a share of the price, now (0–1), and the supplier's mood. */
  margin: number;
  supplier: { category: string; label: string; mood: 'up' | 'down' | 'steady'; name: string };
  stockId: Id;
  order: OrderLevel;
  /** Last year's results, whole units and dollars (null before a report). */
  last: LineResult | null;
  stock: StockState | 'new';
  /** Why it cannot be switched on (null if it can). */
  blocked: string | null;
  fee: number;
}

export interface PoolView {
  id: Id;
  name: string;
  order: OrderLevel;
  supplier: { category: string; label: string; mood: 'up' | 'down' | 'steady' };
  usedBy: string[];
}

export interface RoleHeadView {
  roleId: Id;
  title: string;
  target: number;
  named: number;
  crew: number;
  min: number;
  max: number;
  wage: number;
  lead: boolean;
  licensed: boolean;
  canMore: boolean;
  canLess: boolean;
  crewMorale: number | null;
}

export interface MoveView {
  locationId: Id;
  label: string;
  block: string | null;
  willing: Willing | null;
  cost: number;
}

export interface TeamLocationView {
  id: Id;
  city: string;
  cityId: Id;
  style: string;
  heads: number;
  capHeads: number;
  roles: RoleHeadView[];
  manager: { personId: Id; name: string; skill: number } | null;
  /** Who runs it day to day: you, the location's manager, the general manager, or nobody. */
  runner: 'you' | 'manager' | 'general' | 'away' | 'nobody';
  staffRoom: number;
  /** People you know who could work there (adults in its city who are free and fond enough of you). */
  hireable: Hireable[];
}

export interface TeamPersonView {
  personId: Id;
  name: string;
  roleId: Id;
  roleTitle: string;
  locationId: Id | null;
  isLocationManager: boolean;
  moves: MoveView[];
  canAppoint: string | null;
  appointFee: number;
}

export interface PlaceView {
  id: Id;
  city: string;
  cityId: Id;
  style: string;
  opened: number;
  manager: string | null;
  heads: number;
  crew: number;
  stock: 'none' | 'low' | 'ok' | 'high';
  revenue: number;
  profit: number | null;
  customers: number;
}

export interface FranchiseRow {
  id: Id;
  city: string;
  style: string;
  operator: string;
  royalty: number;
  revenue: number;
  royaltyPaid: number;
  support: number;
  profit: number;
  risk: number;
  since: number;
}

export interface FranchiseView {
  eligible: boolean;
  conditions: { key: string; met: boolean; need: number; have: number }[];
  rows: FranchiseRow[];
  royalties: readonly number[];
  limit: number;
  count: number;
  netYear: number;
}

export interface DepthView {
  economy: { phase: EconomyPhase; label: string };
  mode: 'menu' | 'choose' | 'services';
  lineLimit: number | null;
  lines: LineView[];
  pools: PoolView[];
  team: TeamLocationView[];
  people: TeamPersonView[];
  training: { level: Business['training']; cost: number };
  places: PlaceView[];
  franchise: FranchiseView;
  namedAll: number;
  namedCap: number;
  maxLocations: number;
  stockValue: number;
  hireRoles: { roleId: Id; title: string; lead: boolean; licensed: boolean }[];
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

const stockWord = (r: LineResult | null, content: ContentBundle): StockState | 'new' => {
  if (!r) return 'new';
  const lim = content.balance.business.products;
  if (r.demand > 0 && r.lost / r.demand > lim.stockout.line) return 'short';
  if (r.sold > 0 && r.spoiled / (r.sold + r.spoiled) > lim.wasteLine) return 'surplus';
  return 'fine';
};

const moodOf = (move: number, content: ContentBundle): 'up' | 'down' | 'steady' => (move > content.balance.business.suppliers.riseThreshold / 3 ? 'up' : move < -content.balance.business.suppliers.riseThreshold / 3 ? 'down' : 'steady');

/** B2: the Products, Team, Places and Franchise tabs of one business. */
export function depthView(state: LifeState, b: Business, def: ContentBundle['businesses'][string], content: ContentBundle): DepthView {
  const bal = content.balance.business;
  const year = state.currentYear;
  const lastLines = new Map((b.report?.lines ?? []).map((l) => [l.productId, l]));
  const supplier = (category: string) => {
    const names = content.registries.business.suppliers[category]?.names ?? [''];
    const hash = Math.abs([...`${b.id}${category}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    return { category, label: content.registries.business.suppliers[category]?.label ?? category, mood: moodOf(supplierMove(state.seed, category, year, content), content), name: names[hash % names.length]! };
  };
  const limit = def.lineMode === 'choose' ? Math.max(...b.locations.map((l) => bal.products.maxLines[l.style])) : null;
  const lines: LineView[] = b.lines.flatMap((line) => {
    const p = def.products.find((x) => x.id === line.productId);
    if (!p) return [];
    const item = itemOf(def, p);
    const loc = b.locations[0]!;
    const soldHere = b.locations.some((l) => productsOf(def, l.style).some((x) => x.id === p.id));
    const cost = baseUnitCost(def, loc.style, p, loc.cityId, content) * supplierIndex(state.seed, item?.category ?? '', year, content);
    const price = def.styles[loc.style].spend * p.price * bal.levels.price[line.price].mult * Math.pow(content.cities[loc.cityId]?.costOfLiving ?? 1, 0.5);
    const unitCost = p.type === 'goods' ? cost : cost * (p.pool?.units ?? 1);
    const last = lastLines.get(p.id) ?? null;
    return [
      {
        productId: p.id,
        name: p.name,
        type: p.type,
        core: p.core === true,
        on: line.on,
        soldHere,
        price: line.price,
        margin: price > 0 ? Math.max(-1, Math.min(1, 1 - unitCost / price)) : 0,
        supplier: supplier(item?.category ?? ''),
        stockId: item?.id ?? p.id,
        order: b.orders[item?.id ?? p.id] ?? 'normal',
        last,
        stock: line.on ? stockWord(last, content) : 'new',
        blocked: lineBlock(state, b, def, p.id, !line.on, content),
        fee: switchFee(b, def, p.id, content),
      },
    ];
  });
  const pools: PoolView[] = def.pools.map((pool) => ({
    id: pool.id,
    name: pool.name,
    order: b.orders[pool.id] ?? 'normal',
    supplier: (({ category, label, mood }) => ({ category, label, mood }))(supplier(pool.supplier)),
    usedBy: def.products.filter((p) => p.pool?.id === pool.id && b.lines.some((l) => l.productId === p.id && l.on)).map((p) => p.name),
  }));
  const mgrRole = managerRole(def);
  const runnerOf = (loc: Business['locations'][number]): TeamLocationView['runner'] => (loc.manager !== undefined ? 'manager' : b.role === 'self' ? (loc.cityId === state.character.cityId ? 'you' : 'away') : managerOf(b) ? 'general' : 'nobody');
  const team: TeamLocationView[] = b.locations.map((loc) => {
    const target = b.headcount[loc.id] ?? {};
    const mgr = loc.manager !== undefined ? b.staff.find((s) => s.personId === loc.manager) : undefined;
    const mp = mgr ? state.people[mgr.personId] : undefined;
    return {
      id: loc.id,
      city: content.cities[loc.cityId]?.name ?? loc.cityId,
      cityId: loc.cityId,
      style: def.styles[loc.style].label,
      heads: Object.values(target).reduce((a, n) => a + n, 0),
      capHeads: maxHeads(def, loc.style, content),
      roles: crewRoles(def).map((r) => ({
        roleId: r.id,
        title: r.title,
        target: target[r.id] ?? 0,
        named: namedAt(b, loc.id, r.id),
        crew: crewPool(b, loc.id, r.id)?.count ?? 0,
        min: r.min,
        max: r.max,
        wage: Math.round(((def.styles[loc.style].wage * (content.cities[loc.cityId]?.salaryMultiplier ?? 1)) * bal.levels.pay[b.pay].mult * r.wage) / 100) * 100,
        lead: r.lead === true,
        licensed: r.licensed === true,
        canMore: headcountBlock(b, def, loc.id, r.id, (target[r.id] ?? 0) + 1, content) === null,
        canLess: headcountBlock(b, def, loc.id, r.id, (target[r.id] ?? 0) - 1, content) === null,
        crewMorale: crewPool(b, loc.id, r.id) ? Math.round(crewPool(b, loc.id, r.id)!.morale) : null,
      })),
      manager: mgr && mp ? { personId: mgr.personId, name: `${mp.name.first} ${mp.name.last}`, skill: mgr.skill } : null,
      runner: runnerOf(loc),
      staffRoom: staffRoom(state, b, content, loc.id),
      hireable: hireCandidates(state, b, def, content, loc.cityId),
    };
  });
  const people: TeamPersonView[] = livingStaff(state, b)
    .filter((s) => !s.manager)
    .map((s) => {
      const p = state.people[s.personId]!;
      const here = b.locations.find((l) => l.id === s.locationId);
      return {
        personId: s.personId,
        name: `${p.name.first} ${p.name.last}`,
        roleId: s.roleId,
        roleTitle: roleById(def, s.roleId)?.title ?? s.title,
        locationId: s.locationId,
        isLocationManager: b.locations.some((l) => l.manager === s.personId),
        moves: b.locations
          .filter((l) => l.id !== s.locationId)
          .map((l) => {
            const far = here !== undefined && here.cityId !== l.cityId;
            return { locationId: l.id, label: `${content.cities[l.cityId]?.name ?? l.cityId}${b.locations.filter((x) => x.cityId === l.cityId).length > 1 ? ` (${def.styles[l.style].label.toLowerCase()})` : ''}`, block: transferBlock(state, b, s.personId, l.id, content), willing: far ? willingWord(willingness(state, b, s, l.id, content), content) : null, cost: transferCost(b, s, l.id, content) };
          }),
        canAppoint: s.locationId !== null && mgrRole ? appointBlock(state, b, def, s.personId, s.locationId, content) : 'unknown',
        appointFee: appointFee(s, content),
      };
    });
  const places: PlaceView[] = b.locations.map((loc) => {
    const mgr = loc.manager !== undefined ? b.staff.find((s) => s.personId === loc.manager) : undefined;
    const mp = mgr ? state.people[mgr.personId] : undefined;
    const carried = Object.values(loc.stock).reduce((a, n) => a + n, 0);
    const wanted = Object.values(loc.forecast).reduce((a, n) => a + n, 0);
    const ratio = wanted > 0 ? carried / wanted : 0;
    return {
      id: loc.id,
      city: content.cities[loc.cityId]?.name ?? loc.cityId,
      cityId: loc.cityId,
      style: def.styles[loc.style].label,
      opened: loc.opened,
      manager: mp ? `${mp.name.first} ${mp.name.last}` : null,
      heads: Object.values(b.headcount[loc.id] ?? {}).reduce((a, n) => a + n, 0),
      crew: crewAt(b, loc.id),
      stock: carried <= 0 ? 'none' : ratio < 0.03 ? 'low' : ratio > 0.2 ? 'high' : 'ok',
      revenue: loc.result?.revenue ?? 0,
      profit: loc.result ? loc.result.profit : null,
      customers: loc.result?.customers ?? 0,
    };
  });
  const fr = bal.franchise;
  const franchise: FranchiseView = {
    eligible: franchiseEligible(b, state, content),
    conditions: franchiseConditions(b, state, content),
    rows: b.franchises.map((f) => {
      const p = f.personId !== null ? state.people[f.personId] : undefined;
      return { id: f.id, city: content.cities[f.cityId]?.name ?? f.cityId, style: def.styles[f.style].label, operator: p ? `${p.name.first} ${p.name.last}` : 'An operator you have not met', royalty: f.royalty, revenue: f.revenue, royaltyPaid: f.royaltyPaid, support: f.support, profit: f.profit, risk: f.risk, since: f.since };
    }),
    royalties: fr.royalties,
    limit: bal.limits.franchises,
    count: b.franchises.length,
    netYear: b.franchises.reduce((sum, f) => sum + f.royaltyPaid - f.support, 0),
  };
  return {
    economy: { phase: economyAt(state.seed, year, content).phase, label: bal.economy.phases[economyAt(state.seed, year, content).phase].label },
    mode: def.lineMode,
    lineLimit: limit,
    lines,
    pools,
    team,
    people,
    training: { level: b.training, cost: Math.round((b.report?.wages ?? 0) * bal.training[b.training].share) },
    places,
    franchise,
    namedAll: namedTotal(state),
    namedCap: bal.limits.namedTotal,
    maxLocations: bal.limits.locations,
    stockValue: b.stockValue,
    hireRoles: crewRoles(def).map((r) => ({ roleId: r.id, title: r.title, lead: r.lead === true, licensed: r.licensed === true })),
  };
}

/** What selling a franchise in a city and style would bring: the fee, and who you know there who could run it. */
export function getFranchiseOffer(state: LifeState, businessId: Id, cityId: Id, style: BusinessStyle, content: ContentBundle): { fee: number; candidates: { personId: Id; name: string; age: number; affection: number }[] } | null {
  const b = state.business.items.find((x) => x.id === businessId);
  const def = b && content.businesses[b.defId];
  if (!b || !def || !content.cities[cityId]) return null;
  return { fee: franchiseFee(def, style, cityId, b, content), candidates: franchiseeCandidates(state, b, cityId, content) };
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
    canExpand: b.locations.length < content.balance.business.limits.locations && state.business.items.reduce((n, x) => n + x.locations.length, 0) < content.balance.business.limits.totalLocations,
    lossYears: b.lossYears,
    depth: depthView(state, b, def, content),
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

