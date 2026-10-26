/**
 * The economics of a business (W3), as pure functions of the situation: what
 * a location draws, earns and costs, what a start costs and what a business
 * is worth. The yearly step, the market and the funding rules all use these,
 * so a price on the market is worked out the way a year of trading is.
 * Numbers: balance/business.yaml.
 */
import type { BusinessDef, BusinessStyle, ContentBundle, MarketingLevel, PayLevel, PriceLevel, QualityLevel, StaffingLevel } from '../../content/schemas';
import { wholeDollars } from '../finance';
import type { Business, Id } from '../types';

export interface CityNumbers {
  size: number;
  wealth: number;
  competition: number;
  costOfLiving: number;
  salaryMultiplier: number;
}

export function cityNumbers(content: ContentBundle, cityId: Id): CityNumbers {
  const b = content.balance.business.cities[cityId] ?? { size: 1, wealth: 1, competition: 1 };
  const city = content.cities[cityId];
  return { ...b, costOfLiving: city?.costOfLiving ?? 1, salaryMultiplier: city?.salaryMultiplier ?? 1 };
}

/** How well a style suits a city: size^e × wealth^e, kept within a sensible range. */
export function fitMult(def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number {
  const city = cityNumbers(content, cityId);
  const f = def.fit[style];
  return Math.min(2, Math.max(0.25, Math.pow(city.size, f.size) * Math.pow(city.wealth, f.wealth)));
}

/** What a customer's spending is scaled by in a city (prices follow the cost of living, less than one for one). */
export const priceScale = (content: ContentBundle, cityId: Id): number => Math.pow(cityNumbers(content, cityId).costOfLiving, 0.5);

/** A worker's market wage for a style in a city. */
export const marketWage = (def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number => wholeDollars(def.styles[style].wage * cityNumbers(content, cityId).salaryMultiplier);

/** Fitting out one location: the style's cost scaled by the city's cost of living. */
export const startupCost = (def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number => wholeDollars(def.styles[style].startup * cityNumbers(content, cityId).costOfLiving);

export const locationRent = (def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number => wholeDollars(def.styles[style].rent * cityNumbers(content, cityId).costOfLiving);

/** The workers one location needs at this staffing level. */
export function staffNeed(def: BusinessDef, style: BusinessStyle, level: StaffingLevel, content: ContentBundle): number {
  return Math.max(1, Math.round(def.styles[style].staff * content.balance.business.levels.staffing[level].mult));
}

/** Pay for one worker: the market wage, the pay level, their skill, a licence and any raises. */
export function wageOf(def: BusinessDef, style: BusinessStyle, cityId: Id, pay: PayLevel, skill: number, licensed: boolean, raise: number, content: ContentBundle, roleWage = 1): number {
  const b = content.balance.business;
  const base = marketWage(def, style, cityId, content) * b.levels.pay[pay].mult * (1 + b.staff.skillWage * (skill - 50)) * (licensed ? b.costs.licensedWage : roleWage) * raise;
  return wholeDollars(base);
}

export function managerWage(def: BusinessDef, style: BusinessStyle, cityId: Id, pay: PayLevel, skill: number, content: ContentBundle): number {
  return wholeDollars(wageOf(def, style, cityId, pay, skill, false, 1, content) * content.balance.business.costs.managerWage);
}

/** Customers a location of this style would draw with a fair name, in a city that fits it, at fair prices and no marketing, once it is established. */
export const baseDemand = (def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number => def.styles[style].demand * fitMult(def, style, cityId, content);

/** What a location's yearly revenue would be at its base demand and fair prices (marketing and quality spending are sized from it). */
export function nominalRevenue(def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number {
  return baseDemand(def, style, cityId, content) * def.styles[style].spend * priceScale(content, cityId);
}

export function maturityAt(yearsOpen: number, content: ContentBundle): number {
  const m = content.balance.business.demand.maturity;
  return m[Math.min(Math.max(0, yearsOpen), m.length - 1)]!;
}

export interface LocationInputs {
  def: BusinessDef;
  style: BusinessStyle;
  cityId: Id;
  /** Years the location has been open (0 in its first year). */
  yearsOpen: number;
  /** 0 for the first location of the business in this city, 1 for the next, and so on. */
  rank: number;
  reputation: number;
  quality: number;
  prices: PriceLevel;
  marketing: MarketingLevel;
  qualityInvest: QualityLevel;
  pay: PayLevel;
  staffing: StaffingLevel;
  /** The owner's or manager's skill (0–100) and the effort put in (0–1.5). */
  skill: number;
  effort: number;
  /** The named workers there (their pay is worked out by the caller) and the average skill of everyone. */
  named: { wage: number; skill: number }[];
  /** A year's luck (1 is an ordinary year) and the product of the shocks in force. */
  season: number;
  shock: number;
  /** False when the business needs a licence and nobody holds it. */
  licensed: boolean;
}

export interface LocationFigures {
  demand: number;
  customers: number;
  revenue: number;
  rent: number;
  wages: number;
  supplies: number;
  marketing: number;
  quality: number;
  other: number;
  profit: number;
  /** Workers there (named and crew), and the share of the need they meet. */
  workers: number;
  staffed: number;
  /** Average skill of the workers there. */
  skill: number;
}

/** A location's year, from demand to profit. */
export function locationFigures(i: LocationInputs, content: ContentBundle): LocationFigures {
  const b = content.balance.business;
  const st = i.def.styles[i.style];
  const lv = b.levels;
  const need = staffNeed(i.def, i.style, i.staffing, content);
  const crew = Math.max(0, need - i.named.length);
  const workers = i.named.length + crew;
  const namedSkill = i.named.reduce((s, n) => s + n.skill, 0);
  const avgSkill = workers > 0 ? (namedSkill + crew * 50) / workers : 50;
  const staffed = Math.min(1.25, workers / Math.max(1, i.def.styles[i.style].staff));

  // Demand.
  const rep = b.demand.reputation.base + (b.demand.reputation.slope * i.reputation) / 100;
  const qual = b.demand.quality.base + (b.demand.quality.slope * i.quality) / 100;
  const price = Math.pow(lv.price[i.prices].mult, -st.elasticity);
  const marketing = 1 + lv.marketing[i.marketing].boost;
  const skill = 1 + b.demand.skill * (i.skill - 50) * Math.min(1.2, i.effort);
  const saturation = Math.pow(b.demand.saturation, i.rank);
  const attention = b.demand.attention.floor + (1 - b.demand.attention.floor) * Math.min(1, i.effort);
  const demand = baseDemand(i.def, i.style, i.cityId, content) * rep * qual * price * marketing * skill * saturation * attention * maturityAt(i.yearsOpen, content) * i.season * i.shock * (i.licensed ? 1 : b.demand.unlicensed);

  // What the staff can serve.
  const capacity = st.capacity * Math.pow(Math.min(1.25, staffed), 0.85) * (0.85 + (0.3 * avgSkill) / 100) * Math.min(1, 0.4 + i.effort);
  const customers = Math.max(0, Math.min(demand, capacity));
  const revenue = customers * st.spend * lv.price[i.prices].mult * priceScale(content, i.cityId);

  const city = cityNumbers(content, i.cityId);
  const rent = st.rent * city.costOfLiving;
  const crewPay = marketWage(i.def, i.style, i.cityId, content) * b.costs.crewWage * lv.pay[i.pay].mult;
  const wages = i.named.reduce((s, n) => s + n.wage, 0) + crew * crewPay;
  const supplies = revenue * st.supplies * (1 + b.costs.waste * (50 - i.skill));
  const nominal = nominalRevenue(i.def, i.style, i.cityId, content);
  const marketingCost = nominal * lv.marketing[i.marketing].share;
  const qualityCost = nominal * lv.quality[i.qualityInvest].share;
  const other = revenue * b.costs.overheadShare + b.costs.overheadFixed * city.costOfLiving;
  const profit = revenue - rent - wages - supplies - marketingCost - qualityCost - other;
  return {
    demand: Math.round(demand),
    customers: Math.round(customers),
    revenue: wholeDollars(revenue),
    rent: wholeDollars(rent),
    wages: wholeDollars(wages),
    supplies: wholeDollars(supplies),
    marketing: wholeDollars(marketingCost),
    quality: wholeDollars(qualityCost),
    other: wholeDollars(other),
    profit: wholeDollars(profit),
    workers,
    staffed,
    skill: avgSkill,
  };
}

/** A typical year for one established location of this style in this city with this reputation and quality: what a listing is priced from. */
export function typicalLocation(def: BusinessDef, style: BusinessStyle, cityId: Id, reputation: number, quality: number, content: ContentBundle): LocationFigures {
  return locationFigures(
    {
      def,
      style,
      cityId,
      yearsOpen: 99,
      rank: 0,
      reputation,
      quality,
      prices: 'fair',
      marketing: 'none',
      qualityInvest: 'none',
      pay: 'fair',
      staffing: 'normal',
      skill: 50,
      effort: 1,
      named: [],
      season: 1,
      shock: 1,
      licensed: true,
    },
    content,
  );
}

/** Working capital a new business starts with: a share of one year's costs. */
export function workingCapital(def: BusinessDef, style: BusinessStyle, cityId: Id, content: ContentBundle): number {
  const t = typicalLocation(def, style, cityId, content.balance.business.reputation.start, def.styles[style].quality, content);
  return wholeDollars((t.rent + t.wages + t.supplies + t.other) * content.balance.business.cash.starting);
}

/** What a new business costs in all: fitting out, working capital, and (when a licensed worker has to be hired) the hiring cost. */
export function totalToStart(def: BusinessDef, style: BusinessStyle, cityId: Id, hireLicensed: boolean, content: ContentBundle): { fitOut: number; capital: number; hiring: number; total: number } {
  const fitOut = startupCost(def, style, cityId, content);
  const capital = workingCapital(def, style, cityId, content);
  const hiring = hireLicensed ? wholeDollars(wageOf(def, style, cityId, 'fair', 50, true, 1, content) * content.balance.business.staff.hiring) : 0;
  return { fitOut, capital, hiring, total: fitOut + capital + hiring };
}

/** The most a business can sell for before a broker: the profit multiple, plus fit-out, plus cash. */
export function valueFromEarnings(profit: number, assets: number, cash: number, content: ContentBundle, chain = false): number {
  const m = content.balance.business.market;
  const earned = Math.max(0, profit) * (chain ? m.chainMultiple : m.multiple);
  const floor = assets * m.floorShare + cash;
  return wholeDollars(Math.max(floor, earned + assets * m.assetShare + cash));
}

/** A business's profit for valuation: the average of its last years, or, in its first, what a typical year would bring blended in. */
export function earningsFor(b: Business, def: BusinessDef, content: ContentBundle): number {
  const keep = content.balance.business.market.history;
  const recent = b.profits.slice(-keep);
  if (recent.length >= keep) return recent.reduce((s, n) => s + n, 0) / recent.length;
  const typical = b.locations.reduce((s, l) => s + typicalLocation(def, l.style, l.cityId, b.reputation, b.quality, content).profit, 0);
  const known = recent.reduce((s, n) => s + n, 0);
  return (known + typical * (keep - recent.length)) / keep;
}

/** What a business is worth: its earnings priced, plus its fit-out and cash. */
export function valuation(b: Business, content: ContentBundle): number {
  const def = content.businesses[b.defId];
  if (!def) return 0;
  const m = content.balance.business.market;
  const earnings = earningsFor(b, def, content);
  // B2: royalties net of support are earnings too (franchises are valued on them).
  const net = (b.franchises ?? []).reduce((s, f) => s + f.royaltyPaid - f.support, 0);
  const typical = b.locations.reduce((s, l) => s + typicalLocation(def, l.style, l.cityId, b.reputation, b.quality, content).profit, 0) + Math.max(0, net);
  // A business is not priced above what a good year of its kind would earn it.
  const capped = Math.min(earnings, Math.max(0, typical) * m.maxMultiple);
  return valueFromEarnings(capped, b.assets + (b.stockValue ?? 0), b.cash, content, b.chainId !== undefined);
}

/** What selling brings after a quick-sale discount and the broker. */
export function salePrice(b: Business, content: ContentBundle): number {
  const m = content.balance.business.market.sale;
  return wholeDollars(valuation(b, content) * m.share * (1 - m.broker));
}
