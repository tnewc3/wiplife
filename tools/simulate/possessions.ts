/**
 * Pets, vehicles and homes, simulated and measured (E5): the simulated
 * player's choices (adopting, vet visits, buying and selling cars, services,
 * a vacation home, renovations, spending time with pets), and what they lead
 * to: how many lives own a pet, how long pets live against their species'
 * ranges, who owns a vehicle, accident and claim rates, what insurance and
 * upkeep cost, and how many buy a vacation home or renovate. The watcher
 * compares each year's state before and after `beginYear`, so nothing here
 * touches the engine.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { weightedPick } from '../../src/engine/random';
import { chance, nextFloat, pick, type RngState } from '../../src/engine/rng';
import { canVisitVet } from '../../src/engine/possessions/pets';
import { petAge, petDef, petOf, livingPets, vacationHomesOf, vehiclesOf } from '../../src/engine/possessions/query';
import { premium, vehicleQuote } from '../../src/engine/possessions/vehicles';
import { renovationQuote } from '../../src/engine/possessions/homes';
import { canInteractWithPet } from '../../src/engine/possessions/interact';
import type { Id, LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type PossessionAction = [LifeActionId, LifeActionParams];

/** Chances describing the simulated player (like the other bots'), not the game. */
const POLICY = {
  /** A yearly chance of wanting a pet when none lives with you, for those who like animals and those who don't. */
  adopt: { fond: 0.04, indifferent: 0.005 },
  fond: 0.3,
  /** From a breeder rather than a shelter. */
  breeder: 0.25,
  /** Takes an ill pet to the vet, and (otherwise) goes for a checkup. */
  vetIll: 0.85,
  vetCheckup: 0.12,
  /** Wants a vehicle each year without one, from this age (those who need one for work always do). */
  wantVehicle: 0.22,
  vehicleAge: 18,
  /** Buys used rather than new when it can. */
  used: 0.65,
  /** Services a vehicle in worse condition than this, with this chance. */
  service: { below: 70, chance: 0.4 },
  /** Sells (and replaces) a vehicle in worse condition than this. */
  replace: { below: 15, chance: 0.4 },
  /** A vacation home, for those who dream of one: a yearly chance (the bank and savings decide the rest). */
  vacation: { chance: 0.03 },
  /** Renovates the home it owns with a yearly chance, if savings are twice the cost. */
  renovate: 0.06,
  /** Time with each pet a year: this many interactions at most. */
  petInteractions: 3,
};

export interface PossessionProfile {
  /** Likes animals: adopts far more often. */
  fond: boolean;
  /** What they like to drive: weights of vehicle ids. */
  taste: 'sensible' | 'family' | 'flashy';
  /** Dreams of a place away from home. */
  dreamer: boolean;
}

export function rollPossessionProfile(rng: RngState): PossessionProfile {
  const t = nextFloat(rng);
  return { fond: chance(rng, POLICY.fond), taste: t < 0.6 ? 'sensible' : t < 0.85 ? 'family' : 'flashy', dreamer: chance(rng, 0.15) };
}

const TASTE: Record<PossessionProfile['taste'], Record<string, number>> = {
  sensible: { hatchback: 4, sedan: 4, electric_car: 1, suv: 1, pickup_truck: 1, minivan: 0.5, sports_car: 0.1, motorcycle: 0.3 },
  family: { minivan: 3, suv: 3, sedan: 2, hatchback: 1, pickup_truck: 1, electric_car: 1, sports_car: 0.05, motorcycle: 0.1 },
  flashy: { sports_car: 3, motorcycle: 2, pickup_truck: 1.5, suv: 1.5, electric_car: 1.5, sedan: 1, hatchback: 0.5, minivan: 0.1 },
};
const PET_TASTE: Record<string, number> = { dog: 5, cat: 5, rabbit: 1, hamster: 1, parakeet: 0.7, goldfish: 1, bearded_dragon: 0.5, guinea_pig: 0.8 };
const NAMES = ['Biscuit', 'Juniper', 'Pepper', 'Waffles', 'Mochi', 'Bean', 'Clover', 'Otis'];

