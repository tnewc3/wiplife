/**
 * Drug actions (D1): buy, use, hide a stash, ask for a dealer, quit, deal, make. Each takes effect at once, between
 * years; the common checks (between years, input validation, the input log) live in ./index.ts. What a buy or a use came to
 * is in `life.drugs.last`; a rip-off, a robbery and an arrest also queue their event for the year that begins next.
 */
import { DEAL_PRICES, DRUG_SOURCES, USE_DOSES, type DealPrice, type DrugSource, type UseDose } from '../../content/schemas';
import { buy, buyBlock, introBlock, meetDealer, setHidden } from '../drugs/market';
import { setDealDrug, setDealPrice, sellWholesale, startBlock, startDealing, stopDealing, wholesaleBlock } from '../drugs/dealing';
import { closeOp, setRunning, startOp, startOpBlock } from '../drugs/ops';
import { quitBlock, quitDrug } from '../drugs/recovery';
import { drugDef } from '../drugs/query';
import { queueDrugEvent } from '../drugs/step';
import { useBlock, useDrug } from '../drugs/use';
import { syncAddiction } from '../drugs/habit';
import type { LifeActionParams, LifeActionRule } from './life';

export const DRUG_ACTION_IDS = ['buy_drug', 'use_drug', 'hide_stash', 'meet_dealer', 'quit_drug', 'start_dealing', 'stop_dealing', 'set_deal_price', 'set_deal_drug', 'sell_wholesale', 'start_operation', 'set_operation', 'close_operation'] as const;
export type DrugActionId = (typeof DRUG_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const none = (params: unknown): LifeActionParams | null => (params === undefined || only(params, []) ? {} : null);
const idOf = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z][a-z0-9_]{0,59}$/.test(v) ? v : undefined);
const drugOnly = (params: unknown): LifeActionParams | null => {
  const drugId = idOf(field(params, 'drugId'));
  return only(params, ['drugId']) && drugId !== undefined ? { drugId } : null;
};

export const DRUG_ACTIONS: Record<DrugActionId, LifeActionRule> = {
  buy_drug: {
    parse: (params) => {
      const drugId = idOf(field(params, 'drugId'));
      const drugSource = field(params, 'drugSource');
      const units = field(params, 'units');
      const resale = field(params, 'resale');
      if (!only(params, ['drugId', 'drugSource', 'units', 'resale']) || drugId === undefined) return null;
      if (!(DRUG_SOURCES as readonly unknown[]).includes(drugSource) || typeof units !== 'number' || !Number.isInteger(units) || units < 1 || units > 1000) return null;
      if (resale !== undefined && typeof resale !== 'boolean') return null;
      return { drugId, drugSource: drugSource as DrugSource, units, resale: resale === true };
    },
    allowed: (state, p, content) => p.drugId !== undefined && p.drugSource !== undefined && p.units !== undefined && buyBlock(state, p.drugId, p.drugSource, p.units, p.resale === true, content) === null,
    apply: (state, p, content) => {
      buy(state, p.drugId!, p.drugSource!, p.units!, p.resale === true, content);
      const kind = state.drugs.last?.kind;
      if (kind === 'ripoff' || kind === 'robbed' || kind === 'caught') queueDrugEvent(state, kind === 'caught' ? 'arrest' : kind, content, state.currentYear + 1);
    },
  },
  use_drug: {
    parse: (params) => {
      const drugId = idOf(field(params, 'drugId'));
      const dose = field(params, 'dose');
      return only(params, ['drugId', 'dose']) && drugId !== undefined && (USE_DOSES as readonly unknown[]).includes(dose) ? { drugId, dose: dose as UseDose } : null;
    },
    allowed: (state, p, content) => p.drugId !== undefined && p.dose !== undefined && useBlock(state, p.drugId, p.dose, content) === null,
    apply: (state, p, content) => useDrug(state, p.drugId!, p.dose!, content),
  },
  hide_stash: {
    parse: (params) => {
      const drugId = idOf(field(params, 'drugId'));
      const on = field(params, 'on');
      return only(params, ['drugId', 'on']) && drugId !== undefined && typeof on === 'boolean' ? { drugId, on } : null;
    },
    allowed: (state, p) => p.drugId !== undefined && (state.drugs.stock[p.drugId]?.units ?? 0) > 0 && state.drugs.stock[p.drugId]!.hidden !== p.on,
    apply: (state, p) => void setHidden(state, p.drugId!, p.on === true),
  },
  meet_dealer: {
    parse: none,
    allowed: (state, _p, content) => introBlock(state, content) === null,
    apply: (state, _p, content) => void meetDealer(state, content),
  },
  quit_drug: {
    parse: drugOnly,
    allowed: (state, p, content) => p.drugId !== undefined && quitBlock(state, p.drugId, content) === null,
    apply: (state, p, content) => void quitDrug(state, p.drugId!, content),
  },
  start_dealing: {
    parse: drugOnly,
    allowed: (state, p, content) => p.drugId !== undefined && startBlock(state, p.drugId, content) === null,
    apply: (state, p, content) => void startDealing(state, p.drugId!, content),
  },
  stop_dealing: {
    parse: none,
    allowed: (state) => state.drugs.dealing !== null,
    apply: (state, _p, content) => void stopDealing(state, content),
  },
  set_deal_price: {
    parse: (params) => {
      const dealPrice = field(params, 'dealPrice');
      return only(params, ['dealPrice']) && (DEAL_PRICES as readonly unknown[]).includes(dealPrice) ? { dealPrice: dealPrice as DealPrice } : null;
    },
    allowed: (state, p) => state.drugs.dealing !== null && p.dealPrice !== undefined,
    apply: (state, p) => void setDealPrice(state, p.dealPrice!),
  },
  set_deal_drug: {
    parse: drugOnly,
    allowed: (state, p, content) => state.drugs.dealing !== null && p.drugId !== undefined && drugDef(content, p.drugId) !== undefined,
    apply: (state, p, content) => void setDealDrug(state, p.drugId!, content),
  },
  sell_wholesale: {
    parse: drugOnly,
    allowed: (state, p, content) => p.drugId !== undefined && wholesaleBlock(state, p.drugId, content) === null,
    apply: (state, p, content) => void sellWholesale(state, p.drugId!, content),
  },
  start_operation: {
    parse: (params) => {
      const defId = idOf(field(params, 'defId'));
      const drugId = idOf(field(params, 'drugId'));
      return only(params, ['defId', 'drugId']) && defId !== undefined && drugId !== undefined ? { defId, drugId } : null;
    },
    allowed: (state, p, content) => p.defId !== undefined && p.drugId !== undefined && startOpBlock(state, p.defId, p.drugId, content) === null,
    apply: (state, p, content) => void startOp(state, p.defId!, p.drugId!, content),
  },
  set_operation: {
    parse: (params) => {
      const opId = idOf(field(params, 'opId'));
      const running = field(params, 'running');
      return only(params, ['opId', 'running']) && opId !== undefined && (running === 'low' || running === 'full') ? { opId, running } : null;
    },
    allowed: (state, p) => state.drugs.ops.some((o) => o.id === p.opId),
    apply: (state, p) => void setRunning(state, p.opId!, p.running!),
  },
  close_operation: {
    parse: (params) => {
      const opId = idOf(field(params, 'opId'));
      return only(params, ['opId']) && opId !== undefined ? { opId } : null;
    },
    allowed: (state, p) => state.drugs.ops.some((o) => o.id === p.opId),
    apply: (state, p, content) => {
      closeOp(state, p.opId!, content);
      syncAddiction(state, content);
    },
  },
};
