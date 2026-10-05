/**
 * Invariants for what you own (E5): every possession is real (its
 * definition exists, its numbers are in range, a pet lives within its
 * species' lifespan range), loans are attached to exactly one possession and
 * nothing else is a car loan or a second mortgage, limits hold, and only
 * someone old enough owns what they own.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { validPetName } from './pets';
import { petAge, VACATION_HOME } from './query';

export function possessionsFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const b = content.balance.possessions;
  const P = state.possessions;
  const age = state.character.age;
  const independence = content.balance.economy.independenceAge;
  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };

  const ids = new Set<string>();
  let highest = 0;
  const loans = new Map<string, string>();
  let pets = 0;
  let vehicles = 0;
  let homes = 0;
  for (const p of P.items) {
    const label = `possession ${p.id}`;
    if (!/^q[1-9][0-9]*$/.test(p.id)) fail(`${label} has a badly formed id`);
    if (ids.has(p.id)) fail(`${label} appears twice`);
    ids.add(p.id);
    highest = Math.max(highest, Number(p.id.slice(1)));
    if (!Number.isInteger(p.acquired) || p.acquired < state.birthYear || p.acquired > state.currentYear) fail(`${label} was acquired outside the life`);
    if (!Number.isSafeInteger(p.value) || p.value < 0) fail(`${label}.value must be a whole-dollar amount of at least 0`);
    score(`${label}.condition`, p.condition);
    const subs = [p.pet !== undefined, p.vehicle !== undefined, p.home !== undefined].filter(Boolean).length;
    if (subs !== 1) fail(`${label} has ${subs} kind records`);

    if (p.kind === 'pet') {
      const pet = p.pet;
      const def = content.pets[p.defId];
      if (!pet) {
        fail(`${label} is a pet without a pet record`);
        continue;
      }
      if (pet.died === undefined) pets += 1;
      if (!def) fail(`${label} is an unknown species "${p.defId}"`);
      if (p.value !== 0) fail(`${label} is a pet worth money`);
      if (!validPetName(p.name)) fail(`${label} has a bad name`);
      score(`${label}.bond`, pet.bond);
      if (!Number.isInteger(pet.startAge) || pet.startAge < 0) fail(`${label}.startAge is not a whole number of years`);
      if (def) {
        if (pet.lifespan < def.lifespan.min || pet.lifespan > def.lifespan.max) fail(`${label} has a lifespan of ${pet.lifespan}, outside its species' ${def.lifespan.min}–${def.lifespan.max}`);
        if (pet.startAge >= pet.lifespan) fail(`${label} was already past its lifespan when it came to you`);
        if (pet.died === undefined && petAge(state, p) > pet.lifespan) fail(`${label} lives past its lifespan`);
        if (pet.died !== undefined && petAge(state, p) < def.lifespan.min) fail(`${label} died at ${petAge(state, p)}, before its species' shortest life`);
      }
      if (pet.died !== undefined && (pet.died > state.currentYear || pet.died < p.acquired)) fail(`${label} died outside its time with you`);
      if (pet.interactions && (pet.interactions.year > state.currentYear || pet.interactions.gained > b.pets.bond.yearlyCap)) fail(`${label} has interaction counters from the future or above the yearly cap`);
      if (pet.interactions) for (const id of Object.keys(pet.interactions.counts)) if (!content.petInteractions[id]) fail(`${label} counts an unknown interaction "${id}"`);
    } else if (p.kind === 'vehicle') {
      const v = p.vehicle;
      if (!v) {
        fail(`${label} is a vehicle without a vehicle record`);
        continue;
      }
      vehicles += 1;
      if (!content.vehicles[p.defId]) fail(`${label} is an unknown vehicle "${p.defId}"`);
      if (age < b.drivingAge) fail(`${label}: you own a vehicle under the driving age ${b.drivingAge}`);
      if (!Number.isInteger(v.startAge) || v.startAge < 0) fail(`${label}.startAge is not a whole number of years`);
      if (v.loanDebtId !== undefined) {
        const debt = state.finances.debts.find((d) => d.id === v.loanDebtId);
        if (!debt || debt.kind !== 'auto') fail(`${label}.loanDebtId is not a car loan`);
        if (loans.has(v.loanDebtId)) fail(`loan ${v.loanDebtId} is on two possessions`);
        loans.set(v.loanDebtId, p.id);
      }
    } else {
      const h = p.home;
      if (!h) {
        fail(`${label} is a home without a home record`);
        continue;
      }
      homes += 1;
      if (p.defId !== VACATION_HOME) fail(`${label} is an unknown home "${p.defId}"`);
      if (!content.cities[h.cityId]) fail(`${label} is in an unknown city "${h.cityId}"`);
      if (age < independence) fail(`${label}: you own a vacation home under the independence age`);
      if (h.mortgageDebtId !== undefined) {
        const debt = state.finances.debts.find((d) => d.id === h.mortgageDebtId);
        if (!debt || debt.kind !== 'mortgage' || debt.id === state.housing.mortgageDebtId) fail(`${label}.mortgageDebtId is not its own mortgage`);
        if (loans.has(h.mortgageDebtId)) fail(`loan ${h.mortgageDebtId} is on two possessions`);
        loans.set(h.mortgageDebtId, p.id);
      }
      for (const r of h.renovations) if (!content.renovations[r.id] || r.year > state.currentYear) fail(`${label} has a bad renovation "${r.id}"`);
    }
  }
  if (P.nextId <= highest) fail('possessions.nextId is not past every possession id');
  if (pets > b.limits.pets) fail(`${pets} pets (the limit is ${b.limits.pets})`);
  if (vehicles > b.limits.vehicles) fail(`${vehicles} vehicles (the limit is ${b.limits.vehicles})`);
  if (homes > b.limits.vacationHomes) fail(`${homes} vacation homes (the limit is ${b.limits.vacationHomes})`);

  // Loans: a car loan is on a vehicle; the only mortgage besides your home's is on a vacation home.
  for (const d of state.finances.debts) {
    if (d.kind === 'auto' && !loans.has(d.id) && d.missed >= 0) {
      // A car loan sent nowhere: only ever in collections (which is its own kind), so this is a loan without a car.
      fail(`car loan ${d.id} is not on any vehicle`);
    }
    if (d.kind === 'mortgage' && d.id !== state.housing.mortgageDebtId && !loans.has(d.id)) fail(`mortgage ${d.id} is not on a home you own`);
  }

  for (const y of P.claims) if (!Number.isInteger(y) || y > state.currentYear || y < state.birthYear) fail('an insurance claim from outside the life');
  if (!Number.isInteger(P.noVehicleYears) || P.noVehicleYears < 0) fail('possessions.noVehicleYears must be a whole number of at least 0');

  // Renovations on the home you live in need that home.
  const h = state.housing;
  const owns = h.kind === 'owned' || (h.kind === 'incarcerated' && h.homeValue !== undefined);
  if (h.renovations && (!owns || h.renovations.length === 0)) fail('renovations without an owned home (or an empty list)');
  for (const r of h.renovations ?? []) if (!content.renovations[r.id] || r.year > state.currentYear) fail(`the home has a bad renovation "${r.id}"`);
  return failures;
}