/** The belongings actions the simulated player takes this year, drawing from `rng`. */
export function choosePossessionActions(life: LifeState, content: ContentBundle, rng: RngState, profile: PossessionProfile): PossessionAction[] {
  const out: PossessionAction[] = [];
  const can = (id: LifeActionId, params: LifeActionParams) => isLifeActionAvailable(life, id, params, content);
  const age = life.character.age;
  if (life.phase !== 'yearStart') return out;

  // Pets: adopt when there is none, and keep them healthy.
  const pets = livingPets(life);
  if (pets.length === 0 && chance(rng, profile.fond ? POLICY.adopt.fond : POLICY.adopt.indifferent)) {
    const options = Object.keys(content.pets).sort().map((id) => [id, PET_TASTE[id] ?? 1] as const);
    const defId = weightedPick(rng, options);
    const source = chance(rng, POLICY.breeder) ? 'breeder' : 'shelter';
    const params: LifeActionParams = { defId, source, name: pick(rng, NAMES) };
    if (can('adopt_pet', params)) out.push(['adopt_pet', params]);
  }
  for (const p of pets) {
    if (!canVisitVet(life, p, content)) continue;
    if (chance(rng, petOf(p).ill ? POLICY.vetIll : POLICY.vetCheckup)) out.push(['vet_visit', { possessionId: p.id }]);
  }

  // Vehicles: buy one when wanted, service it, replace it when it is worn out.
  const vehicles = vehiclesOf(life);
  const worksAtCar = life.career.job !== null && (content.jobs[life.career.job.jobId]?.vehicle ?? 0) > 0;
  if (vehicles.length === 0 && age >= POLICY.vehicleAge && chance(rng, worksAtCar ? 0.6 : POLICY.wantVehicle)) {
    const defId = weightedPick(rng, Object.entries(TASTE[profile.taste]).filter(([id]) => content.vehicles[id]));
    const used = content.vehicles[defId]!.used && chance(rng, POLICY.used);
    for (const choice of [used, !used]) {
      const quote = vehicleQuote(life, defId, choice, content);
      if (quote.cashBlock === null && can('buy_vehicle', { defId, used: choice, loan: false })) {
        out.push(['buy_vehicle', { defId, used: choice, loan: false }]);
        break;
      }
      if (quote.loan.block === null && can('buy_vehicle', { defId, used: choice, loan: true })) {
        out.push(['buy_vehicle', { defId, used: choice, loan: true }]);
        break;
      }
    }
  }
  for (const v of vehicles) {
    if (v.condition < POLICY.service.below && chance(rng, POLICY.service.chance) && can('service_vehicle', { possessionId: v.id })) out.push(['service_vehicle', { possessionId: v.id }]);
    else if (v.condition < POLICY.replace.below && chance(rng, POLICY.replace.chance) && can('sell_vehicle', { possessionId: v.id })) out.push(['sell_vehicle', { possessionId: v.id }]);
  }

  // A vacation home, for the well off who dream of one.
  if (profile.dreamer && age >= 30 && vacationHomesOf(life).length === 0 && chance(rng, POLICY.vacation.chance)) {
    const cities = Object.keys(content.cities).sort();
    const cityId = pick(rng, cities);
    if (can('buy_vacation_home', { cityId })) out.push(['buy_vacation_home', { cityId }]);
  }

  // Renovations: the home you own, then a vacation home.
  if (chance(rng, POLICY.renovate)) {
    const sites = [...(life.housing.homeValue !== undefined && life.housing.kind === 'owned' ? ['main'] : []), ...vacationHomesOf(life).map((p) => p.id)];
    const renos = Object.keys(content.renovations).sort();
    if (sites.length > 0) {
      const target = pick(rng, sites);
      const renovationId = pick(rng, renos);
      const q = renovationQuote(life, target, content.renovations[renovationId], content);
      if (q.blocked === null && life.finances.savings >= q.cost * 2 && can('renovate', { renovationId, target })) out.push(['renovate', { renovationId, target }]);
    }
  }
  return out;
}

