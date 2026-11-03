/**
 * Dealing (D1): a role in the Career hub for adults. You choose the drug you sell, your price and how much stock to buy for
 * resale; each year customers buy from your stock, you are paid in dirty money (E6a: it launders through the existing
 * fronts), heat rises with what you sell, and trouble can find you: a robbery, a rival, someone who talks. Customers come
 * with time and a name for fair dealing and go when the stock runs out. Story and consequences only: no methods.
 * Numbers: balance/drugs.yaml (dealing).
 */
import type { ContentBundle, DealPrice } from '../../content/schemas';
import { addDirty, addHeat, loseDirty } from '../crime/money';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { Id, LifeState } from '../types';
import { drugDef, isAdult, rollYear, tradeBlock, unitPrice, type TradeBlock } from './query';
import { dollarText, note, say, unitsText } from './text';
import { sourcesFor } from './market';

export type DealBlock = TradeBlock | 'drug' | 'on' | 'off' | 'supply' | 'stock';

export function startBlock(state: LifeState, drugId: Id, content: ContentBundle): DealBlock | null {
  const t = tradeBlock(state, content);
  if (t) return t;
  if (!drugDef(content, drugId)) return 'drug';
  if (state.drugs.dealing) return 'on';
  if (sourcesFor(state, drugId, content).length === 0 && (state.drugs.stock[drugId]?.units ?? 0) === 0) return 'supply';
  return null;
}

export function startDealing(state: LifeState, drugId: Id, content: ContentBundle): boolean {
  if (startBlock(state, drugId, content) !== null) return false;
  const b = content.balance.drugs.dealing;
  rollYear(state);
  state.drugs.dealing = { since: state.currentYear, drugId, customers: b.customers.start, price: 'fair', standing: 10, year: { year: state.currentYear, sold: 0, earned: 0, trouble: 0 } };
  const def = drugDef(content, drugId)!;
  say(state, 'dealingStarted', { drug: def.noun }, content);
  state.drugs.last = { action: 'deal', kind: 'started', drugId, amount: 0, balance: state.finances.savings, note: note('dealStarted', { drug: def.noun }, content) };
  return true;
}

export function stopBlock(state: LifeState): DealBlock | null {
  return state.drugs.dealing ? null : 'off';
}

export function stopDealing(state: LifeState, content: ContentBundle): boolean {
  if (!state.drugs.dealing) return false;
  state.drugs.dealing = null;
  say(state, 'dealingStopped', {}, content);
  state.drugs.last = { action: 'deal', kind: 'stopped', amount: 0, balance: state.finances.savings, note: note('dealStopped', {}, content) };
  return true;
}

export function setDealPrice(state: LifeState, price: DealPrice): boolean {
  const d = state.drugs.dealing;
  if (!d) return false;
  d.price = price;
  return true;
}

export function setDealDrug(state: LifeState, drugId: Id, content: ContentBundle): boolean {
  const d = state.drugs.dealing;
  if (!d || !drugDef(content, drugId)) return false;
  d.drugId = drugId;
  return true;
}

/** Units you could sell in a year at your customers and price. Reads only. */
export function demandFor(state: LifeState, content: ContentBundle): number {
  const d = state.drugs.dealing;
  if (!d) return 0;
  const b = content.balance.drugs.dealing;
  return Math.round(d.customers * b.customers.perUnit * b.demand[d.price]);
}

/** What one unit sells for at your price (a street price at the stock's quality). */
export function sellPrice(state: LifeState, content: ContentBundle): number {
  const d = state.drugs.dealing;
  if (!d) return 0;
  const def = drugDef(content, d.drugId);
  if (!def) return 0;
  const q = state.drugs.stock[d.drugId]?.quality ?? 50;
  return Math.max(1, Math.round(unitPrice(state, def, 'dealer', q, content) * content.balance.drugs.dealing.prices[d.price]));
}

export type WholesaleBlock = TradeBlock | 'none';

export function wholesaleBlock(state: LifeState, drugId: Id, content: ContentBundle): WholesaleBlock | null {
  const t = tradeBlock(state, content);
  if (t) return t;
  return (state.drugs.stock[drugId]?.units ?? 0) > 0 ? null : 'none';
}

