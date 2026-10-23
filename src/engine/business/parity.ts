/**
 * The baseline (B2): a location trading the way W3's single dials did (the default lines, fair prices, normal orders, a
 * neutral world, the preset headcount) must make the revenue and supplies W3's maths gives. The content build checks it for
 * every kind and style; a test checks it for every city.
 */
import type { BusinessDef, BusinessStyle, ContentBundle } from '../../content/schemas';
import { crewRoles, needs, presetHeads, roleById } from './headcount';
import { locationFigures, marketWage } from './model';
import { defaultLineIds, productsOf } from './products';
import { tradeLocation, type LocationTrade } from './trade';
import type { LocationFigures } from './model';

export interface Parity {
  w3: LocationFigures;
  now: LocationTrade;
  revenue: number;
  supplies: number;
  customers: number;
  staffed: number;
}

/** The default lines trading for `years` years in the reference world, beside W3's maths for the same place. */
export function parityFigures(def: BusinessDef, style: BusinessStyle, cityId: string, content: ContentBundle, years = 8): Parity {
  const ids = new Set(defaultLineIds(def, style, content));
  const lines = productsOf(def, style)
    .filter((p) => ids.has(p.id))
    .map((product) => ({ product, price: 'fair' as const }));
  const heads = presetHeads(def, style, 'normal', content);
  const need = needs(def, style, content);
  const slots = crewRoles(def).map((r) => ({ roleId: r.id, weight: r.weight, need: need[r.id] ?? 0, count: heads[r.id] ?? 0, skillSum: (heads[r.id] ?? 0) * 50 }));
  const wages = slots.reduce((s, x) => s + x.count * marketWage(def, style, cityId, content) * content.balance.business.costs.crewWage * (roleById(def, x.roleId)?.wage ?? 1), 0);
  let stock: Record<string, number> = {};
  let forecast: Record<string, number> = {};
  let now!: LocationTrade;
  const quality = def.styles[style].quality;
  for (let y = 0; y < years; y++) {
    now = tradeLocation({ def, style, cityId, yearsOpen: 99, rank: 0, reputation: 50, quality, marketing: 'none', qualityInvest: 'none', pay: 'fair', skill: 50, effort: 1, season: 1, shock: 1, licensed: true, lines, stock, forecast, orders: {}, slots, wages, deals: {}, supply: {}, seed: 'parity', year: 2000 + y, neutral: true }, content);
    stock = now.nextStock;
    forecast = now.nextForecast;
  }
  const w3 = locationFigures({ def, style, cityId, yearsOpen: 99, rank: 0, reputation: 50, quality, prices: 'fair', marketing: 'none', qualityInvest: 'none', pay: 'fair', staffing: 'normal', skill: 50, effort: 1, named: [], season: 1, shock: 1, licensed: true }, content);
  return { w3, now, revenue: now.revenue / w3.revenue, supplies: now.supplies / w3.supplies, customers: now.customers / w3.customers, staffed: now.staffed };
}