/** The pet interactions the simulated player does this year: [interactionId, petId]. The careless player is left out. */
export function choosePetInteractions(life: LifeState, content: ContentBundle, rng: RngState): [string, Id][] {
  const out: [string, Id][] = [];
  const ids = Object.keys(content.petInteractions).sort().filter((id) => !content.petInteractions[id]!.retired);
  if (ids.length === 0) return out;
  for (const p of livingPets(life)) {
    if (!canInteractWithPet(life, p.id)) continue;
    const n = Math.floor(nextFloat(rng) * (POLICY.petInteractions + 1));
    for (let i = 0; i < n; i++) out.push([pick(rng, ids), p.id]);
  }
  return out;
}

export interface PetSpeciesStats {
  /** Pets of this species that joined you, died of age or illness, and lived within the species' range. */
  joined: number;
  died: number;
  inRange: number;
  /** Ages at death. */
  ages: number[];
}

export interface PossessionsReport {
  /** Lives, and the lives that reached 30 and 50. */
  lives: number;
  reached30: number;
  reached50: number;
  pets: {
    /** Lives that reached 30 that ever had a pet. */
    owners30: number;
    petsJoined: number;
    byWay: { adopted: number; stray: number };
    species: Record<string, PetSpeciesStats>;
    deaths: number;
    deathsInRange: number;
    left: number;
    illYears: number;
    petYears: number;
    vetVisits: number;
    interactions: number;
    /** Bond (0–100) at the end of each year, summed over pet-years, and years in prison with a pet. */
    bondTotal: number;
    /** Lives that lost a pet and saw the passing event. */
    passingEvents: number;
  };
  vehicles: {
    owners30: number;
    bought: { new: number; used: number; cash: number; loan: number };
    sold: number;
    lost: number;
    vehicleYears: number;
    insuredYears: number;
    serviced: number;
    accidents: { minor: number; major: number; total: number; drunk: number };
    claims: number;
    /** What the ledger charged for insurance, summed over years with a vehicle, and the years. */
    insurance: { total: number; years: number };
    /** What an insured vehicle's premium came to (before the transport already in your living costs), summed over insured vehicle-years. */
    premiums: { total: number; years: number };
    upkeep: { total: number; years: number };
    /** Years with a vehicle where upkeep and insurance were counted, and income in them (for the share). */
    incomeInOwnerYears: number;
    jobsLostNoVehicle: number;
  };
  homes: {
    reached50Owners: number;
    vacationLives: number;
    vacationBought: number;
    vacationSold: number;
    vacationForeclosed: number;
    renovationLives: number;
    renovations: number;
    mainRenovations: number;
    homeOwners: number;
  };
  eventsFired: number;
  invariantFailures: number;
}

export function emptyPossessionsReport(content: ContentBundle): PossessionsReport {
  return {
    lives: 0,
    reached30: 0,
    reached50: 0,
    pets: {
      owners30: 0,
      petsJoined: 0,
      byWay: { adopted: 0, stray: 0 },
      species: Object.fromEntries(Object.keys(content.pets).sort().map((id) => [id, { joined: 0, died: 0, inRange: 0, ages: [] }])),
      deaths: 0,
      deathsInRange: 0,
      left: 0,
      illYears: 0,
      petYears: 0,
      vetVisits: 0,
      interactions: 0,
      bondTotal: 0,
      passingEvents: 0,
    },
    vehicles: {
      owners30: 0,
      bought: { new: 0, used: 0, cash: 0, loan: 0 },
      sold: 0,
      lost: 0,
      vehicleYears: 0,
      insuredYears: 0,
      serviced: 0,
      accidents: { minor: 0, major: 0, total: 0, drunk: 0 },
      claims: 0,
      insurance: { total: 0, years: 0 },
      premiums: { total: 0, years: 0 },
      upkeep: { total: 0, years: 0 },
      incomeInOwnerYears: 0,
      jobsLostNoVehicle: 0,
    },
    homes: { reached50Owners: 0, vacationLives: 0, vacationBought: 0, vacationSold: 0, vacationForeclosed: 0, renovationLives: 0, renovations: 0, mainRenovations: 0, homeOwners: 0 },
    eventsFired: 0,
    invariantFailures: 0,
  };
}

