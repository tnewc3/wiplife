/**
 * Starting, buying, changing and ending a business (W3). Every action is
 * checked by a `...Block` function (the screen and the action rules agree) and
 * then carried out; money goes through the finance module (savings, the debt
 * system), and what happens to the other owners, the staff and the debts when
 * a business ends is worked out in one place (`endBusiness`).
 */
import { BUSINESS_ROLE, BUSINESS_STYLES, MARKETING_LEVELS, OWNER_ROLES, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, type BusinessDef, type BusinessStyle, type ContentBundle, type EventDef } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import { addDebt, earn, spend, wholeDollars } from '../finance';
import { clampInt, weightedPick } from '../random';
import { writeFromGroup } from '../systems/history';
import type { Business, BusinessLocation, BusinessPast, Id, LifeState } from '../types';
import { applyFunding, checkFunding, type FundingBlock, type FundingPlan } from './funding';
import { listingById } from './market';
import { salePrice, startupCost, totalToStart, valuation, workingCapital } from './model';
import { refreshWorth } from './value';
import { businessById, loanBalance, livingStaff, managerOf, youHoldLicense } from './query';
import { hireStaff, hiringCost, removeStaff } from './staff';

type HistoryKey = keyof ContentBundle['text']['business']['history'];
function history(state: LifeState, key: HistoryKey, values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.business.history[key], ['business', key], { values }, content);
}

/** Queues one of a trigger's events for a business (picked by weight among those that fit now), unless one of the trigger is already waiting. */
export function queueBusinessEvent(state: LifeState, trigger: keyof ContentBundle['registries']['business']['triggers'], businessId: Id, content: ContentBundle, due: 'now' | 'next' = 'now'): boolean {
  const ids = content.registries.business.triggers[trigger].events;
  // (A failed business is no longer there to be about: its events are about what is left.)
  const cast: Record<string, Id> = businessById(state, businessId) ? { [BUSINESS_ROLE]: businessId } : {};
  const options = ids.flatMap((id) => {
    const def: EventDef | undefined = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content, cast);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  const dueYear = due === 'now' ? state.currentYear : state.currentYear + 1;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  state.business.offered[trigger] = state.currentYear;
  return true;
}

/** Cleans a name: trimmed, control characters out, one space between words. */
export function cleanName(raw: unknown, content: ContentBundle): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex -- stripping control characters from player input
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= content.balance.business.limits.nameLength ? name : null;
}

export type StartBlock =
  | FundingBlock
  | 'name'
  | 'type'
  | 'city'
  | 'style'
  | 'full'
  | 'license'
  | 'role'
  | 'listing'
  | 'bought'
  | 'taken';

export interface StartParams {
  defId: Id;
  name: string;
  cityId: Id;
  style: BusinessStyle;
  plan: FundingPlan;
  role: 'self' | 'manager';
  /** For a trade that needs a licence you do not hold: the licensed worker to hire (someone you know), or none for a new one. */
  licensedPersonId?: Id;
}

function nameTaken(state: LifeState, name: string): boolean {
  return state.business.items.some((b) => b.name.toLowerCase() === name.toLowerCase());
}

export function newBusiness(state: LifeState, def: BusinessDef, name: string, cityId: Id, style: BusinessStyle, how: Business['how'], content: ContentBundle): Business {
  const b = state.business;
  const loc: BusinessLocation = { id: `l${b.nextLocation++}`, cityId, style, opened: state.currentYear };
  return {
    id: `b${b.nextBusiness++}`,
    defId: def.id,
    name,
    cityId,
    style,
    founded: state.currentYear,
    how,
    locations: [loc],
    staff: [],
    owners: [],
    prices: 'fair',
    marketing: 'none',
    qualityInvest: 'none',
    pay: 'fair',
    staffing: 'normal',
    role: 'self',
    quality: def.styles[style].quality,
    reputation: content.balance.business.reputation.start,
    morale: content.balance.business.staff.morale.base,
    cash: 0,
    assets: 0,
    loanIds: [],
    profits: [],
    lossYears: 0,
    skimmed: 0,
    shocks: [],
    report: null,
  };
}