/** You sell all you hold of a drug on at wholesale (a share of the street price), for dirty money. The product has to go somewhere. */
export function sellWholesale(state: LifeState, drugId: Id, content: ContentBundle): boolean {
  if (wholesaleBlock(state, drugId, content) !== null) return false;
  const def = drugDef(content, drugId)!;
  const stock = state.drugs.stock[drugId]!;
  const per = Math.max(1, Math.round(unitPrice(state, def, 'dealer', stock.quality, content) * content.balance.drugs.production.wholesale));
  const amount = per * stock.units;
  const units = stock.units;
  delete state.drugs.stock[drugId];
  addDirty(state, amount);
  addHeat(state, content.balance.drugs.buy.heatResale);
  state.drugs.totals.sold += units;
  state.drugs.totals.earned += amount;
  state.drugs.last = { action: 'deal', kind: 'wholesale', drugId, units, amount: -amount, balance: state.finances.savings, note: `${unitsText(units, def)} sold on for ${dollarText(state, amount, content)} (dirty money).` };
  say(state, 'dealingYear', { units: unitsText(units, def), amount: dollarText(state, amount, content) }, content);
  return true;
}

export interface DealYear {
  sold: number;
  trouble: 'robbery' | 'rival' | 'snitch' | null;
}

/** The dealing year: sales from stock, dirty money, heat, customers, standing and trouble. Draws from the life's generator. */
export function dealingYear(state: LifeState, content: ContentBundle): DealYear {
  const d = state.drugs.dealing;
  const out: DealYear = { sold: 0, trouble: null };
  if (!d) return out;
  if (!isAdult(state, content) || isIncarcerated(state)) {
    state.drugs.dealing = null;
    return out;
  }
  const b = content.balance.drugs.dealing;
  const def = drugDef(content, d.drugId);
  if (!def) {
    state.drugs.dealing = null;
    return out;
  }
  const stock = state.drugs.stock[d.drugId];
  const demand = demandFor(state, content);
  const sold = Math.min(stock?.units ?? 0, demand);
  const short = demand - sold;
  let earned = 0;
  if (sold > 0 && stock) {
    earned = sold * sellPrice(state, content);
    stock.units -= sold;
    if (stock.units <= 0) delete state.drugs.stock[d.drugId];
    addDirty(state, earned);
  }
  out.sold = sold;
  state.drugs.totals.sold += sold;
  state.drugs.totals.earned += earned;
  d.year = { year: state.currentYear, sold, earned, trouble: 0 };

  // Heat grows with what moves, and with high prices.
  addHeat(state, Math.round(b.heat.base * (sold > 0 ? 1 : 0.25) + (sold / 10) * b.heat.perTenUnits + (d.price === 'high' ? b.heat.high : 0)));

  // Customers: fair dealing and stock bring more; a dry year loses some.
  const c = b.customers;
  if (sold >= demand * 0.7) d.customers = clampInt(d.customers + Math.max(1, Math.round(d.customers * c.growth * (0.5 + d.standing / 100))), 0, c.max);
  else d.customers = clampInt(d.customers - Math.round(d.customers * c.loss * (short > 0 ? 1 : 0)), 0, c.max);

  // Trouble.
  const t = b.trouble;
  const heatMult = 1 + state.crime.heat / 100;
  if (sold > 0 && chance(state.rng, t.robbery * heatMult)) out.trouble = 'robbery';
  else if (sold > 0 && chance(state.rng, t.rival * heatMult)) out.trouble = 'rival';
  else if (sold > 0 && chance(state.rng, t.snitch * heatMult)) out.trouble = 'snitch';
  if (out.trouble) {
    d.year.trouble = 1;
    d.standing = clampInt(d.standing - b.standing.loss, 0, 100);
    if (out.trouble === 'robbery') loseDirty(state, Math.ceil(state.finances.dirty * 0.3));
    say(state, 'dealingTrouble', {}, content);
  } else {
    d.standing = clampInt(d.standing + (sold > 0 ? b.standing.perYear : 0), 0, 100);
  }
  const stats = state.character.stats;
  stats.stress = clampInt(Math.round(stats.stress + b.stress), 0, 100);
  state.character.personality.kindness = clampInt(Math.round((state.character.personality.kindness - b.kindness) * 10) / 10, 0, 100);
  if (sold > 0) say(state, 'dealingYear', { units: unitsText(sold, def), amount: dollarText(state, earned, content) }, content);
  return out;
}
