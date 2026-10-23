/**
 * Business actions (W3, Work → Business and the market): start one, buy one
 * that is for sale, set the yearly decisions, run it yourself or through a
 * manager, hire and let people go, open or close a location, buy out an
 * owner, sell or close. Each takes effect at once, between years; the checks
 * live with the rules (../business), so the screen and the action agree. The
 * common checks (between years, input validation, the input log) live in
 * ./index.ts.
 */
import {
  BUSINESS_FUNDING,
  BUSINESS_STYLES,
  MARKETING_LEVELS,
  ORDER_LEVELS,
  OWNER_ROLES,
  PAY_LEVELS,
  PRICE_LEVELS,
  QUALITY_LEVELS,
  STAFFING_LEVELS,
  TRAINING_LEVELS,
  type BusinessFunding,
  type OrderLevel,
  type PriceLevel,
  type BusinessStyle,
  type OwnerRole,
} from '../../content/schemas';
import { buyBlock, buyBusiness, buyOut, buyoutBlock, closeBusiness, closeLocation, closeLocationBlock, decisionsValid, expandBlock, lineBlock, openLocation, roleBlock, sellBlock, sellBusiness, setDecisions, setLine, setOrder, setRole, startBlock, startBusiness, type Decisions } from '../business/found';
import { headcountBlock, setHeadcount } from '../business/crew';
import { endFranchise, sellBlock as franchiseBlock, sellFranchise } from '../business/franchise';
import type { FundingPlan } from '../business/funding';
import { businessById } from '../business/query';
import { appointBlock, appointManager, fireStaff, hireBlock, hireCrew, hireStaff, raiseStaff, removeLocationManager, removeManagerBlock, transferBlock, transferStaff } from '../business/staff';
import { craftRole, crewRoles } from '../business/headcount';
import type { LifeActionParams, LifeActionRule } from './life';

export const BUSINESS_ACTION_IDS = [
  'start_business',
  'buy_business',
  'sell_business',
  'close_business',
  'set_business_decisions',
  'set_business_role',
  'hire_staff',
  'fire_staff',
  'raise_staff',
  'open_location',
  'close_location',
  'buyout_owner',
  // B2
  'set_line',
  'set_order',
  'set_headcount',
  'transfer_staff',
  'appoint_manager',
  'remove_manager',
  'sell_franchise',
  'end_franchise',
] as const;
export type BusinessActionId = (typeof BUSINESS_ACTION_IDS)[number];

/** The validated parameters of a business action (every field optional; each action needs its own). */
export interface BusinessActionParams {
  businessId?: string;
  listingId?: string;
  defId?: string;
  name?: string;
  cityId?: string;
  style?: BusinessStyle;
  role?: OwnerRole;
  personId?: string;
  locationId?: string;
  licensed?: boolean;
  funding?: 'savings' | 'loan';
  ownerId?: string;
  plan?: FundingPlan;
  licensedPersonId?: string;
  decisions?: Decisions;
  /** B2 */
  productId?: string;
  stockId?: string;
  roleId?: string;
  franchiseId?: string;
  price?: PriceLevel;
  level?: OrderLevel;
  on?: boolean;
  crew?: boolean;
  count?: number;
  royalty?: number;
  how?: 'end' | 'buyback';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : undefined);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const wholeAmount = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000 ? v : undefined);

function parsePlan(raw: unknown): FundingPlan | null {
  if (!isRecord(raw)) return null;
  const source = oneOf<BusinessFunding>(BUSINESS_FUNDING, raw.source);
  if (!source) return null;
  const plan: FundingPlan = { source };
  if (raw.loan !== undefined) {
    const loan = wholeAmount(raw.loan);
    if (loan === undefined) return null;
    plan.loan = loan;
  }
  if (raw.investors !== undefined) {
    if (!Array.isArray(raw.investors) || raw.investors.length > 5) return null;
    const list: NonNullable<FundingPlan['investors']> = [];
    for (const i of raw.investors as unknown[]) {
      if (!isRecord(i)) return null;
      const personId = idOf(i.personId);
      const amount = wholeAmount(i.amount);
      if (personId === undefined || amount === undefined || amount < 1) return null;
      list.push({ personId, amount });
    }
    plan.investors = list;
  }
  if (raw.cofounder !== undefined) {
    if (!isRecord(raw.cofounder)) return null;
    const personId = idOf(raw.cofounder.personId);
    const share = wholeAmount(raw.cofounder.share);
    if (personId === undefined || share === undefined) return null;
    plan.cofounder = { personId, share };
  }
  return plan;
}