/** Writes the owners from a funding result, with you holding what is left. */
function setOwners(state: LifeState, biz: Business, own: number, others: BusinessOwnerList): void {
  const taken = others.reduce((s, o) => s + o.share, 0);
  biz.owners = [{ id: 'you', name: `${state.character.name.first} ${state.character.name.last}`, share: 100 - taken, put: own, year: state.currentYear, paid: 0, role: 'you' }, ...others];
}
type BusinessOwnerList = Business['owners'];

function rememberOwners(state: LifeState, biz: Business): void {
  for (const o of biz.owners) {
    if (o.id === 'you') continue;
    const rel = state.relationships[o.id];
    rel?.memories.push({ tag: o.role === 'investor' ? 'invested_in_your_business' : 'cofounded_with_you', year: state.currentYear });
  }
}

/** Why you cannot start this business now, or null. */
export function startBlock(state: LifeState, p: StartParams, content: ContentBundle): StartBlock | null {
  const bal = content.balance.business;
  const def = content.businesses[p.defId];
  if (!def || def.retired) return 'type';
  if (cleanName(p.name, content) === null) return 'name';
  if (nameTaken(state, cleanName(p.name, content)!)) return 'name';
  if (!content.cities[p.cityId]) return 'city';
  if (!(BUSINESS_STYLES as readonly string[]).includes(p.style)) return 'style';
  if (!(OWNER_ROLES as readonly string[]).includes(p.role)) return 'role';
  if (state.business.items.length >= bal.limits.businesses) return 'full';
  const needsHire = def.license !== undefined && !youHoldLicense(state, def.license);
  const base = totalToStart(def, p.style, p.cityId, needsHire, content);
  const managerCost = p.role === 'manager' ? hiringCost(def, { style: p.style, cityId: p.cityId, pay: 'fair' } as Business, false, true, content) : 0;
  const checked = checkFunding(state, base.total + managerCost, p.plan, def, content);
  if ('block' in checked) return checked.block;
  // A licensed worker must be someone you know who holds it, or someone new.
  if (needsHire && p.licensedPersonId !== undefined) {
    const person = state.people[p.licensedPersonId];
    const rel = state.relationships[p.licensedPersonId];
    if (!person || !person.alive || !rel || rel.status !== 'active' || person.occupation !== def.license!.job) return 'license';
  }
  return null;
}

/** Starts a business. Returns its id, or null when the checks fail. */
export function startBusiness(state: LifeState, p: StartParams, content: ContentBundle): Id | null {
  if (startBlock(state, p, content) !== null) return null;
  const def = content.businesses[p.defId]!;
  const name = cleanName(p.name, content)!;
  const needsHire = def.license !== undefined && !youHoldLicense(state, def.license);
  const base = totalToStart(def, p.style, p.cityId, needsHire, content);
  const managerCost = p.role === 'manager' ? hiringCost(def, { style: p.style, cityId: p.cityId, pay: 'fair' } as Business, false, true, content) : 0;
  const checked = checkFunding(state, base.total + managerCost, p.plan, def, content);
  if (!('result' in checked)) return null;
  const { result } = checked;
  const biz = newBusiness(state, def, name, p.cityId, p.style, 'started', content);
  const { loanId } = applyFunding(state, result, content);
  if (loanId !== null) biz.loanIds.push(loanId);
  setOwners(state, biz, result.own, result.owners);
  biz.cash = base.capital;
  biz.assets = base.fitOut;
  state.business.items.push(biz);
  rememberOwners(state, biz);
  if (needsHire) hireStaff(state, biz, { ...(p.licensedPersonId !== undefined ? { personId: p.licensedPersonId } : {}), licensed: true, locationId: biz.locations[0]!.id }, content, true);
  if (p.role === 'manager') {
    hireStaff(state, biz, { manager: true }, content, true);
    biz.role = 'manager';
  }
  history(state, 'started', { business: name, type: def.noun, city: content.cities[p.cityId]?.name ?? '' }, content);
  if (p.plan.source === 'cofounder') history(state, 'cofounder', { business: name }, content);
  queueBusinessEvent(state, 'opening', biz.id, content, 'next');
  refreshWorth(state, content);
  return biz.id;
}

export interface BuyParams {
  listingId: string;
  name?: string;
  plan: FundingPlan;
  role: 'self' | 'manager';
}

