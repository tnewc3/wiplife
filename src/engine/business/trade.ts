/**
 * A location's year of trading, line by line (B2): what each product line
 * draws (price, trend, the city's competition, the economy), what the staff can
 * serve, what is ordered and what runs out, what is sold, spoiled and carried,
 * and what it costs. At the default lines, fair prices, normal orders and a
 * neutral world it reproduces W3's revenue and supplies (`locationFigures` in
 * ./model.ts, which still prices listings and valuations); the build and a test
 * check that. Pure: no random numbers (the caller rolls the season and the luck).
 */
import type { BusinessDef, BusinessStyle, ContentBundle, MarketingLevel, OrderLevel, PayLevel, PriceLevel, ProductDef, QualityLevel } from '../../content/schemas';
import { wholeDollars } from '../finance';
import type { Id, LineResult } from '../types';
import { staffedRatio, type Slot } from './headcount';
import { baseDemand, cityNumbers, maturityAt, nominalRevenue, priceScale } from './model';
import { baseShare, baseUnitCost, effectiveCostShare, itemEnd, itemOf, meanCompetition, orderFor, unitsPerSale } from './products';
import { economyAt, supplierIndex, trendIndex } from './world';

export interface TradeInputs {
  def: BusinessDef;
  style: BusinessStyle;
  cityId: Id;
  yearsOpen: number;
  /** 0 for the first location of the business in this city, 1 for the next, and so on. */
  rank: number;
  reputation: number;
  quality: number;
  marketing: MarketingLevel;
  qualityInvest: QualityLevel;
  pay: PayLevel;
  /** Whoever runs the location: their skill (0–100) and effort (0–1.5). */
  skill: number;
  effort: number;
  season: number;
  shock: number;
  licensed: boolean;
  /** The lines on and sold here, with their price levels. */
  lines: { product: ProductDef; price: PriceLevel }[];
  stock: Record<string, number>;
  forecast: Record<string, number>;
  orders: Record<string, OrderLevel>;
  /** Heads by role (named and crew) and what the payroll comes to. */
  slots: Slot[];
  wages: number;
  /** Cost multiples from deals, and the share of an order that arrives in a shortage, by supplier category. */
  deals: Record<string, number>;
  supply: Record<string, number>;
  seed: string;
  year: number;
  /** The reference world (every index at 1, a steady economy): what the build and the baseline test compare against W3. */
  neutral?: boolean;
}

export interface LocationTrade {
  demand: number;
  customers: number;
  revenue: number;
  rent: number;
  wages: number;
  supplies: number;
  goodsCost: number;
  waste: number;
  holding: number;
  lostSales: number;
  marketing: number;
  quality: number;
  other: number;
  profit: number;
  workers: number;
  staffed: number;
  skill: number;
  /** Customers per head against the usual (1 is the usual load). */
  workload: number;
  lines: LineResult[];
  /** The stock carried to next year, what was wanted (the next forecast), and the stock's value at cost. */
  nextStock: Record<string, number>;
  nextForecast: Record<string, number>;
  stockValue: number;
}

/**
 * The competition multiplier of a city on a line: a crowded city takes trade from the lines that are easy to get elsewhere (more
 * than from the rest of what the place sells, measured against `mean`, the usual exposure of the style's default lines), a small
 * town gives some back; quality above 50 wins some of it back. The default lines together are neutral, so a city's own size and
 * wealth (balance cities) still set a place's total trade, as in W3.
 */
export function competitionFx(p: ProductDef, cityId: Id, quality: number, content: ContentBundle, mean = 1): number {
  const c = content.balance.business.competition;
  const gap = cityNumbers(content, cityId).competition - 1;
  const edge = gap > 0 ? c.edge * gap * Math.max(0, (quality - 50) / 50) : 0;
  return Math.max(0.3, 1 - c.weight * (p.competition - mean) * gap + c.weight * p.competition * edge);
}

/** What the economy does to a line: the phase's demand multiple, by the line's sensitivity. */
export const economyFx = (p: ProductDef, phaseDemand: number): number => 1 + (phaseDemand - 1) * p.economy;

/** The going rate for a line: it follows the supplier index by the pass-through share of the line's cost. */
export function goingRate(def: BusinessDef, p: ProductDef, supplierIdx: number, content: ContentBundle): number {
  return 1 + content.balance.business.suppliers.passThrough * effectiveCostShare(def, p) * (supplierIdx - 1);
}

interface Row {
  product: ProductDef;
  price: PriceLevel;
  share: number;
  fx: number;
  unitPrice: number;
  /** Units wanted before stock (after what the staff can serve), then after customers walking out. */
  wanted: number;
  full: number;
  itemId: string;
  perSale: number;
}

