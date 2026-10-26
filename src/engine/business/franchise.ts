/**
 * Franchising out (B2): a business that has earned it licenses its name to a
 * franchisee in a city. A franchise is not a location you run: it pays a
 * one-off fee and a yearly royalty (a share of its revenue) and costs the brand
 * support, and it is simulated in aggregate (the location maths with a standard
 * crew and the franchisee's skill). A franchisee that does badly puts the name
 * at risk: brand risk is stored on the franchise, moved by how it is run and by
 * events. Franchising in (taking a franchise from a chain) is not built.
 * Numbers: balance/business.yaml (franchise).
 */
import type { BusinessDef, BusinessStyle, ContentBundle } from '../../content/schemas';
import { spend, wholeDollars } from '../finance';
import { ageOf } from '../relationships';
import { clampInt, rollScore } from '../random';
import type { RngState } from '../rng';
import type { Business, Franchise, Id, LifeState } from '../types';
import { locationFigures, nominalRevenue, startupCost } from './model';
import { staffIds } from './query';

export type FranchiseBlock = 'unknown' | 'years' | 'locations' | 'quality' | 'reputation' | 'recent' | 'full' | 'city' | 'person' | 'royalty' | 'style' | 'away';

/** The conditions to sell franchises, each with whether it is met (for the screen to say in words). */
export function franchiseConditions(b: Business, state: LifeState, content: ContentBundle): { key: 'years' | 'locations' | 'quality' | 'reputation' | 'recent'; met: boolean; need: number; have: number }[] {
  const f = content.balance.business.franchise;
  const years = state.currentYear - b.founded;
  const recent = b.profits.slice(-f.cleanYears);
  const clean = f.cleanYears === 0 || (recent.length >= f.cleanYears && recent.every((p) => p > 0));
  return [
    { key: 'years', met: years >= f.minYears, need: f.minYears, have: years },
    { key: 'locations', met: b.locations.length >= f.minLocations, need: f.minLocations, have: b.locations.length },
    { key: 'quality', met: b.quality >= f.minQuality, need: f.minQuality, have: b.quality },
    { key: 'reputation', met: b.reputation >= f.minReputation, need: f.minReputation, have: b.reputation },
    { key: 'recent', met: clean, need: f.cleanYears, have: clean ? f.cleanYears : recent.filter((p) => p > 0).length },
  ];
}

/** True when the business can sell franchises now. */
export function franchiseEligible(b: Business, state: LifeState, content: ContentBundle): boolean {
  return franchiseConditions(b, state, content).every((c) => c.met) && b.franchises.length < content.balance.business.limits.franchises;
}

/** The one-off fee: the style's fit-out in the city, scaled by how well the name stands. */
export function franchiseFee(def: BusinessDef, style: BusinessStyle, cityId: Id, b: Business, content: ContentBundle): number {
  return wholeDollars(startupCost(def, style, cityId, content) * content.balance.business.franchise.feeMultiple * (0.6 + (0.8 * b.reputation) / 100));
}

/** People you know who could run a franchise in a city: adults who live there and are free. */
export function franchiseeCandidates(state: LifeState, b: Business, cityId: Id, content: ContentBundle): { personId: Id; name: string; age: number; affection: number }[] {
  const taken = new Set([...staffIds(state), ...b.owners.map((o) => o.id), ...state.business.items.flatMap((x) => x.franchises.flatMap((f) => (f.personId !== null ? [f.personId] : [])))]);
  return Object.keys(state.relationships)
    .sort((a, c) => a.localeCompare(c, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const p = state.people[id];
      if (!p || !p.alive || rel.status !== 'active' || taken.has(id) || p.cityId !== cityId) return [];
      if (rel.kind === 'teacher' || rel.kind === 'parent' || rel.kind === 'grandparent') return [];
      const age = ageOf(state, p);
      if (age < content.balance.business.franchise.minAge || age > 65 || rel.affection < content.balance.business.staff.pool.minAffection) return [];
      return [{ personId: id, name: `${p.name.first} ${p.name.last}`, age, affection: rel.affection }];
    });
}

export interface SellFranchise {
  businessId: Id;
  cityId: Id;
  style: BusinessStyle;
  /** One of the royalty rates in balance (a rate, not free text). */
  royalty: number;
  personId?: Id;
}

export function sellBlock(state: LifeState, b: Business, p: SellFranchise, content: ContentBundle): FranchiseBlock | null {
  const bal = content.balance.business;
  const def = content.businesses[b.defId];
  if (!def) return 'unknown';
  if (state.housing.kind === 'incarcerated') return 'away';
  for (const c of franchiseConditions(b, state, content)) if (!c.met) return c.key;
  if (b.franchises.length >= bal.limits.franchises) return 'full';
  if (!content.cities[p.cityId]) return 'city';
  if (!bal.franchise.royalties.includes(p.royalty)) return 'royalty';
  if (!(['budget', 'standard', 'premium'] as const).includes(p.style)) return 'style';
  if (p.personId !== undefined && !franchiseeCandidates(state, b, p.cityId, content).some((c) => c.personId === p.personId)) return 'person';
  return null;
}