/** Reads `params.biz`, keeping only known fields; null when a field is present but wrong. */
function parseBusiness(params: unknown, need: readonly (keyof BusinessActionParams)[]): LifeActionParams | null {
  if (!isRecord(params) || !isRecord(params.biz) || Object.keys(params).length !== 1) return null;
  const raw = params.biz;
  const known = ['businessId', 'listingId', 'defId', 'name', 'cityId', 'style', 'role', 'personId', 'locationId', 'licensed', 'funding', 'ownerId', 'plan', 'licensedPersonId', 'decisions', 'productId', 'stockId', 'roleId', 'franchiseId', 'price', 'level', 'on', 'crew', 'count', 'royalty', 'how'];
  if (Object.keys(raw).some((k) => !known.includes(k))) return null;
  const out: BusinessActionParams = {};
  for (const key of ['businessId', 'listingId', 'defId', 'cityId', 'personId', 'locationId', 'ownerId', 'licensedPersonId', 'productId', 'stockId', 'roleId', 'franchiseId'] as const) {
    if (raw[key] === undefined) continue;
    const v = idOf(raw[key]);
    if (v === undefined) return null;
    out[key] = v;
  }
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || raw.name.length > 120) return null;
    out.name = raw.name;
  }
  if (raw.style !== undefined) {
    const v = oneOf<BusinessStyle>(BUSINESS_STYLES, raw.style);
    if (!v) return null;
    out.style = v;
  }
  if (raw.role !== undefined) {
    const v = oneOf<OwnerRole>(OWNER_ROLES, raw.role);
    if (!v) return null;
    out.role = v;
  }
  if (raw.licensed !== undefined) {
    if (typeof raw.licensed !== 'boolean') return null;
    out.licensed = raw.licensed;
  }
  for (const key of ['on', 'crew'] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'boolean') return null;
    out[key] = raw[key];
  }
  if (raw.price !== undefined) {
    const v = oneOf<PriceLevel>(PRICE_LEVELS, raw.price);
    if (!v) return null;
    out.price = v;
  }
  if (raw.level !== undefined) {
    const v = oneOf<OrderLevel>(ORDER_LEVELS, raw.level);
    if (!v) return null;
    out.level = v;
  }
  if (raw.how !== undefined) {
    const v = oneOf(['end', 'buyback'] as const, raw.how);
    if (!v) return null;
    out.how = v;
  }
  if (raw.count !== undefined) {
    if (typeof raw.count !== 'number' || !Number.isInteger(raw.count) || raw.count < 0 || raw.count > 200) return null;
    out.count = raw.count;
  }
  if (raw.royalty !== undefined) {
    if (typeof raw.royalty !== 'number' || !Number.isFinite(raw.royalty) || raw.royalty <= 0 || raw.royalty > 1) return null;
    out.royalty = raw.royalty;
  }
  if (raw.funding !== undefined) {
    const v = oneOf(['savings', 'loan'] as const, raw.funding);
    if (!v) return null;
    out.funding = v;
  }
  if (raw.plan !== undefined) {
    const plan = parsePlan(raw.plan);
    if (!plan) return null;
    out.plan = plan;
  }
  if (raw.decisions !== undefined) {
    if (!isRecord(raw.decisions)) return null;
    const d: Decisions = {};
    const lists = { prices: PRICE_LEVELS, marketing: MARKETING_LEVELS, qualityInvest: QUALITY_LEVELS, pay: PAY_LEVELS, staffing: STAFFING_LEVELS, training: TRAINING_LEVELS } as const;
    for (const key of Object.keys(raw.decisions)) {
      if (!(key in lists)) return null;
    }
    for (const key of Object.keys(lists) as (keyof typeof lists)[]) {
      if (raw.decisions[key] === undefined) continue;
      const v = oneOf(lists[key] as readonly string[], raw.decisions[key]);
      if (!v) return null;
      (d as Record<string, string>)[key] = v;
    }
    if (!decisionsValid(d)) return null;
    out.decisions = d;
  }
  for (const key of need) if (out[key] === undefined) return null;
  return { biz: out };
}

const biz = (p: LifeActionParams): BusinessActionParams => p.biz ?? {};

