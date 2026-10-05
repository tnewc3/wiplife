/**
 * What the UI needs about what you own (E5), read through selectors: the
 * Belongings screen (pets, vehicles, vacation homes and the home you live
 * in, with what you can buy, sell, service and renovate), the Pets group in
 * the People tab and a pet's page. Everything money-related is a quote: what
 * it costs now, and why you can't if you can't.
 */
import type { ContentBundle, PetPersonalityId, PetSourceId, VehicleKindId } from '../../content/schemas';
import type { Id, LifeState, Possession, Renovation } from '../types';
import { activeRenovations, renovationQuote, vacationQuote, vacationSaleNet, type RenovationBlock, type RenovationTarget, type VacationQuote } from './homes';
import { petInteractionMenu } from './interact';
import { canVisitVet, petBlock, petPrice, vetCost, type PetBlock } from './pets';
import { possessionCosts } from './costs';
import { homeOf, livingPets, owedOn, petAge, petDef, petOf, possessionsValue, vacationHomesOf, vehicleAge, vehicleDef, vehicleOf, vehiclesOf } from './query';
import { canService, premium, recentClaims, saleNet, sellBlock, serviceCost, vehicleQuote, vehicleUpkeep, type VehicleQuote } from './vehicles';

export interface PetView {
  id: Id;
  name: string;
  species: string;
  personality: PetPersonalityId;
  age: number;
  /** Health and bond, 0–100 (the UI shows words). */
  health: number;
  bond: number;
  ill: boolean;
  /** You can take it to the vet now, what it costs, and whether you've been this year. */
  canVet: boolean;
  vetCost: number;
  vetDone: boolean;
}

export interface VehicleView {
  id: Id;
  name: string;
  kind: VehicleKindId;
  age: number;
  condition: number;
  value: number;
  insured: boolean;
  /** This year's premium (0 uninsured) and running costs. */
  premium: number;
  upkeep: number;
  /** What is still owed on its car loan, if any. */
  owed: number;
  canService: boolean;
  serviceCost: number;
  serviceDone: boolean;
  /** What selling would put in your hands after its loan (negative: the loan is more). */
  saleNet: number;
  /** Why it can't be sold now: your job needs it. */
  sellBlock: 'job' | null;
}

export interface VacationHomeView {
  id: Id;
  cityId: Id;
  city: string;
  value: number;
  condition: number;
  insured: boolean;
  owed: number;
  saleNet: number;
  /** Renovations that still count, by name. */
  renovations: string[];
}

export interface MainHomeView {
  value: number;
  renovations: string[];
}

export interface AdoptOption {
  id: Id;
  name: string;
  blurb: string;
  shelter: { price: number; block: PetBlock | null };
  breeder: { price: number; block: PetBlock | null };
  yearlyCost: number;
  lifespan: { min: number; max: number };
}

export interface VehicleOption {
  id: Id;
  name: string;
  blurb: string;
  kind: VehicleKindId;
  upkeep: number;
  newQuote: VehicleQuote;
  usedQuote: VehicleQuote | null;
}

export interface VacationOption {
  cityId: Id;
  city: string;
  quote: VacationQuote;
}

export interface RenovationOption {
  id: Id;
  name: string;
  blurb: string;
  sites: { target: RenovationTarget; label: string; cost: number; gain: number; blocked: RenovationBlock | null }[];
}

export interface BelongingsView {
  /** Between years, and not from prison: you can buy, sell and care for things now. */
  canAct: boolean;
  /** Old enough to adopt a pet yourself. */
  canAdopt: boolean;
  pets: PetView[];
  vehicles: VehicleView[];
  vacationHomes: VacationHomeView[];
  mainHome: MainHomeView | null;
  /** What you own is worth (vehicles and vacation homes). */
  worth: number;
  savings: number;
  /** What it costs to keep this year, and the claims that raise your premium. */
  upkeep: number;
  insurance: number;
  recentClaims: number;
  /** You have something insurance can cover, and whether all of it is insured now. */
  hasInsurable: boolean;
  allInsured: boolean;
  adopt: AdoptOption[];
  vehicleOptions: VehicleOption[];
  vacationOptions: VacationOption[];
  renovationOptions: RenovationOption[];
  /** Pets, vehicles and homes are all empty-handed. */
  empty: boolean;
}

const names = (list: readonly Renovation[], year: number, content: ContentBundle): string[] =>
  activeRenovations(list, year, content).flatMap((r) => (content.renovations[r.id] ? [content.renovations[r.id]!.name] : []));

function petView(state: LifeState, p: Possession, content: ContentBundle): PetView {
  const pet = petOf(p);
  return {
    id: p.id,
    name: p.name ?? '',
    species: petDef(content, p).name,
    personality: pet.personality,
    age: petAge(state, p),
    health: p.condition,
    bond: pet.bond,
    ill: pet.ill,
    canVet: state.phase === 'yearStart' && canVisitVet(state, p, content),
    vetCost: vetCost(state, p, content),
    vetDone: pet.vetYear === state.currentYear,
  };
}

/** The living pets, for the Pets group in the People tab. */
export function getPets(state: LifeState, content: ContentBundle): PetView[] {
  return livingPets(state).map((p) => petView(state, p, content));
}