const median = (xs: number[]) => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);

/** Watches one life: each year's change in what it owns. */
export class PossessionsWatcher {
  private everPet = false;
  private everVehicle = false;
  private everVacation = false;
  private everRenovated = false;
  private everOwnedHome = false;
  private readonly accident: Map<string, 'minor' | 'major' | 'total' | 'drunk'>;
  private readonly petEvents: Set<string>;
  private known = new Map<Id, { defId: string; age: number; died: boolean }>();

  constructor(
    private readonly r: PossessionsReport,
    private readonly content: ContentBundle,
  ) {
    this.accident = new Map();
    for (const [kind, list] of Object.entries(content.registries.possessions.accidents)) for (const id of list.events) this.accident.set(id, kind as 'minor' | 'major' | 'total' | 'drunk');
    this.petEvents = new Set(content.registries.possessions.petDied.events);
  }

  /** An action the player took. */
  acted(actionId: LifeActionId, params: LifeActionParams): void {
    const v = this.r.vehicles;
    if (actionId === 'adopt_pet') this.r.pets.byWay.adopted++;
    if (actionId === 'vet_visit') this.r.pets.vetVisits++;
    if (actionId === 'buy_vehicle') {
      v.bought[params.used ? 'used' : 'new']++;
      v.bought[params.loan ? 'loan' : 'cash']++;
    }
    if (actionId === 'sell_vehicle') v.sold++;
    if (actionId === 'service_vehicle') v.serviced++;
    if (actionId === 'buy_vacation_home') this.r.homes.vacationBought++;
    if (actionId === 'sell_vacation_home') this.r.homes.vacationSold++;
    if (actionId === 'renovate') {
      this.r.homes.renovations++;
      if (params.target === 'main') this.r.homes.mainRenovations++;
    }
  }

  /** A pet interaction the player did. */
  petInteraction(): void {
    this.r.pets.interactions++;
  }