export const BUSINESS_ACTIONS: Record<BusinessActionId, LifeActionRule> = {
  start_business: {
    parse: (params) => parseBusiness(params, ['defId', 'name', 'cityId', 'style', 'plan', 'role']),
    allowed: (state, p, content) => {
      const b = biz(p);
      return startBlock(state, { defId: b.defId!, name: b.name!, cityId: b.cityId!, style: b.style!, plan: b.plan!, role: b.role!, ...(b.licensedPersonId !== undefined ? { licensedPersonId: b.licensedPersonId } : {}) }, content) === null;
    },
    apply: (state, p, content) => {
      const b = biz(p);
      startBusiness(state, { defId: b.defId!, name: b.name!, cityId: b.cityId!, style: b.style!, plan: b.plan!, role: b.role!, ...(b.licensedPersonId !== undefined ? { licensedPersonId: b.licensedPersonId } : {}) }, content);
    },
  },
  buy_business: {
    parse: (params) => parseBusiness(params, ['listingId', 'plan', 'role']),
    allowed: (state, p, content) => {
      const b = biz(p);
      return buyBlock(state, { listingId: b.listingId!, plan: b.plan!, role: b.role!, ...(b.name !== undefined ? { name: b.name } : {}) }, content) === null;
    },
    apply: (state, p, content) => {
      const b = biz(p);
      buyBusiness(state, { listingId: b.listingId!, plan: b.plan!, role: b.role!, ...(b.name !== undefined ? { name: b.name } : {}) }, content);
    },
  },
  sell_business: {
    parse: (params) => parseBusiness(params, ['businessId']),
    allowed: (state, p) => sellBlock(state, biz(p).businessId!) === null,
    apply: (state, p, content) => void sellBusiness(state, biz(p).businessId!, content),
  },
  close_business: {
    parse: (params) => parseBusiness(params, ['businessId']),
    allowed: (state, p) => sellBlock(state, biz(p).businessId!) === null,
    apply: (state, p, content) => void closeBusiness(state, biz(p).businessId!, content),
  },
  set_business_decisions: {
    parse: (params) => parseBusiness(params, ['businessId', 'decisions']),
    allowed: (state, p) => businessById(state, biz(p).businessId) !== undefined && Object.keys(biz(p).decisions ?? {}).length > 0,
    apply: (state, p, content) => void setDecisions(state, biz(p).businessId!, biz(p).decisions!, content),
  },
  set_business_role: {
    parse: (params) => parseBusiness(params, ['businessId', 'role']),
    allowed: (state, p, content) => roleBlock(state, biz(p).businessId!, biz(p).role!, biz(p).personId, content) === null,
    apply: (state, p, content) => void setRole(state, biz(p).businessId!, biz(p).role!, biz(p).personId, content),
  },
  hire_staff: {
    parse: (params) => parseBusiness(params, ['businessId']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      const def = b && content.businesses[b.defId];
      if (!b || !def) return false;
      const loc = biz(p).locationId ?? b.locations[0]!.id;
      if (biz(p).crew === true) {
        // A crew hire raises the target (the head is hired and paid for when the year turns).
        const role = crewRoles(def).find((r) => r.id === (biz(p).roleId ?? craftRole(def).id));
        return role !== undefined && biz(p).personId === undefined && headcountBlock(b, def, loc, role.id, (b.headcount[loc]?.[role.id] ?? 0) + 1, content) === null;
      }
      return hireBlock(state, b, def, { ...(biz(p).personId !== undefined ? { personId: biz(p).personId } : {}), locationId: loc, ...(biz(p).roleId !== undefined ? { roleId: biz(p).roleId } : {}), licensed: biz(p).licensed === true }, content) === null;
    },
    apply: (state, p, content) => {
      const b = businessById(state, biz(p).businessId)!;
      const def = content.businesses[b.defId]!;
      const loc = biz(p).locationId ?? b.locations[0]!.id;
      if (biz(p).crew === true) {
        hireCrew(b, def, loc, biz(p).roleId ?? craftRole(def).id, content);
        return;
      }
      hireStaff(state, b, { ...(biz(p).personId !== undefined ? { personId: biz(p).personId } : {}), locationId: loc, ...(biz(p).roleId !== undefined ? { roleId: biz(p).roleId } : {}), licensed: biz(p).licensed === true }, content);
    },
  },
  fire_staff: {
    parse: (params) => parseBusiness(params, ['businessId', 'personId']),
    allowed: (state, p) => businessById(state, biz(p).businessId)?.staff.some((s) => s.personId === biz(p).personId) === true,
    apply: (state, p, content) => void fireStaff(state, businessById(state, biz(p).businessId)!, biz(p).personId!, content),
  },
  raise_staff: {
    parse: (params) => parseBusiness(params, ['businessId', 'personId']),
    allowed: (state, p) => businessById(state, biz(p).businessId)?.staff.some((s) => s.personId === biz(p).personId) === true,
    apply: (state, p, content) => void raiseStaff(businessById(state, biz(p).businessId)!, biz(p).personId!, content),
  },
  open_location: {
    parse: (params) => parseBusiness(params, ['businessId', 'cityId', 'style', 'funding']),
    allowed: (state, p, content) => expandBlock(state, { id: biz(p).businessId!, cityId: biz(p).cityId!, style: biz(p).style!, funding: biz(p).funding! }, content) === null,
    apply: (state, p, content) => void openLocation(state, { id: biz(p).businessId!, cityId: biz(p).cityId!, style: biz(p).style!, funding: biz(p).funding! }, content),
  },
  close_location: {
    parse: (params) => parseBusiness(params, ['businessId', 'locationId']),
    allowed: (state, p) => closeLocationBlock(state, biz(p).businessId!, biz(p).locationId!) === null,
    apply: (state, p, content) => void closeLocation(state, biz(p).businessId!, biz(p).locationId!, content),
  },
  buyout_owner: {
    parse: (params) => parseBusiness(params, ['businessId', 'ownerId']),
    allowed: (state, p, content) => buyoutBlock(state, biz(p).businessId!, biz(p).ownerId!, content) === null,
    apply: (state, p, content) => void buyOut(state, biz(p).businessId!, biz(p).ownerId!, content),
  },
  set_line: {
    parse: (params) => parseBusiness(params, ['businessId', 'productId']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      const def = b && content.businesses[b.defId];
      return b !== undefined && def !== undefined && (biz(p).price !== undefined || biz(p).on !== undefined) && lineBlock(state, b, def, biz(p).productId!, biz(p).on, content) === null;
    },
    apply: (state, p, content) => void setLine(state, biz(p).businessId!, biz(p).productId!, { ...(biz(p).price !== undefined ? { price: biz(p).price! } : {}), ...(biz(p).on !== undefined ? { on: biz(p).on! } : {}) }, content),
  },
  set_order: {
    parse: (params) => parseBusiness(params, ['businessId', 'stockId', 'level']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      const def = b && content.businesses[b.defId];
      return b !== undefined && def !== undefined && (def.products.some((x) => x.id === biz(p).stockId && x.type === 'goods') || def.pools.some((x) => x.id === biz(p).stockId));
    },
    apply: (state, p) => void setOrder(state, biz(p).businessId!, biz(p).stockId!, biz(p).level!),
  },
  set_headcount: {
    parse: (params) => parseBusiness(params, ['businessId', 'locationId', 'roleId', 'count']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      const def = b && content.businesses[b.defId];
      return b !== undefined && def !== undefined && headcountBlock(b, def, biz(p).locationId!, biz(p).roleId!, biz(p).count!, content) === null;
    },
    apply: (state, p, content) => {
      const b = businessById(state, biz(p).businessId)!;
      setHeadcount(b, content.businesses[b.defId]!, biz(p).locationId!, biz(p).roleId!, biz(p).count!, content);
    },
  },
  transfer_staff: {
    parse: (params) => parseBusiness(params, ['businessId', 'personId', 'locationId']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      return b !== undefined && transferBlock(state, b, biz(p).personId!, biz(p).locationId!, content) === null;
    },
    apply: (state, p, content) => void transferStaff(state, businessById(state, biz(p).businessId)!, biz(p).personId!, biz(p).locationId!, content),
  },
  appoint_manager: {
    parse: (params) => parseBusiness(params, ['businessId', 'personId', 'locationId']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      const def = b && content.businesses[b.defId];
      return b !== undefined && def !== undefined && appointBlock(state, b, def, biz(p).personId!, biz(p).locationId!, content) === null;
    },
    apply: (state, p, content) => {
      const b = businessById(state, biz(p).businessId)!;
      appointManager(state, b, content.businesses[b.defId]!, biz(p).personId!, biz(p).locationId!, content);
    },
  },
  remove_manager: {
    parse: (params) => parseBusiness(params, ['businessId', 'locationId']),
    allowed: (state, p) => {
      const b = businessById(state, biz(p).businessId);
      return b !== undefined && removeManagerBlock(b, biz(p).locationId!) === null;
    },
    apply: (state, p, content) => {
      const b = businessById(state, biz(p).businessId)!;
      removeLocationManager(b, content.businesses[b.defId]!, biz(p).locationId!);
    },
  },
  sell_franchise: {
    parse: (params) => parseBusiness(params, ['businessId', 'cityId', 'style', 'royalty']),
    allowed: (state, p, content) => {
      const b = businessById(state, biz(p).businessId);
      return b !== undefined && franchiseBlock(state, b, { businessId: b.id, cityId: biz(p).cityId!, style: biz(p).style!, royalty: biz(p).royalty!, ...(biz(p).personId !== undefined ? { personId: biz(p).personId } : {}) }, content) === null;
    },
    apply: (state, p, content) => {
      const b = businessById(state, biz(p).businessId)!;
      sellFranchise(state, b, { businessId: b.id, cityId: biz(p).cityId!, style: biz(p).style!, royalty: biz(p).royalty!, ...(biz(p).personId !== undefined ? { personId: biz(p).personId } : {}) }, state.rng, content);
    },
  },
  end_franchise: {
    parse: (params) => parseBusiness(params, ['businessId', 'franchiseId', 'how']),
    allowed: (state, p) => businessById(state, biz(p).businessId)?.franchises.some((f) => f.id === biz(p).franchiseId) === true,
    apply: (state, p, content) => void endFranchise(state, businessById(state, biz(p).businessId)!, biz(p).franchiseId!, biz(p).how!, content),
  },
};
