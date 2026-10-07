/**
 * Belongings actions (E5, More → Belongings): adopt or buy a pet, a vet
 * visit, buy a vehicle (cash or a car loan), sell one, a full service,
 * insurance on or off, buy or sell a vacation home, renovate. Each takes
 * effect at once, between years; all money goes through the finance module.
 * The common checks (between years, input validation, the input log) live
 * in ./index.ts.
 */
import { PET_SOURCES, type ContentBundle, type PetSourceId } from '../../content/schemas';
import { canVisitVet, petBlock, takePetIn, validPetName, visitVet } from '../possessions/pets';
import { buyVacationHome, renovate, renovationQuote, sellVacationHome, vacationQuote } from '../possessions/homes';
import { possessionById, vacationHomesOf, vehiclesOf } from '../possessions/query';
import { buyVehicle, canService, sellBlock, sellVehicle, serviceVehicle, setVehicleInsurance, vehicleQuote } from '../possessions/vehicles';
import { setHomeInsurance } from '../possessions/homes';
import type { LifeState } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const POSSESSION_ACTION_IDS = [
  'adopt_pet',
  'vet_visit',
  'buy_vehicle',
  'sell_vehicle',
  'service_vehicle',
  'set_insurance',
  'buy_vacation_home',
  'sell_vacation_home',
  'renovate',
] as const;
export type PossessionActionId = (typeof POSSESSION_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;
const text = (params: unknown, key: string): string | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined;
};

/** Parameters that must be exactly these keys (so nothing extra slips into the input log). */
const only = (params: unknown, keys: readonly string[]): boolean =>
  typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));

const owns = (state: LifeState, id: string | undefined, kind: 'pet' | 'vehicle' | 'home') => {
  const p = possessionById(state, id);
  return p !== undefined && p.kind === kind && p.pet?.died === undefined ? p : undefined;
};

export const POSSESSION_ACTIONS: Record<PossessionActionId, LifeActionRule> = {
  adopt_pet: {
    parse: (params) => {
      const source = field(params, 'source');
      const defId = text(params, 'defId');
      const name = field(params, 'name');
      if (!only(params, ['defId', 'source', 'name']) || defId === undefined || !(PET_SOURCES as readonly unknown[]).includes(source) || source === 'stray' || !validPetName(name)) return null;
      return { defId, source: source as PetSourceId, name: name.trim() };
    },
    allowed: (state, p, content) => p.defId !== undefined && p.source !== undefined && petBlock(state, p.defId, p.source, content) === null,
    apply: (state, p, content) => void takePetIn(state, p.defId!, p.source!, p.name!, content),
  },
  vet_visit: {
    parse: (params) => {
      const possessionId = text(params, 'possessionId');
      return only(params, ['possessionId']) && possessionId !== undefined ? { possessionId } : null;
    },
    allowed: (state, p, content) => {
      const pet = owns(state, p.possessionId, 'pet');
      return pet !== undefined && canVisitVet(state, pet, content);
    },
    apply: (state, p, content) => visitVet(state, p.possessionId!, content),
  },
  buy_vehicle: {
    parse: (params) => {
      const defId = text(params, 'defId');
      const used = field(params, 'used');
      const loan = field(params, 'loan');
      if (!only(params, ['defId', 'used', 'loan']) || defId === undefined || typeof used !== 'boolean' || typeof loan !== 'boolean') return null;
      return { defId, used, loan };
    },
    allowed: (state, p, content) => {
      if (p.defId === undefined || p.used === undefined) return false;
      const quote = vehicleQuote(state, p.defId, p.used, content);
      return (p.loan ? quote.loan.block : quote.cashBlock) === null;
    },
    apply: (state, p, content) => void buyVehicle(state, p.defId!, p.used!, p.loan!, content),
  },
  sell_vehicle: {
    parse: (params) => {
      const possessionId = text(params, 'possessionId');
      return only(params, ['possessionId']) && possessionId !== undefined ? { possessionId } : null;
    },
    allowed: (state, p, content) => {
      const v = owns(state, p.possessionId, 'vehicle');
      return v !== undefined && sellBlock(state, v, content) === null;
    },
    apply: (state, p, content) => sellVehicle(state, p.possessionId!, content),
  },
  service_vehicle: {
    parse: (params) => {
      const possessionId = text(params, 'possessionId');
      return only(params, ['possessionId']) && possessionId !== undefined ? { possessionId } : null;
    },
    allowed: (state, p, content) => {
      const v = owns(state, p.possessionId, 'vehicle');
      return v !== undefined && canService(state, v, content);
    },
    apply: (state, p, content) => serviceVehicle(state, p.possessionId!, content),
  },
  set_insurance: {
    parse: (params) => {
      const insured = field(params, 'insured');
      return only(params, ['insured']) && typeof insured === 'boolean' ? { insured } : null;
    },
    allowed: (state, p) => {
      const items = [...vehiclesOf(state), ...vacationHomesOf(state)];
      return items.length > 0 && items.some((i) => (i.vehicle?.insured ?? i.home?.insured) !== p.insured);
    },
    apply: (state, p) => {
      setVehicleInsurance(state, p.insured!);
      setHomeInsurance(state, p.insured!);
    },
  },
  buy_vacation_home: {
    parse: (params, content: ContentBundle) => {
      const cityId = text(params, 'cityId');
      return only(params, ['cityId']) && cityId !== undefined && content.cities[cityId] && !content.cities[cityId]!.retired ? { cityId } : null;
    },
    allowed: (state, p, content) => p.cityId !== undefined && vacationQuote(state, p.cityId, content).blocked === null,
    apply: (state, p, content) => void buyVacationHome(state, p.cityId!, content),
  },
  sell_vacation_home: {
    parse: (params) => {
      const possessionId = text(params, 'possessionId');
      return only(params, ['possessionId']) && possessionId !== undefined ? { possessionId } : null;
    },
    allowed: (state, p) => owns(state, p.possessionId, 'home') !== undefined,
    apply: (state, p, content) => sellVacationHome(state, p.possessionId!, content),
  },
  renovate: {
    parse: (params, content: ContentBundle) => {
      const renovationId = text(params, 'renovationId');
      const target = text(params, 'target');
      return only(params, ['renovationId', 'target']) && renovationId !== undefined && target !== undefined && content.renovations[renovationId] ? { renovationId, target } : null;
    },
    allowed: (state, p, content) => p.renovationId !== undefined && p.target !== undefined && renovationQuote(state, p.target, content.renovations[p.renovationId], content).blocked === null,
    apply: (state, p, content) => renovate(state, p.target!, content.renovations[p.renovationId!]!, content),
  },
};

export type { LifeActionParams };
