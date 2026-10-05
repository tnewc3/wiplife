/**
 * What your possessions cost to keep each year (E5), as the ledger charges
 * it: upkeep (pets' food and care, vehicles' fuel, parking and routine
 * upkeep, vacation homes' property tax and maintenance) and insurance
 * (vehicle premiums, vacation home cover). A mortgage or car loan is paid as
 * a debt. Children's pets are paid for by the family: nothing is charged
 * before the independence age. In prison your pets are looked after and
 * your vehicles stored (nothing charged); your vacation homes still cost.
 */
import type { ContentBundle } from '../../content/schemas';
import { isIndependent, wholeDollars } from '../finance';
import { livingCost } from '../housing';
import type { LifeState } from '../types';
import { vacationUpkeep } from './homes';
import { petUpkeep } from './pets';
import { vehiclesOf } from './query';
import { premium, vehicleUpkeep } from './vehicles';

export interface PossessionCosts {
  upkeep: number;
  insurance: number;
}

export function possessionCosts(state: LifeState, content: ContentBundle): PossessionCosts {
  if (!isIndependent(state, content) || state.possessions.items.length === 0) return { upkeep: 0, insurance: 0 };
  const homes = vacationUpkeep(state, content);
  if (state.housing.kind === 'incarcerated') return homes;
  const cars = vehiclesOf(state);
  // Living costs already pay for getting around: owning a vehicle replaces that, upkeep first, then insurance.
  let covered = cars.length > 0 ? wholeDollars(livingCost(state, content) * content.balance.possessions.vehicles.transportShare) : 0;
  const carUpkeep = cars.reduce((sum, p) => sum + vehicleUpkeep(state, p, content), 0);
  const carInsurance = cars.reduce((sum, p) => sum + premium(state, p, content), 0);
  const fromUpkeep = Math.min(covered, carUpkeep);
  covered -= fromUpkeep;
  const fromInsurance = Math.min(covered, carInsurance);
  return {
    upkeep: petUpkeep(state, content) + carUpkeep - fromUpkeep + homes.upkeep,
    insurance: carInsurance - fromInsurance + homes.insurance,
  };
}