/** Why you cannot buy this listing now, or null. */
export function buyBlock(state: LifeState, p: BuyParams, content: ContentBundle): StartBlock | null {
  const listing = listingById(state, p.listingId, content);
  if (!listing) return state.business.taken.includes(p.listingId) ? 'taken' : 'listing';
  if (state.business.items.length >= content.balance.business.limits.businesses) return 'full';
  if (!(OWNER_ROLES as readonly string[]).includes(p.role)) return 'role';
  if (p.name !== undefined && cleanName(p.name, content) === null) return 'name';
  const name = p.name !== undefined ? cleanName(p.name, content)! : listing.name;
  if (nameTaken(state, name)) return 'name';
  const def = content.businesses[listing.defId];
  const checked = checkFunding(state, listing.price, p.plan, def, content);
  return 'block' in checked ? checked.block : null;
}

/** Buys a listing. Returns the new business's id, or null. */
export function buyBusiness(state: LifeState, p: BuyParams, content: ContentBundle): Id | null {
  if (buyBlock(state, p, content) !== null) return null;
  const listing = listingById(state, p.listingId, content)!;
  const def = content.businesses[listing.defId]!;
  const name = p.name !== undefined ? cleanName(p.name, content)! : listing.name;
  const checked = checkFunding(state, listing.price, p.plan, def, content);
  if (!('result' in checked)) return null;
  const { result } = checked;
  const biz = newBusiness(state, def, name, listing.cityId, listing.style, 'bought', content);
  if (listing.chainId !== undefined) biz.chainId = listing.chainId;
  const { loanId } = applyFunding(state, result, content);
  if (loanId !== null) biz.loanIds.push(loanId);
  setOwners(state, biz, result.own, result.owners);
  biz.locations = listing.locations.map((l, i) => ({ id: `l${state.business.nextLocation++}`, cityId: l.cityId, style: l.style, opened: state.currentYear - Math.max(1, listing.years - i) }));
  biz.quality = listing.quality;
  biz.reputation = listing.reputation;
  biz.cash = listing.cash;
  biz.assets = listing.assets;
  // Its past earnings come with it (a profit a year, so the first valuation is steady).
  biz.profits = [listing.profit, listing.profit];
  state.business.taken.push(listing.id);
  state.business.items.push(biz);
  rememberOwners(state, biz);
  // The people who come with it: someone who has been there, licensed if the trade needs it, and for a chain a manager.
  const named = listing.kind === 'chain' ? 2 : 1;
  for (let i = 0; i < named; i++) hireStaff(state, biz, { licensed: def.license !== undefined && i === 0, locationId: biz.locations[0]!.id }, content, true);
  if (listing.kind === 'chain') {
    hireStaff(state, biz, { manager: true }, content, true);
    biz.role = 'manager';
  }
  if (p.role === 'manager' && !managerOf(biz)) {
    hireStaff(state, biz, { manager: true }, content, true);
    biz.role = 'manager';
  }
  history(state, 'bought', { business: name, type: def.noun, city: content.cities[listing.cityId]?.name ?? '' }, content);
  refreshWorth(state, content);
  return biz.id;
}

/** The yearly decisions you can set between years. */
export interface Decisions {
  prices?: Business['prices'];
  marketing?: Business['marketing'];
  qualityInvest?: Business['qualityInvest'];
  pay?: Business['pay'];
  staffing?: Business['staffing'];
}

export function decisionsValid(d: Decisions): boolean {
  return (
    (d.prices === undefined || (PRICE_LEVELS as readonly string[]).includes(d.prices)) &&
    (d.marketing === undefined || (MARKETING_LEVELS as readonly string[]).includes(d.marketing)) &&
    (d.qualityInvest === undefined || (QUALITY_LEVELS as readonly string[]).includes(d.qualityInvest)) &&
    (d.pay === undefined || (PAY_LEVELS as readonly string[]).includes(d.pay)) &&
    (d.staffing === undefined || (STAFFING_LEVELS as readonly string[]).includes(d.staffing))
  );
}

export function setDecisions(state: LifeState, id: Id, d: Decisions): boolean {
  const b = businessById(state, id);
  if (!b || !decisionsValid(d)) return false;
  if (d.prices) b.prices = d.prices;
  if (d.marketing) b.marketing = d.marketing;
  if (d.qualityInvest) b.qualityInvest = d.qualityInvest;
  if (d.pay) b.pay = d.pay;
  if (d.staffing) b.staffing = d.staffing;
  return true;
}