export function tradeLocation(i: TradeInputs, content: ContentBundle): LocationTrade {
  const b = content.balance.business;
  const st = i.def.styles[i.style];
  const lv = b.levels;
  const scale = priceScale(content, i.cityId);
  const econ = i.neutral ? { demand: 1 } : economyAt(i.seed, i.year, content);
  const supplierAt = (category: string): number => (i.neutral ? 1 : supplierIndex(i.seed, category, i.year, content));
  const trendAt = (group: string): number => (i.neutral ? 1 : trendIndex(i.seed, group, i.year, content));

  // Who is there, and what they can serve.
  let workers = 0;
  let skillSum = 0;
  for (const s of i.slots) {
    workers += s.count;
    skillSum += s.skillSum;
  }
  const staffed = staffedRatio(i.slots, i.def, i.style, content);
  const avgSkill = workers > 0 ? skillSum / workers : 50;

  // What the place draws before price and lines.
  const rep = b.demand.reputation.base + (b.demand.reputation.slope * i.reputation) / 100;
  const qual = b.demand.quality.base + (b.demand.quality.slope * i.quality) / 100;
  const marketing = 1 + lv.marketing[i.marketing].boost;
  const skill = 1 + b.demand.skill * (i.skill - 50) * Math.min(1.2, i.effort);
  const saturation = Math.pow(b.demand.saturation, i.rank);
  const attention = b.demand.attention.floor + (1 - b.demand.attention.floor) * Math.min(1, i.effort);
  const d0 = baseDemand(i.def, i.style, i.cityId, content) * rep * qual * marketing * skill * saturation * attention * maturityAt(i.yearsOpen, content) * i.season * i.shock * (i.licensed ? 1 : b.demand.unlicensed);

  // The lines.
  const base = baseShare(i.def, i.style, content);
  const meanExposure = meanCompetition(i.def, i.style, content);
  const rows: Row[] = i.lines.map(({ product: p, price }) => {
    const share = p.share / base;
    const idx = p.supplier !== undefined ? supplierAt(p.supplier) : p.pool ? supplierAt(i.def.pools.find((x) => x.id === p.pool!.id)?.supplier ?? '') : 1;
    const priceFx = Math.pow(lv.price[price].mult, -(st.elasticity * p.elasticity));
    const fx = priceFx * trendAt(p.trend) * competitionFx(p, i.cityId, i.quality, content, meanExposure) * economyFx(p, econ.demand);
    const unitPrice = st.spend * p.price * goingRate(i.def, p, idx, content) * lv.price[price].mult * scale;
    const item = itemOf(i.def, p);
    return { product: p, price, share, fx, unitPrice, wanted: (d0 * share * fx) / p.price, full: 0, itemId: item?.id ?? p.id, perSale: unitsPerSale(p) };
  });
  const custDemand = d0 * rows.reduce((s, r) => s + r.share * r.fx, 0);
  const capacity = st.capacity * Math.pow(Math.min(1.25, staffed), 0.85) * (0.85 + (0.3 * avgSkill) / 100) * Math.min(1, 0.4 + i.effort);
  const served = custDemand > 0 ? Math.min(1, capacity / custDemand) : 1;
  for (const r of rows) {
    r.wanted *= served;
    r.full = r.wanted;
  }

  // Stock: what is ordered and what arrives, then who runs out.
  const wasteF = 1 + b.costs.waste * (50 - i.skill);
  interface Item {
    id: string;
    category: string;
    perishable: number;
    unitCost: number;
    arrived: number;
    available: number;
    use: number;
  }
  const items = new Map<string, Item>();
  for (const r of rows) {
    if (items.has(r.itemId)) continue;
    const it = itemOf(i.def, r.product);
    if (!it) continue;
    const idx = supplierAt(it.category);
    items.set(it.id, { id: it.id, category: it.category, perishable: it.perishable, unitCost: baseUnitCost(i.def, i.style, r.product, i.cityId, content) * idx * (i.deals[it.category] ?? 1) * wasteF, arrived: 0, available: 0, use: 0 });
  }
  const useOf = (it: Item): number => rows.filter((r) => r.itemId === it.id).reduce((s, r) => s + r.wanted * r.perSale, 0);
  for (const it of items.values()) {
    const forecast = i.forecast[it.id] ?? nominalUse(i, rows.filter((r) => r.itemId === it.id), base, content);
    const o = orderFor(forecast, i.stock[it.id] ?? 0, i.orders[it.id] ?? 'normal', i.supply[it.category] ?? 1, content);
    it.arrived = o.arrived;
    it.available = o.available;
  }
  // Customers who cannot get a core line leave without buying some of the rest.
  const core = rows.filter((r) => r.product.core === true);
  const anchors = core.length > 0 ? core : rows.length > 0 ? [[...rows].sort((a, c) => c.share - a.share)[0]!] : [];
  let coreLost = 0;
  for (const r of anchors) {
    const it = items.get(r.itemId);
    const need = it ? useOf(it) : 0;
    if (it && need > 0) coreLost = Math.max(coreLost, 1 - Math.min(1, it.available / need));
  }
  if (coreLost > 0) {
    const keep = 1 - b.products.walkout * coreLost;
    for (const r of rows) if (!anchors.includes(r)) r.wanted *= keep;
  }

  // The year's end for each stock item.
  const ends = new Map<string, ReturnType<typeof itemEnd>>();
  for (const it of items.values()) {
    const use = useOf(it);
    it.use = use;
    ends.set(it.id, itemEnd(use, use, it.available, it.arrived, it.perishable, content));
  }
  const results: LineResult[] = [];
  let revenue = 0;
  let lostSales = 0;
  let goodsCost = 0;
  let wasteCost = 0;
  let holding = 0;
  let stockValue = 0;
  let ratioWeight = 0;
  let ratioSum = 0;
  const nextStock: Record<string, number> = {};
  const nextForecast: Record<string, number> = {};
  for (const r of rows) {
    const it = items.get(r.itemId);
    const end = it ? ends.get(it.id) : undefined;
    const ratio = it && end && it.use > 0 ? end.sold / it.use : 1;
    const sold = r.wanted * ratio;
    const lost = Math.max(0, r.full - sold);
    const rev = sold * r.unitPrice;
    revenue += rev;
    lostSales += lost * r.unitPrice;
    ratioWeight += r.share * r.fx;
    ratioSum += r.share * r.fx * (r.full > 0 ? sold / r.full : 1);
    results.push({ productId: r.product.id, demand: Math.round(r.full), sold: Math.round(sold), lost: Math.round(lost), spoiled: 0, revenue: wholeDollars(rev), cost: wholeDollars(sold * r.perSale * (it?.unitCost ?? 0)) });
  }
  const growth = Math.min(b.products.growthCap, Math.max(1, maturityAt(i.yearsOpen + 1, content) / Math.max(0.01, maturityAt(i.yearsOpen, content))));
  for (const it of items.values()) {
    const end = ends.get(it.id)!;
    goodsCost += end.sold * it.unitCost;
    wasteCost += end.spoiled * it.unitCost;
    holding += end.carry * it.unitCost * b.products.holding;
    stockValue += end.carry * it.unitCost;
    nextStock[it.id] = Math.round(end.carry * 100) / 100;
    // The next forecast is what was wanted here (not what was sold), grown as the place matures.
    nextForecast[it.id] = Math.round(it.use * growth * 100) / 100;
    // Spoiled units belong to the first line that uses the item.
    const first = results.find((x) => rows.find((r) => r.product.id === x.productId)?.itemId === it.id);
    if (first) first.spoiled = Math.round(end.spoiled);
  }
  const customers = custDemand * served * (ratioWeight > 0 ? ratioSum / ratioWeight : 1);

  const city = cityNumbers(content, i.cityId);
  const rent = st.rent * city.costOfLiving;
  const supplies = goodsCost + wasteCost + holding;
  const nominal = nominalRevenue(i.def, i.style, i.cityId, content);
  const marketingCost = nominal * lv.marketing[i.marketing].share;
  const qualityCost = nominal * lv.quality[i.qualityInvest].share;
  const other = revenue * b.costs.overheadShare + b.costs.overheadFixed * city.costOfLiving;
  const profit = revenue - rent - i.wages - supplies - marketingCost - qualityCost - other;
  const usual = st.capacity / Math.max(1, st.staff);
  const workload = workers > 0 ? customers / workers / usual : 0;
  return {
    demand: Math.round(custDemand),
    customers: Math.round(customers),
    revenue: wholeDollars(revenue),
    rent: wholeDollars(rent),
    wages: wholeDollars(i.wages),
    supplies: wholeDollars(supplies),
    goodsCost: wholeDollars(goodsCost),
    waste: wholeDollars(wasteCost),
    holding: wholeDollars(holding),
    lostSales: wholeDollars(lostSales),
    marketing: wholeDollars(marketingCost),
    quality: wholeDollars(qualityCost),
    other: wholeDollars(other),
    profit: wholeDollars(profit),
    workers,
    staffed,
    skill: avgSkill,
    workload,
    lines: results,
    nextStock,
    nextForecast,
    stockValue: wholeDollars(stockValue),
  };
}

/** What a line's stock item would be wanted at the nominal level (a new line or location has no forecast yet): the place's base demand at fair prices in its year of opening. */
function nominalUse(i: TradeInputs, rows: Row[], base: number, content: ContentBundle): number {
  const d = baseDemand(i.def, i.style, i.cityId, content) * maturityAt(i.yearsOpen, content);
  return rows.reduce((s, r) => s + (d * (r.product.share / base) * r.perSale) / r.product.price, 0);
}
