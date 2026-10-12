/**
 * The "For sale" market (W3): the established businesses and fictional chains
 * for sale in each city, made from the life's seed, the city and the market
 * round (so they are the same whenever they are asked for), priced from what
 * they earn the way a year of trading is worked out (./model.ts). A listing you
 * buy is recorded in `business.taken` for the round.
 */
import type { BusinessDef, BusinessStyle, ChainDef, ContentBundle } from '../../content/schemas';
import { clampInt, rollScore, weightedPick } from '../random';
import { createRng, nextFloat, nextInt, pick } from '../rng';
import type { Id, LifeState } from '../types';
import { startupCost, typicalLocation, workingCapital } from './model';

export interface ListingLocation {
  cityId: Id;
  style: BusinessStyle;
}

export interface Listing {
  /** m_<city>_<round>_<n> */
  id: string;
  kind: 'business' | 'chain';
  defId: Id;
  style: BusinessStyle;
  name: string;
  /** The city it is for sale in (its first location). */
  cityId: Id;
  chainId?: Id;
  /** Years it has been running. */
  years: number;
  reputation: number;
  quality: number;
  /** What is notable about it, in words (from registries/business.yaml listingTraits). */
  trait: string;
  traitId: Id;
  locations: ListingLocation[];
  /** A typical year's profit and revenue, whole dollars; the price follows from the profit. */
  profit: number;
  revenue: number;
  assets: number;
  cash: number;
  price: number;
  /** Workers it has now (all locations). */
  staff: number;
}

/** The market round a year falls in. */
export const marketRound = (year: number, content: ContentBundle): number => Math.floor(year / content.balance.business.market.refreshYears);

const LISTING_ID = /^m_(.+)_(\d+)_(\d+)$/;

/** Parses a listing id into its city, round and number (null when it is not one). */
export function parseListingId(id: string, content: ContentBundle): { cityId: Id; round: number; n: number } | null {
  const m = LISTING_ID.exec(id);
  if (!m || content.cities[m[1]!] === undefined) return null;
  return { cityId: m[1]!, round: Number(m[2]), n: Number(m[3]) };
}

function activeDefs(content: ContentBundle): BusinessDef[] {
  return Object.keys(content.businesses)
    .sort()
    .map((id) => content.businesses[id]!)
    .filter((d) => !d.retired);
}

const STYLE_WEIGHTS: Record<BusinessStyle, number> = { budget: 4, standard: 5, premium: 1.5 };

function priceOf(profit: number, assets: number, cash: number, multiple: number, content: ContentBundle): number {
  const m = content.balance.business.market;
  const earned = Math.max(0, profit) * multiple;
  return Math.round(Math.max(assets * m.floorShare + cash, earned + assets * m.assetShare + cash));
}

function chainListing(id: string, chain: ChainDef, cityId: Id, rng: ReturnType<typeof createRng>, content: ContentBundle, trait: { id: string; text: string; quality: number; reputation: number; earnings: number }): Listing | null {
  const def = content.businesses[chain.type];
  if (!def || def.retired) return null;
  const m = content.balance.business.market;
  const n = nextInt(rng, chain.locations.min, Math.max(chain.locations.min, chain.locations.max));
  const locations: ListingLocation[] = Array.from({ length: n }, (_, i) => ({ cityId: chain.cities[i % chain.cities.length]!, style: chain.style }));
  const reputation = clampInt(rollScore(rng, chain.reputation) + trait.reputation, 0, 100);
  const quality = clampInt(def.styles[chain.style].quality + nextInt(rng, -4, 8) + trait.quality, 0, 100);
  let profit = 0;
  let revenue = 0;
  let assets = 0;
  let cash = 0;
  let staff = 0;
  for (const l of locations) {
    const t = typicalLocation(def, l.style, l.cityId, reputation, quality, content);
    profit += t.profit;
    revenue += t.revenue;
    staff += t.workers;
    assets += startupCost(def, l.style, l.cityId, content) * 0.6;
    cash += workingCapital(def, l.style, l.cityId, content) * 0.5;
  }
  profit = Math.round(profit * trait.earnings * (0.9 + nextFloat(rng) * 0.2));
  assets = Math.round(assets);
  cash = Math.round(cash);
  return {
    id,
    kind: 'chain',
    defId: def.id,
    style: chain.style,
    name: chain.name,
    cityId,
    chainId: chain.id,
    years: nextInt(rng, m.ages.min + 3, m.ages.max + 8),
    reputation,
    quality,
    trait: trait.text,
    traitId: trait.id,
    locations,
    profit,
    revenue: Math.round(revenue),
    assets,
    cash,
    price: priceOf(profit, assets, cash, m.chainMultiple, content),
    staff,
  };
}