export type RoleBlock = 'unknown' | 'same' | 'manager' | 'savings' | 'person';

/** Runs the business yourself, or through a manager (a person on staff, or someone new). */
export function roleBlock(state: LifeState, id: Id, role: 'self' | 'manager', personId: Id | undefined, content: ContentBundle): RoleBlock | null {
  const b = businessById(state, id);
  const def = b && content.businesses[b.defId];
  if (!b || !def) return 'unknown';
  if (role === 'self') return b.role === 'self' ? 'same' : null;
  const existing = managerOf(b);
  if (existing && b.role === 'manager') return 'same';
  if (existing) return null;
  if (personId !== undefined) {
    const s = livingStaff(state, b).find((x) => x.personId === personId && !x.manager);
    if (!s) return 'person';
    return null;
  }
  return state.finances.savings >= hiringCost(def, b, false, true, content) ? null : 'savings';
}

export function setRole(state: LifeState, id: Id, role: 'self' | 'manager', personId: Id | undefined, content: ContentBundle): boolean {
  if (roleBlock(state, id, role, personId, content) !== null) return false;
  const b = businessById(state, id)!;
  const def = content.businesses[b.defId]!;
  if (role === 'self') {
    const m = managerOf(b);
    if (m) {
      // A manager steps back to an ordinary job there (or leaves if the place is full).
      delete m.manager;
      delete m.honesty;
      m.title = def.staffTitle;
      m.locationId = b.locations[0]!.id;
    }
    b.role = 'self';
    return true;
  }
  let m = managerOf(b);
  if (!m && personId !== undefined) {
    m = b.staff.find((x) => x.personId === personId)!;
    m.manager = true;
    m.locationId = null;
    m.title = def.managerTitle;
    m.honesty = clampInt(55 + ((state.relationships[personId]?.affection ?? 50) - 50) * 0.4 + (m.skill - 50) * 0.2, 0, 100);
    m.skill = clampInt(m.skill + 6, 0, 100);
  } else if (!m) {
    hireStaff(state, b, { manager: true }, content);
  }
  b.role = 'manager';
  history(state, 'managerHired', { business: b.name }, content);
  return true;
}

export type ExpandBlock = 'unknown' | 'full' | 'city' | 'style' | 'savings' | 'loan' | 'away';

export interface ExpandParams {
  id: Id;
  cityId: Id;
  style: BusinessStyle;
  funding: 'savings' | 'loan';
}

export function expandCost(def: BusinessDef, cityId: Id, style: BusinessStyle, content: ContentBundle): number {
  const c = content.balance.business.costs.newLocation;
  return wholeDollars((startupCost(def, style, cityId, content) + workingCapital(def, style, cityId, content)) * c);
}

export function expandBlock(state: LifeState, p: ExpandParams, content: ContentBundle): ExpandBlock | null {
  const b = businessById(state, p.id);
  const def = b && content.businesses[b.defId];
  if (!b || !def) return 'unknown';
  if (b.locations.length >= content.balance.business.limits.locations) return 'full';
  if (!content.cities[p.cityId]) return 'city';
  if (!(BUSINESS_STYLES as readonly string[]).includes(p.style)) return 'style';
  if (state.housing.kind === 'incarcerated') return 'away';
  const cost = expandCost(def, p.cityId, p.style, content);
  if (p.funding === 'savings') return state.finances.savings >= cost ? null : 'savings';
  const checked = checkFunding(state, cost, { source: 'loan' }, def, content);
  return 'block' in checked ? 'loan' : null;
}

/** Opens a new location in a city (yours or another). */
export function openLocation(state: LifeState, p: ExpandParams, content: ContentBundle): boolean {
  if (expandBlock(state, p, content) !== null) return false;
  const b = businessById(state, p.id)!;
  const def = content.businesses[b.defId]!;
  const cost = expandCost(def, p.cityId, p.style, content);
  const checked = checkFunding(state, cost, p.funding === 'savings' ? { source: 'savings' } : { source: 'loan' }, def, content);
  if (!('result' in checked)) return false;
  const { loanId } = applyFunding(state, checked.result, content);
  if (loanId !== null) b.loanIds.push(loanId);
  // The fit-out goes into the business; the working capital too.
  const fit = startupCost(def, p.style, p.cityId, content) * content.balance.business.costs.newLocation;
  b.assets += wholeDollars(fit);
  b.cash += wholeDollars(cost - fit);
  const you = b.owners.find((o) => o.id === 'you');
  if (you) you.put += checked.result.own;
  b.locations.push({ id: `l${state.business.nextLocation++}`, cityId: p.cityId, style: p.style, opened: state.currentYear });
  history(state, 'expanded', { business: b.name, city: content.cities[p.cityId]?.name ?? '' }, content);
  refreshWorth(state, content);
  return true;
}