/** Sells a franchise: the fee goes into the business, and the franchisee opens. Returns its id. */
export function sellFranchise(state: LifeState, b: Business, p: SellFranchise, rng: RngState, content: ContentBundle): Id | null {
  if (sellBlock(state, b, p, content) !== null) return null;
  const def = content.businesses[b.defId]!;
  const bal = content.balance.business.franchise;
  const person = p.personId !== undefined ? state.people[p.personId] : undefined;
  const skill = person ? clampInt(bal.skill.mean + (person.smarts - 50) * 0.4 + (state.relationships[p.personId!]?.affection ?? 50) * 0.05 - 2, 5, 100) : clampInt(rollScore(rng, bal.skill), 5, 100);
  const fee = franchiseFee(def, p.style, p.cityId, b, content);
  const f: Franchise = {
    id: `f${state.business.nextLocation++}`,
    cityId: p.cityId,
    style: p.style,
    personId: p.personId ?? null,
    skill,
    since: state.currentYear,
    fee,
    royalty: p.royalty,
    revenue: 0,
    royaltyPaid: 0,
    support: 0,
    profit: 0,
    lossYears: 0,
    risk: clampInt(Math.round((50 - skill) * 0.5 + 10), 0, 100),
  };
  b.franchises.push(f);
  b.cash += fee;
  if (p.personId !== undefined) state.relationships[p.personId]?.memories.push({ tag: 'franchised_from_you', year: state.currentYear });
  return f.id;
}

/** Ends a franchise. Bought back, the franchisee is paid a year's royalty and the name is not hurt; otherwise the name pays a little. */
export function endFranchise(state: LifeState, b: Business, id: Id, how: 'end' | 'buyback', content: ContentBundle): boolean {
  const f = b.franchises.find((x) => x.id === id);
  if (!f) return false;
  const bal = content.balance.business.franchise;
  if (how === 'buyback') {
    const price = Math.max(wholeDollars(f.royaltyPaid * 1), wholeDollars(f.fee * 0.25));
    if (state.finances.savings < price) return false;
    spend(state, price, content);
  } else {
    b.reputation = clampInt(b.reputation - bal.risk.reputation * (f.risk / 100), 0, 100);
  }
  b.franchises = b.franchises.filter((x) => x.id !== id);
  const rel = f.personId !== null ? state.relationships[f.personId] : undefined;
  if (rel) rel.memories.push({ tag: how === 'buyback' ? 'bought_back_your_franchise' : 'lost_your_franchise', year: state.currentYear });
  return true;
}

/** What a franchise returns the business a year: the royalty less the support. */
export const netRoyalty = (f: Franchise): number => f.royaltyPaid - f.support;

export interface FranchiseYear {
  royalties: number;
  support: number;
  exits: { id: Id; cityId: Id; personId: Id | null }[];
  /** Risk-driven loss to the business's name this year (points). */
  dragReputation: number;
  dragQuality: number;
}

/** A year for every franchise: revenue, royalty, support, the franchisee's own result, brand risk, and exits. */
export function stepFranchises(state: LifeState, b: Business, def: BusinessDef, season: number, content: ContentBundle): FranchiseYear {
  const bal = content.balance.business;
  const fr = bal.franchise;
  const out: FranchiseYear = { royalties: 0, support: 0, exits: [], dragReputation: 0, dragQuality: 0 };
  for (const f of [...b.franchises]) {
    const alive = f.personId === null || state.people[f.personId]?.alive === true;
    const fig = locationFigures(
      { def, style: f.style, cityId: f.cityId, yearsOpen: state.currentYear - f.since, rank: 0, reputation: b.reputation, quality: b.quality, prices: 'fair', marketing: 'none', qualityInvest: 'none', pay: 'fair', staffing: 'normal', skill: f.skill, effort: alive ? 1 : 0.5, named: [], season, shock: 1, licensed: true },
      content,
    );
    f.revenue = fig.revenue;
    f.royaltyPaid = wholeDollars(fig.revenue * f.royalty);
    f.support = wholeDollars(nominalRevenue(def, f.style, f.cityId, content) * fr.support);
    f.profit = fig.profit - f.royaltyPaid;
    f.lossYears = f.profit < 0 ? f.lossYears + 1 : 0;
    f.risk = clampInt(Math.round(f.risk + fr.risk.perSkill * (50 - f.skill) + (f.profit < 0 ? 3 : 0) - fr.risk.recovery * 0.25), 0, 100);
    out.royalties += f.royaltyPaid;
    out.support += f.support;
    if (f.risk > fr.risk.line) {
      out.dragReputation += (fr.risk.reputation * (f.risk - fr.risk.line)) / 50;
      out.dragQuality += (fr.risk.quality * (f.risk - fr.risk.line)) / 50;
    }
    if (f.lossYears >= fr.exitYears) {
      out.exits.push({ id: f.id, cityId: f.cityId, personId: f.personId });
      b.franchises = b.franchises.filter((x) => x.id !== f.id);
      out.dragReputation += fr.risk.failure / 10;
      const rel = f.personId !== null ? state.relationships[f.personId] : undefined;
      if (rel) rel.memories.push({ tag: 'lost_your_franchise', year: state.currentYear });
    }
  }
  return out;
}

/** The share of a franchise's brand risk the worst one carries (for conditions and the screen). */
export const topRisk = (b: Business): number => b.franchises.reduce((m, f) => Math.max(m, f.risk), 0);