  /** A year has begun: `before` is the life as the year began, `after` as the pipeline left it (events picked). */
  observe(before: LifeState, after: LifeState, content: ContentBundle): void {
    const r = this.r;
    const v = r.vehicles;
    // Pets: who is new, who died, who left.
    const now = new Map<Id, { defId: string; age: number; died: boolean }>();
    for (const p of after.possessions.items) {
      if (p.kind !== 'pet') continue;
      const pet = petOf(p);
      now.set(p.id, { defId: p.defId, age: petAge(after, p), died: pet.died !== undefined });
      if (!this.known.has(p.id)) {
        r.pets.petsJoined++;
        r.pets.species[p.defId]!.joined++;
        this.everPet = true;
      }
      if (pet.died === undefined) {
        r.pets.petYears++;
        r.pets.bondTotal += pet.bond;
        if (pet.ill) r.pets.illYears++;
      } else if (!this.known.get(p.id)?.died) {
        const def = petDef(content, p);
        const age = petAge(after, p);
        const stats = r.pets.species[p.defId]!;
        stats.died++;
        stats.ages.push(age);
        r.pets.deaths++;
        if (age >= def.lifespan.min && age <= def.lifespan.max) {
          stats.inRange++;
          r.pets.deathsInRange++;
        }
      }
    }
    for (const [id, was] of this.known) if (!now.has(id) && !was.died) r.pets.left++;
    this.known = now;
    for (const p of after.pending) if (this.petEvents.has(p.eventId)) r.pets.passingEvents++;

    // Vehicles.
    const cars = vehiclesOf(after);
    if (cars.length > 0) this.everVehicle = true;
    const inside = after.housing.kind === 'incarcerated';
    if (cars.length > 0 && !inside) {
      v.vehicleYears += cars.length;
      v.insuredYears += cars.filter((c) => c.vehicle!.insured).length;
      for (const c of cars.filter((x) => x.vehicle!.insured)) {
        v.premiums.total += premium(after, c, this.content);
        v.premiums.years += 1;
      }
    }
    const ledger = after.finances.lastLedger;
    if (cars.length > 0 && ledger?.year === after.currentYear && !inside) {
      v.insurance.total += ledger.insurance;
      v.insurance.years += 1;
      v.upkeep.total += ledger.upkeep;
      v.upkeep.years += 1;
      v.incomeInOwnerYears += ledger.gross + ledger.retirement;
    }
    for (const p of after.pending) {
      const kind = this.accident.get(p.eventId);
      if (kind) v.accidents[kind]++;
    }
    if (after.history.some((h) => h.year === after.currentYear && h.tags.includes('noVehicleJobLost'))) v.jobsLostNoVehicle++;

    // Homes.
    const homes = vacationHomesOf(after);
    if (homes.length > 0) this.everVacation = true;
    if (after.housing.kind === 'owned') this.everOwnedHome = true;
    if ((after.housing.renovations?.length ?? 0) > 0 || homes.some((h) => h.home!.renovations.length > 0)) this.everRenovated = true;
    if (before.possessions.items.filter((p) => p.kind === 'home').length > homes.length) {
      // A vacation home went (sold, foreclosed or lost): the foreclosures show in the history.
      const foreclosed = after.history.some((h) => h.year === after.currentYear && h.tags.includes('vacationForeclosed'));
      if (foreclosed) r.homes.vacationForeclosed++;
    }
  }

  finish(life: LifeState): void {
    const r = this.r;
    r.lives++;
    const age = life.character.age;
    if (age >= 30) {
      r.reached30++;
      if (this.everPet) r.pets.owners30++;
      if (this.everVehicle) r.vehicles.owners30++;
    }
    if (age >= 50) {
      r.reached50++;
      if (this.everOwnedHome) r.homes.reached50Owners++;
    }
    r.vehicles.claims += life.possessions.claims.length;
    if (this.everVacation) r.homes.vacationLives++;
    if (this.everRenovated) r.homes.renovationLives++;
    if (this.everOwnedHome) r.homes.homeOwners++;
  }
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 2) => (d === 0 ? 'n/a' : (n / d).toFixed(digits));

