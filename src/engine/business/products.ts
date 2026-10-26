/**
 * Product lines and stock (B2). A kind of business sells lines (goods off a
 * shelf, or services that draw on a supply pool); every line and pool is a
 * stock item, ordered once a year against a forecast of last year's demand.
 * The arithmetic of one stock item for one year lives here, and is the same
 * for goods and services. Numbers: balance/business.yaml (products).
 */
import type { BusinessDef, BusinessStyle, ContentBundle, OrderLevel, PoolDef, ProductDef } from '../../content/schemas';
import type { Business, BusinessLine } from '../types';
import { priceScale } from './model';

/** The lines of a kind that are sold in a style. */
export const productsOf = (def: BusinessDef, style: BusinessStyle): ProductDef[] => def.products.filter((p) => p.styles === undefined || p.styles.includes(style));

/** The lines a business of this style starts with: the menu or the services, or a shop's starter lines up to the style's limit. */
export function defaultLineIds(def: BusinessDef, style: BusinessStyle, content: ContentBundle): string[] {
  const list = productsOf(def, style);
  if (def.lineMode === 'choose') return list.filter((p) => p.start === true || p.core === true).slice(0, content.balance.business.products.maxLines[style]).map((p) => p.id);
  return list.filter((p) => p.core === true).map((p) => p.id);
}

/** Every line of the kind, on or off as a new business of this style starts them, at the going rate. */
export function defaultLines(def: BusinessDef, style: BusinessStyle, content: ContentBundle): BusinessLine[] {
  const on = new Set(defaultLineIds(def, style, content));
  return def.products.map((p) => ({ productId: p.id, on: on.has(p.id), price: 'fair' }));
}

/** The weight of a style's default lines together (a line's share of spend is its weight over this). */
export function baseShare(def: BusinessDef, style: BusinessStyle, content: ContentBundle): number {
  const ids = new Set(defaultLineIds(def, style, content));
  const total = productsOf(def, style).filter((p) => ids.has(p.id)).reduce((s, p) => s + p.share, 0);
  return Math.max(0.0001, total);
}

export const productById = (def: BusinessDef, id: string): ProductDef | undefined => def.products.find((p) => p.id === id);
export const poolById = (def: BusinessDef, id: string): PoolDef | undefined => def.pools.find((p) => p.id === id);

/** The lines a business sells at a location of this style: on, and sold in the style. */
export function activeLines(b: Pick<Business, 'lines'>, def: BusinessDef, style: BusinessStyle): { product: ProductDef; line: BusinessLine }[] {
  const out: { product: ProductDef; line: BusinessLine }[] = [];
  for (const line of b.lines) {
    if (!line.on) continue;
    const product = productById(def, line.productId);
    if (product && (product.styles === undefined || product.styles.includes(style))) out.push({ product, line });
  }
  return out;
}

/** A stock item is a goods line (its own id) or a service's supply pool. */
export interface StockItem {
  id: string;
  category: string;
  perishable: number;
}

export function itemOf(def: BusinessDef, p: ProductDef): StockItem | null {
  if (p.type === 'goods') return p.supplier !== undefined ? { id: p.id, category: p.supplier, perishable: p.perishable } : null;
  const pool = p.pool ? poolById(def, p.pool.id) : undefined;
  return pool ? { id: pool.id, category: pool.supplier, perishable: pool.perishable } : null;
}

/** The unit cost of a stock item at the national average of supplier prices, in a city (before the supplier index and any deal). */
export function baseUnitCost(def: BusinessDef, style: BusinessStyle, p: ProductDef, cityId: string, content: ContentBundle): number {
  const st = def.styles[style];
  const scale = priceScale(content, cityId);
  if (p.type === 'goods') return st.spend * p.price * p.costShare * st.costScale * scale;
  const pool = p.pool ? poolById(def, p.pool.id) : undefined;
  return pool ? st.spend * pool.cost * st.costScale * scale : 0;
}

/** Supply units a service job uses (1 for goods). */
export const unitsPerSale = (p: ProductDef): number => (p.type === 'service' && p.pool ? p.pool.units : 1);

/** The unit cost of a pool or goods stock item as the share of the line's fair price (service: units × pool cost ÷ price). */
export function effectiveCostShare(def: BusinessDef, p: ProductDef): number {
  if (p.type === 'goods') return p.costShare;
  const pool = p.pool ? poolById(def, p.pool.id) : undefined;
  return pool && p.pool ? (p.pool.units * pool.cost) / p.price : 0;
}

export interface ItemYear {
  ordered: number;
  arrived: number;
  available: number;
}

/** What is ordered and what arrives for a stock item: the forecast scaled by the order level, less what is carried in, with any shortage. */
export function orderFor(forecast: number, carried: number, level: OrderLevel, supply: number, content: ContentBundle): ItemYear {
  const cover = content.balance.business.products.cover[level];
  const ordered = Math.max(0, forecast * cover - carried);
  const arrived = ordered * supply;
  return { ordered, arrived, available: carried + arrived };
}

export interface ItemEnd {
  sold: number;
  lost: number;
  leftover: number;
  spoiled: number;
  carry: number;
}

/**
 * The end of a year for a stock item: what was used, what was lost for want of
 * it, what spoiled and what is carried to the next year. Perishables: the
 * leftover spoils at the item's rate, plus a floor of waste on what arrived.
 */
export function itemEnd(used: number, wanted: number, available: number, arrived: number, perishable: number, content: ContentBundle): ItemEnd {
  const sold = Math.min(used, available);
  const leftover = available - sold;
  const floor = arrived * content.balance.business.products.wasteFloor * perishable;
  const spoiled = perishable > 0 ? Math.min(leftover, leftover * perishable + floor) : 0;
  return { sold, lost: Math.max(0, wanted - sold), leftover, spoiled, carry: leftover - spoiled };
}

/** The units of each stock item that `customers` a year would want at the default lines and fair prices (a saved business's first forecast). */
export function forecastFromCustomers(def: BusinessDef, style: BusinessStyle, customers: number, content: ContentBundle): Record<string, number> {
  const base = baseShare(def, style, content);
  const out: Record<string, number> = {};
  for (const id of defaultLineIds(def, style, content)) {
    const p = productById(def, id);
    const item = p ? itemOf(def, p) : null;
    if (!p || !item) continue;
    out[item.id] = Math.round(((out[item.id] ?? 0) + (customers * (p.share / base) * unitsPerSale(p)) / p.price) * 100) / 100;
  }
  return out;
}

/** How exposed to a crowded city the style's default lines are on the whole (their share-weighted competition value). */
export function meanCompetition(def: BusinessDef, style: BusinessStyle, content: ContentBundle): number {
  const ids = new Set(defaultLineIds(def, style, content));
  const lines = productsOf(def, style).filter((p) => ids.has(p.id));
  const total = lines.reduce((s, p) => s + p.share, 0);
  return total > 0 ? lines.reduce((s, p) => s + p.share * p.competition, 0) / total : 1;
}
