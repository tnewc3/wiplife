/** Scenario builders for the possessions tests (E5): give a life a pet, a vehicle (with a car loan) or a vacation home. */
import { produce } from 'immer';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { addDebt } from '../finance';
import type { Id, LifeState } from '../types';
import { addPet } from './pets';
import { nextPossessionId, VACATION_HOME } from './query';
import { refreshVehicleValue } from './vehicles';

export interface PossessionOptions {
  pets?: { species?: string; name?: string; age?: number; bond?: number; health?: number; personality?: 'playful' | 'anxious' | 'stubborn' | 'lazy' }[];
  vehicles?: { defId?: string; condition?: number; startAge?: number; loan?: number; insured?: boolean }[];
  vacation?: { cityId?: string; value?: number; mortgage?: number; insured?: boolean }[];
}

/** The life with these possessions (ids q1, q2... in the order given: pets, vehicles, vacation homes). */
export function withPossessions(life: LifeState, opts: PossessionOptions, bundle: ContentBundle = content): LifeState {
  return produce(life, (d) => {
    for (const p of opts.pets ?? []) {
      const pet = addPet(d, p.species ?? 'dog', 'shelter', p.name ?? 'Biscuit', bundle);
      d.history.pop();
      if (p.age !== undefined) pet.pet!.startAge = Math.max(0, p.age - (d.currentYear - pet.acquired));
      if (p.bond !== undefined) pet.pet!.bond = p.bond;
      if (p.health !== undefined) pet.condition = p.health;
      if (p.personality !== undefined) pet.pet!.personality = p.personality;
    }
    for (const v of opts.vehicles ?? []) {
      const id = nextPossessionId(d);
      const vehicle: NonNullable<LifeState['possessions']['items'][number]['vehicle']> = { startAge: v.startAge ?? 2, insured: v.insured ?? true };
      if (v.loan) vehicle.loanDebtId = addDebt(d, 'auto', v.loan, bundle).id;
      d.possessions.items.push({ id, kind: 'vehicle', defId: v.defId ?? 'sedan', acquired: d.currentYear - 1, value: 0, condition: v.condition ?? 70, vehicle });
      refreshVehicleValue(d, d.possessions.items.at(-1)!, bundle);
    }
    for (const h of opts.vacation ?? []) {
      const id = nextPossessionId(d);
      const cityId: Id = h.cityId ?? d.character.cityId;
      const home: NonNullable<LifeState['possessions']['items'][number]['home']> = { cityId, insured: h.insured ?? true, renovations: [] };
      if (h.mortgage) home.mortgageDebtId = addDebt(d, 'mortgage', h.mortgage, bundle).id;
      d.possessions.items.push({ id, kind: 'home', defId: VACATION_HOME, acquired: d.currentYear - 1, value: h.value ?? 250_000, condition: 80, home });
    }
  });
}
