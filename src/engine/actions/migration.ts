/**
 * Emigration actions (W6, More → Move abroad): apply for a way in, apply for permanent residence, citizenship or
 * status, withdraw, move on an approval, move without papers, go home, and set money sent home. The rules live in
 * ../migration, so an event's choice and the screen agree. The common checks (between years, input validation,
 * the input log) live in ./index.ts.
 */
import { z } from 'zod';
import { REGULARIZATION_BASES, REMIT_LEVELS, ROUTES } from '../../content/schemas';
import { chance } from '../rng';
import { countryIdOfCity } from '../country';
import { moveInCost } from '../housing';
import { earn } from '../finance';
import { barredFrom, entryBlock, naturalizationBlock, permanentBlock, regularizationBlock, startEntry, startNaturalization, startPermanent, startRegularization } from '../migration/routes';
import { emigrate, enterWithoutPapers, moveBlock, returnBlock, returnHome } from '../migration/move';
import { queueReceipt } from '../migration/queue';
import { isSettled, livingCountry, relativesAbroad } from '../migration/query';
import { citiesOfCountry } from '../country';
import type { LifeActionParams, LifeActionRule } from './life';

const entry = z.strictObject({ route: z.enum(ROUTES), countryId: z.enum(['us', 'ca', 'uk', 'mx']), cityId: z.string().min(1), majorId: z.string().min(1).optional(), tier: z.enum(['community', 'state', 'elite']).optional() });
const statusInput = z.strictObject({ kind: z.enum(['permanent', 'naturalization', 'regularization']), basis: z.enum(REGULARIZATION_BASES).optional() });
const cityInput = z.strictObject({ cityId: z.string().min(1) });
const remitInput = z.strictObject({ remit: z.enum(REMIT_LEVELS) });
const empty = z.strictObject({});

export const MIGRATION_ACTION_IDS = ['apply_entry', 'apply_status', 'withdraw_application', 'move_abroad', 'move_without_papers', 'return_home', 'set_remittance'] as const;

export const MIGRATION_ACTIONS: Record<(typeof MIGRATION_ACTION_IDS)[number], LifeActionRule> = {
  apply_entry: {
    parse: (params) => { const r = z.strictObject({ entry }).safeParse(params); return r.success ? ({ entry: r.data.entry } as LifeActionParams) : null; },
    allowed: (state, p, content) => !!p.entry && entryBlock(state, p.entry, content) === null,
    apply: (state, p, content) => {
      const before = state.finances.savings;
      startEntry(state, p.entry!, content);
      queueReceipt(state, content.registries.immigration.triggers.applied, before - state.finances.savings, content);
    },
  },
  apply_status: {
    parse: (params) => {
      const r = z.strictObject({ status: statusInput }).safeParse(params);
      if (!r.success || (r.data.status.kind === 'regularization') !== (r.data.status.basis !== undefined)) return null;
      return { status: r.data.status } as LifeActionParams;
    },
    allowed: (state, p, content) => {
      const s = p.status;
      if (!s) return false;
      if (s.kind === 'permanent') return permanentBlock(state, content) === null;
      if (s.kind === 'naturalization') return naturalizationBlock(state, content) === null;
      return regularizationBlock(state, s.basis!, content) === null;
    },
    apply: (state, p, content) => {
      const s = p.status!;
      const before = state.finances.savings;
      if (s.kind === 'permanent') startPermanent(state, content);
      else if (s.kind === 'naturalization') startNaturalization(state, content);
      else startRegularization(state, s.basis!, content);
      queueReceipt(state, content.registries.immigration.triggers.applied, before - state.finances.savings, content);
    },
  },
  withdraw_application: {
    parse: (params) => (empty.safeParse(params ?? {}).success ? {} : null),
    allowed: (state) => state.migration.application?.status === 'pending',
    apply: (state) => {
      const app = state.migration.application!;
      // What an investment application held comes back; fees do not.
      if (app.invested) earn(state, app.invested);
      state.migration.application = null;
      state.migration.counts.withdrawn = (state.migration.counts.withdrawn ?? 0) + 1;
    },
  },
  move_abroad: {
    parse: (params) => (empty.safeParse(params ?? {}).success ? {} : null),
    allowed: (state, _p, content) => {
      const app = state.migration.application;
      return !!app && app.kind === 'entry' && app.status === 'approved' && !!app.cityId && moveBlock(state, app.cityId, content) === null;
    },
    apply: (state, _p, content) => {
      const before = state.finances.savings;
      emigrate(state, content);
      queueReceipt(state, content.registries.immigration.triggers.arrived, before - state.finances.savings, content);
    },
  },
  move_without_papers: {
    parse: (params) => { const r = cityInput.safeParse(params); return r.success ? { cityId: r.data.cityId } : null; },
    allowed: (state, p, content) => {
      const cityId = p.cityId!;
      const countryId = countryIdOfCity(cityId, content);
      if (!content.cities[cityId] || content.cities[cityId]!.retired || !citiesOfCountry(countryId, content).includes(cityId)) return false;
      if (barredFrom(state, countryId, content) || livingCountry(state, content) === countryId || state.migration.application) return false;
      return state.finances.savings >= content.balance.immigration.undocumented.entry.cost + moveInCost(state, cityId, content) && moveBlock(state, cityId, content) === null;
    },
    apply: (state, p, content) => {
      const before = state.finances.savings;
      const turnedBack = chance(state.rng, content.balance.immigration.undocumented.entry.turnedBack);
      const arrived = enterWithoutPapers(state, p.cityId!, turnedBack, content);
      queueReceipt(state, content.registries.immigration.triggers[arrived ? 'arrived' : 'turnedBack'], before - state.finances.savings, content);
    },
  },
  return_home: {
    parse: (params) => { const r = cityInput.safeParse(params); return r.success ? { cityId: r.data.cityId } : null; },
    allowed: (state, p, content) => !!content.cities[p.cityId!] && returnBlock(state, p.cityId!, content) === null,
    apply: (state, p, content) => {
      const before = state.finances.savings;
      returnHome(state, p.cityId!, content);
      queueReceipt(state, content.registries.immigration.triggers.returned, before - state.finances.savings, content);
    },
  },
  set_remittance: {
    parse: (params) => { const r = remitInput.safeParse(params); return r.success ? { remit: r.data.remit } : null; },
    allowed: (state, p, content) => p.remit === 'none' ? state.migration.remit.level !== 'none' : isSettled(state, content) && relativesAbroad(state, content).length > 0,
    apply: (state, p) => { state.migration.remit.level = p.remit!; },
  },
};
