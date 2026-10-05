/**
 * The `possession` event effect (E5): damage and theft, a pet turning up,
 * a pet's health and bond, a vet visit, a pet leaving or dying, insurance on
 * or off. An effect acts on the possession the event is bound to (its cast
 * holds the possession's id under a pseudo-role, like the story in E4);
 * everything is paid or paid out through the finance module.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { damageHome, setHomeInsurance } from './homes';
import { addPet, petDiesNow, petLeaves, randomPetName, vetCost } from './pets';
import { castPossession, livingPets, petOf } from './query';
import { damageVehicle, refreshVehicleValue, sellVehicle, setVehicleInsurance, stealVehicle } from './vehicles';
import { spend } from '../finance';

type PossessionEffect = Extract<Effect, { type: 'possession' }>;

export function applyPossessionEffect(state: LifeState, effect: PossessionEffect, cast: Record<string, Id>, content: ContentBundle): void {
  const pet = castPossession(state, cast, 'pet', 'pet');
  switch (effect.action) {
    case 'vehicle_damage': {
      const p = castPossession(state, cast, 'vehicle', 'vehicle');
      if (p) damageVehicle(state, p, effect.severity!, content);
      return;
    }
    case 'vehicle_stolen': {
      const p = castPossession(state, cast, 'vehicle', 'vehicle');
      if (p) stealVehicle(state, p, content);
      return;
    }
    case 'vehicle_sell': {
      const p = castPossession(state, cast, 'vehicle', 'vehicle');
      if (p) sellVehicle(state, p.id, content);
      return;
    }
    case 'vehicle_condition': {
      const p = castPossession(state, cast, 'vehicle', 'vehicle');
      if (p) {
        p.condition = clampInt(p.condition + effect.delta!, 0, 100);
        refreshVehicleValue(state, p, content);
      }
      return;
    }
    case 'home_damage': {
      const p = castPossession(state, cast, 'home', 'home');
      if (p) damageHome(state, p, effect.severity!, content);
      return;
    }
    case 'pet_adopt':
      // Only if there is room, and the species is real (a retired one is not taken in).
      if (livingPets(state).length < content.balance.possessions.limits.pets && content.pets[effect.species!] && !content.pets[effect.species!]!.retired) {
        addPet(state, effect.species!, effect.source!, randomPetName(state, content), content);
      }
      return;
    case 'pet_health':
      if (pet && petOf(pet).died === undefined) pet.condition = clampInt(pet.condition + effect.delta!, 0, 100);
      return;
    case 'pet_bond':
      if (pet && petOf(pet).died === undefined) petOf(pet).bond = clampInt(petOf(pet).bond + effect.delta!, 0, 100);
      return;
    case 'pet_vet':
      if (pet && petOf(pet).died === undefined) {
        spend(state, vetCost(state, pet, content), content);
        petOf(pet).ill = false;
        petOf(pet).vetYear = state.currentYear;
        pet.condition = clampInt(pet.condition + content.balance.possessions.pets.health.vet.checkup, 0, 100);
      }
      return;
    case 'pet_leaves':
      if (pet && petOf(pet).died === undefined) petLeaves(state, pet, content);
      return;
    case 'pet_dies':
      if (pet) petDiesNow(state, pet, content);
      return;
    case 'insure':
      setVehicleInsurance(state, effect.insured!);
      setHomeInsurance(state, effect.insured!);
      return;
  }
}