export type CloseLocationBlock = 'unknown' | 'last';

export function closeLocationBlock(state: LifeState, id: Id, locationId: Id): CloseLocationBlock | null {
  const b = businessById(state, id);
  if (!b || !b.locations.some((l) => l.id === locationId)) return 'unknown';
  return b.locations.length <= 1 ? 'last' : null;
}

/** Closes one location: its staff move to another, and part of its fit-out comes back as cash in the business. */
export function closeLocation(state: LifeState, id: Id, locationId: Id, content: ContentBundle): boolean {
  if (closeLocationBlock(state, id, locationId) !== null) return false;
  const b = businessById(state, id)!;
  const rest = b.locations.filter((l) => l.id !== locationId);
  const share = 1 / b.locations.length;
  const back = wholeDollars(b.assets * share * content.balance.business.failure.liquidation);
  b.assets = wholeDollars(b.assets * (1 - share));
  b.cash += back;
  b.locations = rest;
  for (const s of b.staff) if (s.locationId === locationId) s.locationId = rest[0]!.id;
  refreshWorth(state, content);
  return true;
}

/** The outcome of ending a business, for the screen and for history. */
export interface EndResult {
  gotten: number;
  /** Your share of the sale after loans, before anything you put in. */
  net: number;
  loansRepaid: number;
  loansLeft: number;
  shortfallDebt: number;
}

/**
 * Ends a business: its worth (the price when sold, the fit-out and cash at a
 * discount when closed or failed) first repays its loans; what is left is
 * shared by the owners by share. Loans it cannot repay stay yours (they were
 * guaranteed); a shortfall at failure becomes a debt of yours too. Investors
 * and a co-founder remember how they came out; the staff are let go.
 */
export function endBusiness(state: LifeState, id: Id, how: 'sold' | 'closed' | 'failed' | 'passed', content: ContentBundle, unmet = 0): EndResult | null {
  const b = businessById(state, id);
  if (!b) return null;
  const def = content.businesses[b.defId];
  const bal = content.balance.business;
  const worth = how === 'sold' ? salePrice(b, content) : how === 'passed' ? 0 : wholeDollars(b.assets * bal.failure.liquidation + b.cash);
  // Loans are repaid from what the business brings.
  let pool = worth;
  let loansRepaid = 0;
  for (const debtId of b.loanIds) {
    const d = state.finances.debts.find((x) => x.id === debtId);
    if (!d) continue;
    const pay = Math.min(pool, d.balance);
    d.balance -= pay;
    pool -= pay;
    loansRepaid += pay;
  }
  state.finances.debts = state.finances.debts.filter((d) => d.balance > 0);
  const loansLeft = loanBalance(state, b);
  // What is left is shared by share (you take the rounding).
  const year = state.currentYear;
  const others = b.owners.filter((o) => o.id !== 'you');
  let otherTotal = 0;
  for (const o of others) {
    const got = Math.floor((pool * o.share) / 100);
    otherTotal += got;
    o.paid += got;
    const rel = state.relationships[o.id];
    if (rel && state.people[o.id]?.alive) {
      const returned = o.paid;
      if (returned >= o.put) rel.memories.push({ tag: 'made_money_in_your_business', year });
      else if (returned < o.put * 0.9) {
        rel.memories.push({ tag: 'lost_money_in_your_business', year });
        const lost = Math.min(1, (o.put - returned) / Math.max(1, o.put));
        rel.affection = clampInt(rel.affection - Math.round(14 * lost), 0, 100);
        rel.trust = clampInt(rel.trust - Math.round(24 * lost), 0, 100);
      }
    }
  }
  const gotten = pool - otherTotal;
  if (gotten > 0) earn(state, gotten);
  const you = b.owners.find((o) => o.id === 'you');
  const put = you?.put ?? 0;
  // A failure leaves what it could not pay: guaranteed in part, as a debt of yours.
  let shortfallDebt = 0;
  if (how === 'failed' && unmet > 0 && state.character.age >= bal.limits.minAge) {
    shortfallDebt = wholeDollars(unmet * bal.failure.guarantee);
    if (shortfallDebt > 0) addDebt(state, 'business', shortfallDebt, content);
  }
  // The staff are let go: the people stay in your life.
  for (const s of [...b.staff]) {
    removeStaff(state, b, s.personId);
  }
  state.business.items = state.business.items.filter((x) => x.id !== id);
  const past: BusinessPast = { name: b.name, defId: b.defId, style: b.style, cityId: b.cityId, fromYear: b.founded, toYear: year, end: how, totalProfit: b.profits.reduce((s, n) => s + n, 0), net: gotten - put - shortfallDebt };
  state.business.past.push(past);
  if (state.business.past.length > 20) state.business.past.splice(0, state.business.past.length - 20);
  const noun = def?.noun ?? 'business';
  history(state, how === 'passed' ? 'closed' : how, { business: b.name, type: noun, city: content.cities[b.cityId]?.name ?? '' }, content);
  if (how === 'failed') {
    state.character.hidden.reputation = clampInt(state.character.hidden.reputation + content.balance.business.reputationEffect.failure, 0, 100);
    if (others.some((o) => o.role === 'investor' && o.paid < o.put * 0.9)) history(state, 'lostMoney', { business: b.name }, content);
  }
  refreshWorth(state, content);
  return { gotten, net: gotten - put, loansRepaid, loansLeft, shortfallDebt };
}