/** The E5 section of the simulation report. */
export function formatPossessions(r: PossessionsReport, content: ContentBundle, events: SimulationReport['events']): string[] {
  const lines: string[] = ['', 'Pets, vehicles and homes (E5):'];
  lines.push(`  lives ${r.lives}; reached 30: ${r.reached30}; reached 50: ${r.reached50}`);
  const p = r.pets;
  lines.push(
    `  pets: ${pct(p.owners30, r.reached30)} of lives reaching 30 ever had one; ${p.petsJoined} joined (${p.byWay.adopted} adopted or bought, ${p.petsJoined - p.byWay.adopted} came through events); ` +
      `${p.petYears} pet-years, ${pct(p.illYears, p.petYears)} of them ill; ${p.vetVisits} vet visits; ${p.interactions} interactions; mean bond ${per(p.bondTotal, p.petYears, 1)}`,
  );
  lines.push(`  pet deaths: ${p.deaths}, ${pct(p.deathsInRange, p.deaths)} within the species' lifespan range; ${p.left} left some other way; ${p.passingEvents} passing events`);
  for (const [id, s] of Object.entries(p.species)) {
    const def = content.pets[id]!;
    lines.push(`    ${id.padEnd(15)} joined ${String(s.joined).padStart(5)}  died ${String(s.died).padStart(5)}  median age at death ${s.ages.length ? median(s.ages) : '-'} (range ${def.lifespan.min}–${def.lifespan.max})  ${pct(s.inRange, s.died)} in range`);
  }
  const v = r.vehicles;
  lines.push(
    `  vehicles: ${pct(v.owners30, r.reached30)} of lives reaching 30 ever owned one; bought ${v.bought.new + v.bought.used} (${v.bought.new} new, ${v.bought.used} used; ${v.bought.cash} cash, ${v.bought.loan} loan); ` +
      `${v.sold} sold; ${v.serviced} services; ${v.vehicleYears} vehicle-years (${pct(v.insuredYears, v.vehicleYears)} insured)`,
  );
  const accidents = v.accidents.minor + v.accidents.major + v.accidents.total;
  lines.push(
    `  accidents: ${accidents} (${v.accidents.minor} minor, ${v.accidents.major} major, ${v.accidents.total} total) = ${per(100 * accidents, v.vehicleYears)} per 100 vehicle-years; ${v.accidents.drunk} drunk-driving incidents; ${v.claims} insurance claims`,
  );
  lines.push(
    `  costs: insurance $${per(v.insurance.total, v.insurance.years, 0)} a year, upkeep $${per(v.upkeep.total, v.upkeep.years, 0)} a year; together ${pct(v.insurance.total + v.upkeep.total, v.incomeInOwnerYears)} of income in owner-years`,
  );
  const h = r.homes;
  lines.push(
    `  homes: ${pct(h.vacationLives, r.lives)} of lives owned a vacation home (${h.vacationBought} bought, ${h.vacationSold} sold, ${h.vacationForeclosed} foreclosed); ` +
      `${pct(h.renovationLives, h.homeOwners + h.vacationLives)} of those who owned a home renovated (${h.renovations} renovations, ${h.mainRenovations} on the home they lived in)`,
  );
  const fired = Object.values(content.events)
    .filter((def) => !def.retired && ['pets', 'vehicles', 'property'].includes(def.category))
    .map((def) => [def.id, events.find((e) => e.id === def.id)?.fired ?? 0] as const);
  const total = fired.reduce((sum, [, n]) => sum + n, 0);
  lines.push(`  events: ${fired.filter(([, n]) => n > 0).length}/${fired.length} pets, vehicle and property events fired, ${total} times in all`);
  lines.push(`  invariant failures in this section's checks: ${r.invariantFailures}`);
  return lines;
}

/** The E5 targets (balance/targets.yaml, possessions), judged on the careful player's lives. */
export function possessionsTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.possessions;
  const r = report.possessions;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    const text = `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`;
    out.push({ label, value: fmt(value), short: fmt(value), goal: text, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('lives reaching 30 that ever had a pet', share(r.pets.owners30, r.reached30), t.petOwners);
  range('pets that died within their species lifespan range', share(r.pets.deathsInRange, r.pets.deaths), t.petLifespanInRange);
  range('lives reaching 30 that ever owned a vehicle', share(r.vehicles.owners30, r.reached30), t.vehicleOwners);
  const accidents = r.vehicles.accidents.minor + r.vehicles.accidents.major + r.vehicles.accidents.total;
  range('accidents per 100 vehicle-years', (100 * accidents) / Math.max(1, r.vehicles.vehicleYears), t.accidentsPer100Years, (n) => n.toFixed(2));
  range('yearly insurance for an insured vehicle ($)', r.vehicles.premiums.total / Math.max(1, r.vehicles.premiums.years), t.insurancePerYear, (n) => n.toFixed(0));
  range('upkeep and insurance as a share of income in owner-years', share(r.vehicles.insurance.total + r.vehicles.upkeep.total, r.vehicles.incomeInOwnerYears), t.carCostShare);
  range('lives that owned a vacation home', share(r.homes.vacationLives, r.lives), t.vacationHomeLives);
  range('home owners who renovated', share(r.homes.renovationLives, Math.max(1, r.homes.homeOwners + r.homes.vacationLives)), t.renovationLives);
  range('share of pet-years spent ill', share(r.pets.illYears, r.pets.petYears), t.illShare);
  return out;
}