/** The listings for sale in a city this round (taken ones left out). */
export function marketFor(state: LifeState, cityId: Id, content: ContentBundle): Listing[] {
  const round = marketRound(state.currentYear, content);
  const rng = createRng(`${state.seed}:market:${cityId}:${round}`);
  const m = content.balance.business.market;
  const traits = Object.keys(content.registries.business.listingTraits)
    .sort()
    .map((id) => ({ id, ...content.registries.business.listingTraits[id]! }));
  const rollTrait = () => weightedPick(rng, traits.map((t) => [t, t.weight] as const));
  const out: Listing[] = [];
  const defs = activeDefs(content);
  const used = new Set<string>();
  const count = nextInt(rng, m.listings.min, Math.max(m.listings.min, m.listings.max));
  let n = 1;
  for (let i = 0; i < count; i++) {
    const def = pick(rng, defs);
    const styles = (Object.keys(STYLE_WEIGHTS) as BusinessStyle[]).map((s) => [s, STYLE_WEIGHTS[s]] as const);
    const style = weightedPick(rng, styles);
    const names = def.names.filter((x) => !used.has(x));
    const name = (names.length > 0 ? pick(rng, names) : `${pick(rng, def.names)} II`);
    used.add(name);
    const trait = rollTrait();
    const reputation = clampInt(rollScore(rng, m.reputation) + trait.reputation, 0, 100);
    const quality = clampInt(rollScore(rng, m.quality) + trait.quality, 0, 100);
    const t = typicalLocation(def, style, cityId, reputation, quality, content);
    const profit = Math.round(t.profit * trait.earnings * (0.85 + nextFloat(rng) * 0.3));
    const assets = Math.round(startupCost(def, style, cityId, content) * (0.35 + nextFloat(rng) * 0.4));
    const cash = Math.round(workingCapital(def, style, cityId, content) * (0.3 + nextFloat(rng) * 0.5));
    out.push({
      id: `m_${cityId}_${round}_${n++}`,
      kind: 'business',
      defId: def.id,
      style,
      name,
      cityId,
      years: nextInt(rng, m.ages.min, m.ages.max),
      reputation,
      quality,
      trait: trait.text,
      traitId: trait.id,
      locations: [{ cityId, style }],
      profit,
      revenue: t.revenue,
      assets,
      cash,
      price: priceOf(profit, assets, cash, m.multiple, content),
      staff: t.workers,
    });
  }
  for (const id of Object.keys(content.chains).sort()) {
    const chain = content.chains[id]!;
    if (chain.retired || chain.cities[0] !== cityId || nextFloat(rng) >= m.chainChance) continue;
    const trait = rollTrait();
    const listing = chainListing(`m_${cityId}_${round}_${n++}`, chain, cityId, rng, content, { id: trait.id, text: trait.text, quality: trait.quality, reputation: trait.reputation, earnings: trait.earnings });
    if (listing) out.push(listing);
  }
  return out.filter((l) => !state.business.taken.includes(l.id));
}

/** One listing by id, if it is for sale this round. */
export function listingById(state: LifeState, id: string, content: ContentBundle): Listing | undefined {
  const parsed = parseListingId(id, content);
  if (!parsed || parsed.round !== marketRound(state.currentYear, content)) return undefined;
  return marketFor(state, parsed.cityId, content).find((l) => l.id === id);
}

/** What a listing would cost you to run from the first day: its price (the cash it holds is part of it). */
export const listingPrice = (l: Listing): number => l.price;
