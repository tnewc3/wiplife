/**
 * The `business` effect (W3): what an event's choice does to the business it
 * is about. Money moves through savings (so the screen shows the amount and
 * your new balance); everything else is a small change to the business, its
 * staff or its owners. The engine ignores what does not fit now.
 */
import type { BusinessEffect, ContentBundle } from '../../content/schemas';
import { earn, spend, wholeDollars } from '../finance';
import { clampInt } from '../random';
import type { Business, Id, LifeState } from '../types';
import { buyOut, closeBusiness, expandBlock, lineBlock, openLocation, sellBusiness, setLine, setOrder } from './found';
import { endFranchise } from './franchise';
import { itemOf, productById } from './products';
import { nominalRevenue } from './model';
import { businessById, castBusinessId } from './query';
import { appointManager, fireStaff, hireBlock, hireStaff, raiseStaff, removeStaff, transferBlock, transferStaff } from './staff';
import { scaledAmount } from '../country';

/** The business an effect acts on: the one the event is about, or the first you own. */
function target(state: LifeState, cast: Record<string, Id>): Business | undefined {
  return businessById(state, castBusinessId(cast)) ?? state.business.items[0];
}

/** What a year's revenue is (last year's report, or what a typical year would be before there is one). */
export function revenueOf(b: Business, content: ContentBundle): number {
  if (b.report) return b.report.revenue;
  const def = content.businesses[b.defId];
  return def ? b.locations.reduce((s, l) => s + nominalRevenue(def, l.style, l.cityId, content), 0) : 0;
}