export type SellBlock = 'unknown' | 'away';

export function sellBlock(state: LifeState, id: Id): SellBlock | null {
  if (!businessById(state, id)) return 'unknown';
  return state.housing.kind === 'incarcerated' ? 'away' : null;
}

/** Sells the business at the market price (its earnings priced, less a quick-sale discount and the broker). */
export function sellBusiness(state: LifeState, id: Id, content: ContentBundle): EndResult | null {
  if (sellBlock(state, id) !== null) return null;
  return endBusiness(state, id, 'sold', content);
}

/** Closes the business: the fit-out and cash are sold off, loans are repaid from them, and the staff go. */
export function closeBusiness(state: LifeState, id: Id, content: ContentBundle): EndResult | null {
  if (sellBlock(state, id) !== null) return null;
  return endBusiness(state, id, 'closed', content);
}

export type BuyoutBlock = 'unknown' | 'owner' | 'savings';

/** What buying an owner out costs: their share of what the business is worth. */
export function buyoutPrice(b: Business, ownerId: Id, content: ContentBundle): number {
  const o = b.owners.find((x) => x.id === ownerId);
  return o ? Math.round((valuation(b, content) * o.share) / 100) : 0;
}

export function buyoutBlock(state: LifeState, id: Id, ownerId: Id, content: ContentBundle): BuyoutBlock | null {
  const b = businessById(state, id);
  if (!b || !b.owners.some((o) => o.id === ownerId && o.id !== 'you')) return 'owner';
  return state.finances.savings >= buyoutPrice(b, ownerId, content) ? null : 'savings';
}

/** Buys an investor or co-founder out at their share of the business's worth; you own their share. */
export function buyOut(state: LifeState, id: Id, ownerId: Id, content: ContentBundle): boolean {
  if (buyoutBlock(state, id, ownerId, content) !== null) return false;
  const b = businessById(state, id)!;
  const o = b.owners.find((x) => x.id === ownerId)!;
  const price = buyoutPrice(b, ownerId, content);
  spend(state, price, content);
  const you = b.owners.find((x) => x.id === 'you')!;
  you.share += o.share;
  you.put += price;
  o.paid += price;
  const rel = state.relationships[ownerId];
  if (rel) rel.memories.push({ tag: price >= o.put ? 'made_money_in_your_business' : 'lost_money_in_your_business', year: state.currentYear });
  b.owners = b.owners.filter((x) => x.id !== ownerId);
  history(state, 'investorPaid', { business: b.name }, content);
  refreshWorth(state, content);
  return true;
}