function vehicleView(state: LifeState, p: Possession, content: ContentBundle): VehicleView {
  const v = vehicleOf(p);
  return {
    id: p.id,
    name: vehicleDef(content, p).name,
    kind: vehicleDef(content, p).kind,
    age: vehicleAge(state, p),
    condition: p.condition,
    value: p.value,
    insured: v.insured,
    premium: premium(state, p, content),
    upkeep: vehicleUpkeep(state, p, content),
    owed: owedOn(state, p),
    canService: state.phase === 'yearStart' && canService(state, p, content),
    serviceCost: serviceCost(state, p, content),
    serviceDone: v.serviceYear === state.currentYear,
    saleNet: saleNet(state, p, content),
    sellBlock: sellBlock(state, p, content),
  };
}

export function getBelongingsView(state: LifeState, content: ContentBundle): BelongingsView {
  const between = state.phase === 'yearStart' && state.housing.kind !== 'incarcerated';
  const year = state.currentYear;
  const pets = livingPets(state).map((p) => petView(state, p, content));
  const vehicles = vehiclesOf(state).map((p) => vehicleView(state, p, content));
  const homes = vacationHomesOf(state);
  const costs = possessionCosts(state, content);
  const h = state.housing;
  const owns = (h.kind === 'owned' || (h.kind === 'incarcerated' && h.homeValue !== undefined)) && h.homeValue !== undefined;
  const insurable = [...vehiclesOf(state), ...homes];

  const adopt: AdoptOption[] = Object.keys(content.pets)
    .sort()
    .map((id) => content.pets[id]!)
    .filter((def) => !def.retired)
    .map((def) => ({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      shelter: { price: petPrice(state, def.id, 'shelter' as PetSourceId, content), block: petBlock(state, def.id, 'shelter', content) },
      breeder: { price: petPrice(state, def.id, 'breeder' as PetSourceId, content), block: petBlock(state, def.id, 'breeder', content) },
      yearlyCost: Math.round(def.yearlyCost * (content.cities[state.character.cityId]?.costOfLiving ?? 1)),
      lifespan: def.lifespan,
    }));

  const vehicleOptions: VehicleOption[] = Object.keys(content.vehicles)
    .sort()
    .map((id) => content.vehicles[id]!)
    .filter((def) => !def.retired)
    .map((def) => ({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      kind: def.kind,
      upkeep: Math.round(def.upkeep * (content.cities[state.character.cityId]?.costOfLiving ?? 1)),
      newQuote: vehicleQuote(state, def.id, false, content),
      usedQuote: def.used ? vehicleQuote(state, def.id, true, content) : null,
    }));

  const vacationOptions: VacationOption[] = Object.keys(content.cities)
    .sort()
    .map((id) => content.cities[id]!)
    .filter((c) => !c.retired)
    .map((c) => ({ cityId: c.id, city: c.name, quote: vacationQuote(state, c.id, content) }));

  const sites: { target: RenovationTarget; label: string }[] = [
    ...(owns ? [{ target: 'main' as RenovationTarget, label: 'Your home' }] : []),
    ...homes.map((p) => ({ target: p.id as RenovationTarget, label: `Vacation home in ${content.cities[homeOf(p).cityId]?.name ?? ''}` })),
  ];
  const renovationOptions: RenovationOption[] = Object.keys(content.renovations)
    .sort()
    .map((id) => content.renovations[id]!)
    .filter((def) => !def.retired)
    .map((def) => ({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      sites: sites.map((s) => {
        const q = renovationQuote(state, s.target, def, content);
        return { target: s.target, label: s.label, cost: q.cost, gain: q.gain, blocked: q.blocked };
      }),
    }));

  return {
    canAct: between,
    canAdopt: state.character.age >= content.balance.possessions.pets.adoptAge,
    pets,
    vehicles,
    vacationHomes: homes.map((p) => ({
      id: p.id,
      cityId: homeOf(p).cityId,
      city: content.cities[homeOf(p).cityId]?.name ?? '',
      value: p.value,
      condition: p.condition,
      insured: homeOf(p).insured,
      owed: owedOn(state, p),
      saleNet: vacationSaleNet(state, p, content),
      renovations: names(homeOf(p).renovations, year, content),
    })),
    mainHome: owns ? { value: h.homeValue!, renovations: names(h.renovations ?? [], year, content) } : null,
    worth: possessionsValue(state),
    savings: state.finances.savings,
    upkeep: costs.upkeep,
    insurance: costs.insurance,
    recentClaims: recentClaims(state, content),
    hasInsurable: insurable.length > 0,
    allInsured: insurable.length > 0 && insurable.every((p) => (p.vehicle?.insured ?? p.home?.insured) === true),
    adopt,
    vehicleOptions,
    vacationOptions,
    renovationOptions,
    empty: state.possessions.items.length === 0 && !owns,
  };
}

export interface PetDetailView {
  pet: PetView;
  interactions: { id: Id; name: string; blurb: string }[];
}

/** A pet's page: how it is, and what you can do with it. */
export function getPetDetail(state: LifeState, petId: Id, content: ContentBundle): PetDetailView | null {
  const p = livingPets(state).find((q) => q.id === petId);
  if (!p) return null;
  return {
    pet: petView(state, p, content),
    interactions: petInteractionMenu(state, petId, content).map((d) => ({ id: d.id, name: d.name, blurb: d.blurb })),
  };
}