export function applyBusinessEffect(state: LifeState, effect: BusinessEffect, cast: Record<string, Id>, content: ContentBundle): void {
  const b = target(state, cast);
  if (!b) return;
  const who = effect.role !== undefined ? cast[effect.role] : undefined;
  const staff = who !== undefined ? b.staff.find((s) => s.personId === who) : undefined;
  const year = state.currentYear;
  switch (effect.action) {
    case 'pay':
    case 'receive': {
      const amount = Math.max(scaledAmount(state, effect.floor ?? 300, content), wholeDollars(revenueOf(b, content) * (effect.share ?? 0.02)));
      if (effect.action === 'pay') spend(state, amount, content);
      else earn(state, amount);
      return;
    }
    case 'quality':
      b.quality = clampInt(b.quality + (effect.delta ?? 0), 0, 100);
      return;
    case 'reputation':
      b.reputation = clampInt(b.reputation + (effect.delta ?? 0), 0, 100);
      return;
    case 'morale':
      for (const s of b.staff) s.morale = clampInt(s.morale + (effect.delta ?? 0), 0, 100);
      b.morale = clampInt(b.morale + (effect.delta ?? 0), 0, 100);
      return;
    case 'buzz':
    case 'rival':
      b.shocks.push({ kind: effect.action, mult: 1 + (effect.delta ?? 0) / 100, until: year + (effect.years ?? 1) - 1 });
      if (b.shocks.length > 6) b.shocks.splice(0, b.shocks.length - 6);
      return;
    case 'staffQuit':
      if (staff) {
        removeStaff(state, b, staff.personId);
      }
      return;
    case 'staffFire':
      if (staff) fireStaff(state, b, staff.personId, content);
      return;
    case 'staffRaise':
      if (staff) raiseStaff(b, staff.personId, content);
      return;
    case 'staffMorale':
      if (staff) staff.morale = clampInt(staff.morale + (effect.delta ?? 0), 0, 100);
      return;
    case 'theft': {
      if (staff) {
        spend(state, Math.max(effect.floor ?? 300, wholeDollars(revenueOf(b, content) * (effect.share ?? 0.02))), content);
        state.relationships[staff.personId]?.memories.push({ tag: 'stole_from_your_business', year });
        removeStaff(state, b, staff.personId);
      }
      return;
    }
    case 'hire':
      if (who !== undefined && hireBlock(state, b, content.businesses[b.defId]!, { personId: who, locationId: b.locations[0]!.id }, content) === null) hireStaff(state, b, { personId: who, locationId: b.locations[0]!.id }, content);
      return;
    case 'buyout':
      if (who !== undefined) buyOut(state, b.id, who, content);
      return;
    case 'expand':
      if (expandBlock(state, { id: b.id, cityId: b.cityId, style: b.style, funding: 'savings' }, content) === null) openLocation(state, { id: b.id, cityId: b.cityId, style: b.style, funding: 'savings' }, content);
      return;
    case 'sell':
      sellBusiness(state, b.id, content);
      return;
    case 'close':
      closeBusiness(state, b.id, content);
      return;
    case 'audit':
      b.auditedYear = year;
      return;
    // B2: lines, suppliers, stock and the brand.
    case 'price':
    case 'order': {
      const def = content.businesses[b.defId];
      const productId = effect.product ?? b.focus?.productId ?? [...(b.report?.lines ?? [])].sort((x, y) => y.revenue - x.revenue)[0]?.productId ?? b.lines.find((l) => l.on)?.productId;
      const product = def && productId !== undefined ? productById(def, productId) : undefined;
      if (!def || !product || effect.level === undefined) return;
      if (effect.action === 'price') {
        if (lineBlock(state, b, def, product.id, undefined, content) === null) setLine(state, b.id, product.id, { price: effect.level as Business['prices'] }, content);
      } else {
        const item = itemOf(def, product);
        if (item) setOrder(state, b.id, item.id, effect.level as Business['orders'][string]);
      }
      return;
    }
    case 'supplier':
    case 'shortage': {
      const category = b.focus?.category ?? b.report?.supplierMoves?.[0]?.[0];
      if (category === undefined) return;
      const delta = effect.delta ?? 0;
      b.shocks = b.shocks.filter((x) => !(x.category === category && x.kind === (effect.action === 'supplier' ? 'deal' : 'shortage')));
      b.shocks.push({ kind: effect.action === 'supplier' ? 'deal' : 'shortage', mult: Math.min(effect.action === 'shortage' ? 1 : 5, Math.max(0.1, 1 + delta / 100)), until: year + (effect.years ?? 1) - 1, category });
      return;
    }
    case 'buyAhead': {
      const amount = Math.max(scaledAmount(state, effect.floor ?? 300, content), wholeDollars((b.report?.goodsCost ?? revenueOf(b, content) * 0.3) * (effect.share ?? 0.1)));
      if (state.finances.savings < amount) return;
      spend(state, amount, content);
      // The money goes into the business as stock: the shelves hold more next year, so less is ordered.
      const you = b.owners.find((o) => o.id === 'you');
      if (you) you.put += amount;
      b.stockValue += amount;
      const cover = effect.share ?? 0.1;
      for (const loc of b.locations) for (const id of Object.keys(loc.forecast)) loc.stock[id] = Math.round(((loc.stock[id] ?? 0) + loc.forecast[id]! * cover) * 100) / 100;
      return;
    }
    case 'writeOff': {
      const share = effect.share ?? 0;
      for (const loc of b.locations) for (const id of Object.keys(loc.stock)) loc.stock[id] = Math.round(loc.stock[id]! * (1 - share) * 100) / 100;
      b.stockValue = wholeDollars(b.stockValue * (1 - share));
      return;
    }
    case 'transfer': {
      const dest = staff ? b.locations.find((l) => l.id !== staff.locationId && transferBlock(state, b, staff.personId, l.id, content) === null) : undefined;
      if (staff && dest) transferStaff(state, b, staff.personId, dest.id, content);
      return;
    }
    case 'appoint': {
      const def = content.businesses[b.defId];
      if (staff && staff.locationId !== null && def) appointManager(state, b, def, staff.personId, staff.locationId, content);
      return;
    }
    case 'brand':
      for (const f of b.franchises) f.risk = clampInt(f.risk + (effect.delta ?? 0), 0, 100);
      return;
    case 'franchiseEnd': {
      const worst = [...b.franchises].sort((x, y) => y.risk - x.risk)[0];
      if (worst) endFranchise(state, b, worst.id, 'end', content);
      return;
    }
  }
}
