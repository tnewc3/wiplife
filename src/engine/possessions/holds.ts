/**
 * The `belongings` condition (E5): what you own. Counts compare directly;
 * the fields about one pet, one vehicle or one home hold for the possession
 * the event is bound to (its cast holds the id) or, with none bound, for any
 * you own that fits every field given.
 */
import type { BelongingsCondition, ContentBundle } from '../../content/schemas';
import type { Id, LifeState, Possession } from '../types';
import { compare } from '../conditions';
import { castPossession, livingPets, petAge, petOf, vacationHomesOf, vehicleAge, vehicleOf, vehiclesOf } from './query';

const PET_FIELDS = ['species', 'personality', 'petAge', 'petHealth', 'petBond', 'petIll'] as const;
const VEHICLE_FIELDS = ['vehicleKind', 'vehicleDef', 'vehicleAge', 'vehicleCondition', 'insured', 'loan'] as const;

const has = (q: BelongingsCondition, keys: readonly (keyof BelongingsCondition)[]) => keys.some((k) => q[k] !== undefined);

export function belongingsHolds(q: BelongingsCondition, state: LifeState, cast: Record<string, Id> | undefined, content: ContentBundle | undefined): boolean {
  const pets = livingPets(state);
  const vehicles = vehiclesOf(state);
  const homes = vacationHomesOf(state);
  if (q.pets && !compare(pets.length, q.pets)) return false;
  if (q.vehicles && !compare(vehicles.length, q.vehicles)) return false;
  if (q.vacationHomes && !compare(homes.length, q.vacationHomes)) return false;

  if (has(q, PET_FIELDS)) {
    const bound = castPossession(state, cast, 'pet', 'pet');
    const fits = (p: Possession): boolean => {
      const pet = petOf(p);
      if (q.species && !q.species.includes(p.defId)) return false;
      if (q.personality && !q.personality.includes(pet.personality)) return false;
      if (q.petAge && !compare(petAge(state, p), q.petAge)) return false;
      if (q.petHealth && !compare(p.condition, q.petHealth)) return false;
      if (q.petBond && !compare(pet.bond, q.petBond)) return false;
      if (q.petIll !== undefined && pet.ill !== q.petIll) return false;
      return true;
    };
    if (!(bound ? fits(bound) : pets.some(fits))) return false;
  }

  if (has(q, VEHICLE_FIELDS)) {
    const bound = castPossession(state, cast, 'vehicle', 'vehicle');
    const fits = (p: Possession): boolean => {
      const v = vehicleOf(p);
      if (q.vehicleKind && !(content && q.vehicleKind.includes(content.vehicles[p.defId]?.kind ?? 'car'))) return false;
      if (q.vehicleDef && !q.vehicleDef.includes(p.defId)) return false;
      if (q.vehicleAge && !compare(vehicleAge(state, p), q.vehicleAge)) return false;
      if (q.vehicleCondition && !compare(p.condition, q.vehicleCondition)) return false;
      if (q.insured !== undefined && v.insured !== q.insured) return false;
      if (q.loan !== undefined && (v.loanDebtId !== undefined) !== q.loan) return false;
      return true;
    };
    if (!(bound ? fits(bound) : vehicles.some(fits))) return false;
  }

  if (q.renovated !== undefined) {
    const bound = castPossession(state, cast, 'home', 'home');
    const renovated = (p: Possession) => (p.home?.renovations.length ?? 0) > 0;
    const main = (state.housing.renovations?.length ?? 0) > 0;
    if ((bound ? renovated(bound) : main || homes.some(renovated)) !== q.renovated) return false;
  }

  if (q.claims) {
    const years = content?.balance.possessions.vehicles.insurance.claim.years;
    if (years === undefined) return false;
    if (!compare(state.possessions.claims.filter((y) => state.currentYear - y < years).length, q.claims)) return false;
  }
  return true;
}
