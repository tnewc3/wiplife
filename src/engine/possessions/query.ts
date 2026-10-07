/**
 * Reading what you own (E5): pets, vehicles and vacation homes, their ages
 * and values, and the definitions behind them. Pure; the rules that change
 * them are in the files beside this one.
 */
import { POSSESSION_ROLES, type ContentBundle, type PetDef, type VehicleDef } from '../../content/schemas';
import type { Id, LifeState, PetState, Possession, PossessionKind, PossessionsState, VacationState, VehicleState } from '../types';

/** A life with nothing yet. */
export function emptyPossessions(): PossessionsState {
  return { items: [], nextId: 1, claims: [], noVehicleYears: 0 };
}

/** The definition id every vacation home has. */
export const VACATION_HOME = 'vacation_home';

/** What you own of one kind, in id order (a pet that has died this year doesn't count). */
export function ownedOf(state: LifeState, kind: PossessionKind): Possession[] {
  return state.possessions.items.filter((p) => p.kind === kind && p.pet?.died === undefined);
}

export const livingPets = (state: LifeState): Possession[] => ownedOf(state, 'pet');
export const vehiclesOf = (state: LifeState): Possession[] => ownedOf(state, 'vehicle');
export const vacationHomesOf = (state: LifeState): Possession[] => ownedOf(state, 'home');

export function possessionById(state: LifeState, id: Id | undefined): Possession | undefined {
  return id === undefined ? undefined : state.possessions.items.find((p) => p.id === id);
}

/** You own a vehicle you can drive. */
export function hasVehicle(state: LifeState): boolean {
  return vehiclesOf(state).length > 0;
}

/** A pet's record (the caller has checked the possession is a pet). */
export const petOf = (p: Possession): PetState => p.pet!;
export const vehicleOf = (p: Possession): VehicleState => p.vehicle!;
export const homeOf = (p: Possession): VacationState => p.home!;

/** A pet's age in whole years: how old it was, plus the years since. */
export function petAge(state: LifeState, p: Possession): number {
  return petOf(p).startAge + Math.max(0, (petOf(p).died ?? state.currentYear) - p.acquired);
}

/** A vehicle's age in whole years. */
export function vehicleAge(state: LifeState, p: Possession): number {
  return vehicleOf(p).startAge + Math.max(0, state.currentYear - p.acquired);
}

export function petDef(content: ContentBundle, p: Possession): PetDef {
  const def = content.pets[p.defId];
  if (!def) throw new Error(`Unknown pet "${p.defId}"`);
  return def;
}

export function vehicleDef(content: ContentBundle, p: Possession): VehicleDef {
  const def = content.vehicles[p.defId];
  if (!def) throw new Error(`Unknown vehicle "${p.defId}"`);
  return def;
}

/** What a city's cost of living does to a price. */
export function costOfLiving(state: LifeState, content: ContentBundle, cityId: Id = state.character.cityId): number {
  return content.cities[cityId]?.costOfLiving ?? 1;
}

/** The loan or mortgage attached to a possession, if any. */
export function loanIdOf(p: Possession): Id | undefined {
  return p.vehicle?.loanDebtId ?? p.home?.mortgageDebtId;
}

/** What is still owed on a possession. */
export function owedOn(state: LifeState, p: Possession): number {
  const id = loanIdOf(p);
  return id === undefined ? 0 : (state.finances.debts.find((d) => d.id === id)?.balance ?? 0);
}

/** Debt ids attached to possessions (the estate and the invariants treat them apart from your other debts). */
export function attachedDebtIds(state: LifeState): Set<Id> {
  const ids = new Set<Id>();
  for (const p of state.possessions.items) {
    const id = loanIdOf(p);
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

/** What your vehicles and vacation homes are worth in all (a pet is worth nothing). */
export function possessionsValue(state: LifeState): number {
  let total = 0;
  for (const p of state.possessions.items) if (p.kind !== 'pet') total += p.value;
  return total;
}

/** The possession a cast refers to for this kind (an event bound it), if it still exists. */
export function castPossession(state: LifeState, cast: Record<string, Id> | undefined, role: keyof typeof POSSESSION_ROLES, kind: PossessionKind): Possession | undefined {
  const p = possessionById(state, cast?.[POSSESSION_ROLES[role]]);
  return p && p.kind === kind ? p : undefined;
}

/** A readable name for a possession's text: a pet's species, a vehicle's name, a vacation home's city. */
export function possessionNoun(p: Possession, content: ContentBundle): string {
  if (p.kind === 'pet') return content.pets[p.defId]?.name ?? 'pet';
  if (p.kind === 'vehicle') return content.vehicles[p.defId]?.name ?? 'vehicle';
  return content.cities[p.home?.cityId ?? '']?.name ?? 'home';
}

/** The next possession id (q1, q2...), moving the counter on. */
export function nextPossessionId(state: LifeState): Id {
  const id = `q${state.possessions.nextId}`;
  state.possessions.nextId += 1;
  return id;
}

/** A debt that was paid off or moved elsewhere (to collections) is no longer the loan on anything. */
export function detachDebt(state: LifeState, debtId: Id): void {
  for (const p of state.possessions.items) {
    if (p.vehicle?.loanDebtId === debtId) delete p.vehicle.loanDebtId;
    if (p.home?.mortgageDebtId === debtId) delete p.home.mortgageDebtId;
  }
}
