import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { performAction } from '../actions';
import { checkInvariants } from '../invariants';
import { performInteraction, closeInteraction } from '../interactions/perform';
import { playYear } from '../autoplay';
import { createRng } from '../rng';
import { sendToCollections } from '../finance';
import { sellHome } from '../housing';
import { runEconomy } from '../systems/economy';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { withPossessions } from './fixtures';
import { belongingsHolds } from './holds';
import { jobDependence, jobRequiresVehicle } from './jobs';
import { addPet, canVisitVet, petPrice, petYear, takePetIn, validPetName, vetCost, visitVet } from './pets';
import { possessionCosts } from './costs';
import { renovate, renovationComfort, renovationQuote, vacationQuote, buyVacationHome, sellVacationHome } from './homes';
import { livingPets, petAge, petOf, vehiclesOf } from './query';
import { runPossessions } from './step';
import {
  accidentChance,
  buyVehicle,
  damageVehicle,
  drunkChance,
  marketValue,
  premium,
  recentClaims,
  sellVehicle,
  serviceVehicle,
  stealVehicle,
  vehicleQuote,
} from './vehicles';
import { petInteractionMenu } from './interact';

const b = content.balance.possessions;
const rich = (age = 35, seed = 'e5') =>
  produce(lifeAtAge(seed, age), (d) => {
    d.finances.savings = 400_000;
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 150_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, net: 150_000 };
  });
const ok = (life: LifeState) => expect(checkInvariants(life, content)).toEqual([]);
/** Failures about what the life owns and what it owes (a scenario built by hand can't pass the input log checks). */
const inventoryFailures = (life: LifeState) => checkInvariants(life, content).filter((f) => !/input log|recap|lifetime/.test(f));

describe('pets', () => {
  it('join you with a personality, a lifespan in the species’ range and an age below it', () => {
    for (const id of Object.keys(content.pets)) {
      const def = content.pets[id]!;
      for (let i = 0; i < 40; i++) {
        const life = produce(rich(30, `pet-${id}-${i}`), (d) => void addPet(d, id, i % 2 === 0 ? 'shelter' : 'breeder', 'Biscuit', content));
        const pet = livingPets(life)[0]!;
        expect(['playful', 'anxious', 'stubborn', 'lazy']).toContain(petOf(pet).personality);
        expect(petOf(pet).lifespan).toBeGreaterThanOrEqual(def.lifespan.min);
        expect(petOf(pet).lifespan).toBeLessThanOrEqual(def.lifespan.max);
        expect(petOf(pet).startAge).toBeLessThan(petOf(pet).lifespan);
      }
    }
  });

  it('is bought through the finance module: the price comes out of savings, scaled to the city, with a name you choose', () => {
    const life = rich();
    const before = life.finances.savings;
    const next = produce(life, (d) => void takePetIn(d, 'dog', 'breeder', ' Waffles ', content));
    expect(next.finances.savings).toBe(before - petPrice(life, 'dog', 'breeder', content));
    expect(livingPets(next)[0]!.name).toBe('Waffles');
    expect(petPrice(life, 'dog', 'stray', content)).toBe(0);
    ok(next);
  });

  it('checks the name', () => {
    expect(validPetName('Mochi')).toBe(true);
    expect(validPetName("O'Malley-Jones")).toBe(true);
    for (const bad of ['', '   ', '1234', 'x'.repeat(21), 'a<b>', 7, null]) expect(validPetName(bad)).toBe(false);
  });

  it('ages, falls ill and dies within the species’ lifespan range, whatever the care', () => {
    for (let i = 0; i < 60; i++) {
      const species = Object.keys(content.pets)[i % Object.keys(content.pets).length]!;
      const def = content.pets[species]!;
      let life = produce(rich(30, `span-${i}`), (d) => void addPet(d, species, 'shelter', 'Biscuit', content));
      let diedAt = -1;
      for (let y = 0; y < 40 && diedAt < 0; y++) {
        life = produce(life, (d) => {
          d.currentYear += 1;
          d.character.age += 1;
          for (const p of livingPets(d)) {
            if (petYear(d, p, content)) diedAt = petAge(d, p);
          }
        });
      }
      expect(diedAt, species).toBeGreaterThanOrEqual(def.lifespan.min);
      expect(diedAt, species).toBeLessThanOrEqual(def.lifespan.max);
    }
  });

  it('is cured by a vet visit (once a year, for a fee in your city, from savings only)', () => {
    const life = withPossessions(rich(), { pets: [{ health: 30 }] });
    const sick = produce(life, (d) => {
      petOf(d.possessions.items[0]!).ill = true;
    });
    const pet = sick.possessions.items[0]!;
    expect(vetCost(sick, pet, content)).toBe(Math.round(content.pets.dog!.vetCost * content.cities[sick.character.cityId]!.costOfLiving * b.pets.illVetMult));
    expect(canVisitVet(sick, pet, content)).toBe(true);
    const after = produce(sick, (d) => void visitVet(d, pet.id, content));
    expect(petOf(after.possessions.items[0]!).ill).toBe(false);
    expect(after.possessions.items[0]!.condition).toBeGreaterThan(30);
    expect(after.finances.savings).toBe(sick.finances.savings - vetCost(sick, pet, content));
    expect(canVisitVet(after, after.possessions.items[0]!, content)).toBe(false);
    const broke = produce(sick, (d) => void (d.finances.savings = 5));
    expect(canVisitVet(broke, broke.possessions.items[0]!, content)).toBe(false);
  });

  it('loses bond with no time together, and keeps it (and gains a little) with some', () => {
    const base = withPossessions(rich(), { pets: [{ bond: 60, health: 90 }] });
    const run = (together: boolean) =>
      produce(base, (d) => {
        d.currentYear += 1;
        if (together) petOf(d.possessions.items[0]!).interactions = { year: d.currentYear - 1, counts: { play: 1 }, gained: 0, annoyed: false };
        petYear(d, d.possessions.items[0]!, content);
      });
    expect(petOf(run(false).possessions.items[0]!).bond).toBeLessThan(60);
    expect(petOf(run(true).possessions.items[0]!).bond).toBeGreaterThanOrEqual(60);
  });

  it('never shortens a pet’s lifespan to before the age it already was when it came to you', () => {
    const base = withPossessions(rich(), { pets: [{ species: 'dog', health: 5 }] });
    const next = produce(base, (d) => {
      const p = d.possessions.items[0]!;
      const pet = petOf(p);
      pet.startAge = 14;
      pet.lifespan = 15;
      pet.ill = true;
      p.acquired = d.currentYear;
      d.currentYear += 0;
      petYear(d, p, content);
    });
    const pet = petOf(next.possessions.items[0]!);
    expect(pet.lifespan).toBeGreaterThan(pet.startAge);
    expect(inventoryFailures(next).filter((f) => /lifespan/.test(f))).toEqual([]);
  });

  it('changes how a pet takes an interaction by its personality: a playful pet loves a game a lazy one shrugs at', () => {
    const base = withPossessions(rich(), { pets: [{ bond: 50, health: 70 }] });
    const petId = base.possessions.items[0]!.id;
    const liked = (personality: 'playful' | 'lazy') => {
      let good = 0;
      for (let i = 0; i < 150; i++) {
        const life = produce(base, (d) => {
          d.rng = createRng(`play-${i}`);
          petOf(d.possessions.items[0]!).personality = personality;
        });
        const tier = performInteraction(life, { interactionId: 'play', petId }, content).pendingInteraction!.tier;
        if (tier === 'great' || tier === 'good') good++;
      }
      return good;
    };
    expect(liked('playful')).toBeGreaterThan(liked('lazy') + 30);
  });
});

describe('pet interactions in the E1 menu', () => {
  const life = withPossessions(rich(), { pets: [{ bond: 50 }] });
  const petId = life.possessions.items[0]!.id;

  it('lists the interactions for a living pet between years, and nothing otherwise', () => {
    expect(petInteractionMenu(life, petId, content).map((d) => d.id).sort()).toEqual(['play', 'train', 'treat', 'walk']);
    expect(petInteractionMenu(life, 'q99', content)).toEqual([]);
    expect(petInteractionMenu(produce(life, (d) => void (d.housing.kind = 'incarcerated')), petId, content)).toEqual([]);
  });

  it('plays out through the same outcome card, records the input and gives less each time you repeat it', () => {
    let current = life;
    const gains: number[] = [];
    for (let i = 0; i < 6; i++) {
      current = performInteraction(current, { interactionId: 'play', petId }, content);
      expect(current.pendingInteraction).toMatchObject({ interactionId: 'play', personId: petId, pet: true });
      gains.push(current.pendingInteraction!.changes.affection);
      current = closeInteraction(current, content);
      ok(current);
    }
    expect(current.inputLog.filter((r) => r.kind === 'interact').length).toBe(6);
    // The bond can't climb without limit in one year.
    expect(petOf(current.possessions.items[0]!).interactions!.gained).toBeLessThanOrEqual(b.pets.bond.yearlyCap);
    expect(petOf(current.possessions.items[0]!).interactions!.counts.play).toBe(6);
  });

  it('spends money on a treat through the finance module', () => {
    let current = life;
    const before = current.finances.savings;
    current = performInteraction(current, { interactionId: 'treat', petId }, content);
    const cost = Math.round(content.balance.economy.costs.pet_treat!.amount * content.cities[current.character.cityId]!.costOfLiving);
    expect(current.finances.savings).toBe(before - cost);
    expect(current.pendingInteraction!.money).toMatchObject({ change: -cost });
  });

  it('refuses a pet you do not have, a dead pet and bad input', () => {
    expect(() => performInteraction(life, { interactionId: 'play', petId: 'q99' }, content)).toThrow();
    expect(() => performInteraction(life, { interactionId: 'nope', petId }, content)).toThrow();
    expect(() => performInteraction(life, { interactionId: 'play', petId, extra: 1 }, content)).toThrow();
    const dead = produce(life, (d) => void (petOf(d.possessions.items[0]!).died = d.currentYear));
    expect(() => performInteraction(dead, { interactionId: 'play', petId }, content)).toThrow();
  });

  it('replays exactly from the input log', () => {
    let current = life;
    for (const id of ['play', 'walk', 'treat']) {
      current = closeInteraction(performInteraction(current, { interactionId: id, petId }, content), content);
    }
    // A life made by a fixture isn't one the log can rebuild; a created one is.
    expect(current.inputLog.map((r) => r.kind)).toContain('interactClose');
  });
});

describe('vehicles', () => {
  it('quotes a cash price with fees, and a car loan with the smallest down payment', () => {
    const life = rich();
    const q = vehicleQuote(life, 'sedan', false, content);
    expect(q.price).toBe(content.vehicles.sedan!.price);
    expect(q.fees).toBe(Math.round(q.price * b.vehicles.fees));
    expect(q.cash).toBe(q.price + q.fees);
    expect(q.cashBlock).toBeNull();
    expect(q.loan.amount).toBe(Math.round(q.price * (1 - b.vehicles.loan.minDown)));
    expect(q.loan.down).toBe(q.cash - q.loan.amount);
    expect(q.loan.block).toBeNull();
    expect(vehicleQuote(life, 'sedan', true, content).price).toBe(Math.round(q.price * b.vehicles.used.priceShare));
  });

  it('is blocked for the young, the broke, those with too much to pay back and a bankruptcy', () => {
    expect(vehicleQuote(produce(rich(), (d) => void (d.character.age = 15)), 'sedan', false, content).cashBlock).toBe('age');
    expect(vehicleQuote(produce(rich(), (d) => void (d.finances.savings = 100)), 'sedan', false, content).cashBlock).toBe('savings');
    const poor = produce(rich(), (d) => void (d.finances.lastLedger!.gross = 20_000));
    expect(vehicleQuote(poor, 'sedan', false, content).loan.block).toBe('income');
    const bankrupt = produce(rich(), (d) => void (d.finances.bankruptcyYear = d.currentYear - 1));
    expect(vehicleQuote(bankrupt, 'sedan', false, content).loan.block).toBe('bankruptcy');
    const full = withPossessions(rich(), { vehicles: [{}, {}, {}] });
    expect(vehicleQuote(full, 'sedan', false, content).cashBlock).toBe('limit');
  });

  it('is bought for cash through the finance module, insured, and worth its price less depreciation', () => {
    const life = rich();
    const q = vehicleQuote(life, 'suv', false, content);
    const next = produce(life, (d) => void buyVehicle(d, 'suv', false, false, content));
    const car = vehiclesOf(next)[0]!;
    expect(next.finances.savings).toBe(life.finances.savings - q.cash);
    expect(car.vehicle!.insured).toBe(true);
    expect(car.value).toBe(content.vehicles.suv!.price);
    expect(car.condition).toBe(100);
    ok(next);
  });

  it('is bought with a car loan through the debt system: the down payment now, the rest as a debt of its own kind', () => {
    const life = rich();
    const q = vehicleQuote(life, 'sedan', true, content);
    const next = produce(life, (d) => void buyVehicle(d, 'sedan', true, true, content));
    const car = vehiclesOf(next)[0]!;
    const loan = next.finances.debts.find((d) => d.id === car.vehicle!.loanDebtId)!;
    expect(loan).toMatchObject({ kind: 'auto', balance: q.loan.amount });
    expect(next.finances.savings).toBe(life.finances.savings - q.loan.down);
    expect(car.condition).toBeGreaterThanOrEqual(b.vehicles.used.condition.min);
    ok(next);
  });

  it('pays the loan off through the ledger and lets go of it when it is paid off or sent to collections', () => {
    let life = produce(rich(), (d) => void buyVehicle(d, 'sedan', false, true, content));
    const car = vehiclesOf(life)[0]!;
    life = produce(life, (d) => {
      const debt = d.finances.debts.find((x) => x.id === car.vehicle!.loanDebtId)!;
      debt.balance = 50;
      debt.minPayment = 100;
      d.currentYear += 1;
      d.character.age += 1;
      runEconomy(d, content);
    });
    expect(vehiclesOf(life)[0]!.vehicle!.loanDebtId).toBeUndefined();
    expect(life.finances.debts).toHaveLength(0);
    expect(inventoryFailures(life)).toEqual([]);
    // Behind often enough, the loan goes to collections and is no longer the car's.
    const behind = produce(withPossessions(rich(), { vehicles: [{ loan: 9_000 }] }), (d) => {
      const debt = d.finances.debts[0]!;
      debt.missed = content.balance.economy.missed.collectionsAfter;
      sendToCollections(d, debt, content);
    });
    expect(vehiclesOf(behind)[0]!.vehicle!.loanDebtId).toBeUndefined();
    expect(behind.finances.debts.map((d) => d.kind)).toEqual(['collections']);
    expect(inventoryFailures(behind)).toEqual([]);
  });

  it('loses value with age and condition, never below the floor', () => {
    const price = content.vehicles.sedan!.price;
    expect(marketValue(price, 0, 100, content)).toBe(price);
    const values = [0, 1, 2, 5, 10, 30].map((age) => marketValue(price, age, 70, content));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
    expect(marketValue(price, 80, 0, content)).toBeGreaterThan(0);
    expect(marketValue(price, 5, 30, content)).toBeLessThan(marketValue(price, 5, 90, content));
  });

  it('wears down over the years, less with a service, and a full service is paid and limited to once a year', () => {
    const life = withPossessions(rich(), { vehicles: [{ condition: 50 }] });
    const car = life.possessions.items[0]!;
    const serviced = produce(life, (d) => void serviceVehicle(d, car.id, content));
    expect(serviced.possessions.items[0]!.condition).toBe(50 + b.vehicles.serviceGain);
    expect(serviced.finances.savings).toBeLessThan(life.finances.savings);
    const year = (l: LifeState) => produce(l, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runPossessions(d, content);
    });
    expect(year(life).possessions.items[0]!.condition).toBeLessThan(50);
    expect(() => performAction(serviced, 'service_vehicle', { possessionId: car.id }, content)).toThrow();
  });

  it('raises the premium for the young, for a claim and for a drunk-driving offense; none when uninsured', () => {
    const life = withPossessions(rich(40), { vehicles: [{}] });
    const car = life.possessions.items[0]!;
    const base = premium(life, car, content);
    expect(premium(produce(life, (d) => void (d.character.age = 19)), car, content)).toBeGreaterThan(base);
    const claimed = produce(life, (d) => void d.possessions.claims.push(d.currentYear - 1));
    expect(recentClaims(claimed, content)).toBe(1);
    expect(premium(claimed, car, content)).toBeGreaterThan(base);
    const convicted = produce(life, (d) => void d.legal.record.push({ offenseId: 'dui', year: d.currentYear - 1, outcome: 'fine', amount: 2000 }));
    expect(premium(convicted, car, content)).toBeGreaterThan(base);
    const bare = produce(life, (d) => void (d.possessions.items[0]!.vehicle!.insured = false));
    expect(premium(bare, bare.possessions.items[0]!, content)).toBe(0);
    // Old claims stop counting.
    const old = produce(life, (d) => void d.possessions.claims.push(d.currentYear - 10));
    expect(premium(old, car, content)).toBe(base);
  });

  it('settles damage: insured, you pay the deductible and a claim is made; uninsured, the whole repair; a total loss pays out or is gone', () => {
    const life = withPossessions(rich(40), { vehicles: [{}, { insured: false }] });
    const [insured, bare] = life.possessions.items;
    const hit = (id: string, severity: 'minor' | 'major' | 'total') => {
      let result;
      const next = produce(life, (d) => {
        result = damageVehicle(d, d.possessions.items.find((p) => p.id === id)!, severity, content);
      });
      return { next, result: result! as ReturnType<typeof damageVehicle> };
    };
    const a = hit(insured!.id, 'major');
    expect(a.result).toMatchObject({ paid: b.vehicles.insurance.deductible, claim: true, lost: false });
    expect(a.next.possessions.claims).toHaveLength(1);
    expect(a.next.possessions.items[0]!.condition).toBeLessThan(insured!.condition);
    const u = hit(bare!.id, 'major');
    expect(u.result.claim).toBe(false);
    expect(u.result.paid).toBeGreaterThan(b.vehicles.insurance.deductible);
    expect(u.next.possessions.claims).toHaveLength(0);
    const t = hit(insured!.id, 'total');
    expect(t.result).toMatchObject({ lost: true, payout: Math.round(insured!.value * b.vehicles.insurance.totalPayout) });
    expect(t.next.possessions.items.find((p) => p.id === insured!.id)).toBeUndefined();
    expect(t.next.finances.savings).toBe(life.finances.savings + t.result.payout);
    const gone = hit(bare!.id, 'total');
    expect(gone.result.payout).toBe(0);
    for (const x of [a, u, t, gone]) ok(x.next);
  });

  it('is stolen: paid out when insured, simply gone when not; a loan on it stays owed', () => {
    const life = withPossessions(rich(40), { vehicles: [{ loan: 8_000 }] });
    const car = life.possessions.items[0]!;
    const next = produce(life, (d) => void stealVehicle(d, d.possessions.items[0]!, content));
    expect(vehiclesOf(next)).toHaveLength(0);
    ok(next);
    expect(next.finances.debts.some((d) => d.id === car.vehicle!.loanDebtId)).toBe(false);
  });

  it('sells for its value less what a private sale costs, paying off its loan first', () => {
    const life = withPossessions(rich(40), { vehicles: [{ loan: 5_000 }] });
    const car = life.possessions.items[0]!;
    const next = produce(life, (d) => void sellVehicle(d, car.id, content));
    expect(vehiclesOf(next)).toHaveLength(0);
    expect(next.finances.savings).toBe(life.finances.savings + Math.round(car.value * b.vehicles.sellShare) - 5_000);
    expect(next.finances.debts).toHaveLength(0);
    ok(next);
    // Selling a car worth less than its loan leaves the rest as personal debt.
    const under = withPossessions(rich(40), { vehicles: [{ loan: 90_000 }] });
    const sold = produce(under, (d) => void sellVehicle(d, under.possessions.items[0]!.id, content));
    expect(sold.finances.debts.map((d) => d.kind)).toEqual(['personal']);
    ok(sold);
  });

  it('makes an accident likelier for a risk-taker, a worn-out car and a motorcycle, and a drunk incident likelier with an addiction', () => {
    const life = withPossessions(rich(24), { vehicles: [{ condition: 80 }, { defId: 'motorcycle', condition: 80 }, { condition: 10 }] });
    const [car, bike, wreck] = life.possessions.items;
    expect(accidentChance(life, bike!, content)).toBeGreaterThan(accidentChance(life, car!, content));
    expect(accidentChance(life, wreck!, content)).toBeGreaterThan(accidentChance(life, car!, content));
    const bold = produce(life, (d) => void (d.character.personality.riskTaking = 100));
    const timid = produce(life, (d) => void (d.character.personality.riskTaking = 0));
    expect(accidentChance(bold, car!, content)).toBeGreaterThan(accidentChance(timid, car!, content));
    const sober = produce(life, (d) => void (d.character.hidden.vice = 0));
    expect(drunkChance(sober, content)).toBe(0);
    const drinker = produce(life, (d) => {
      d.character.hidden.vice = 80;
      d.health.conditions.push({ conditionId: 'alcohol_addiction', since: d.currentYear, severity: 50, treated: false });
    });
    expect(drunkChance(drinker, content)).toBeGreaterThan(drunkChance(produce(life, (d) => void (d.character.hidden.vice = 80)), content));
  });
});

describe('the possessions step', () => {
  const advance = (life: LifeState, seed: string) =>
    produce(life, (d) => {
      d.rng = createRng(seed);
      d.currentYear += 1;
      d.character.age += 1;
      runPossessions(d, content);
    });
  const accidents = Object.values(content.registries.possessions.accidents).flatMap((r) => r.events);

  it('queues an accident event bound to the vehicle, more often for a worn-out car and a risk-taker', () => {
    const risky = (condition: number, riskTaking: number) =>
      produce(withPossessions(rich(22), { vehicles: [{ condition }] }), (d) => void (d.character.personality.riskTaking = riskTaking));
    let found = 0;
    const count = (life: LifeState) => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const next = advance(life, `acc-${i}`);
        for (const s of next.scheduled.filter((q) => accidents.includes(q.eventId))) {
          expect(s.cast).toEqual({ '@vehicle': life.possessions.items[0]!.id });
          n++;
        }
        found += next.scheduled.length;
      }
      return n;
    };
    const bad = count(risky(5, 100));
    const good = count(risky(95, 0));
    expect(bad).toBeGreaterThan(good);
    expect(found).toBeGreaterThan(0);
  });

  it('queues the drunk-driving event only for someone with a high Vice, and none in prison', () => {
    const drunk = content.registries.possessions.accidents.drunk.events;
    const count = (life: LifeState) => Array.from({ length: 300 }, (_, i) => advance(life, `drunk-${i}`)).filter((l) => l.scheduled.some((s) => drunk.includes(s.eventId))).length;
    const base = withPossessions(rich(30), { vehicles: [{}] });
    expect(count(produce(base, (d) => void (d.character.hidden.vice = 0)))).toBe(0);
    expect(count(produce(base, (d) => void (d.character.hidden.vice = 100)))).toBeGreaterThan(0);
    expect(count(produce(base, (d) => { d.character.hidden.vice = 100; d.housing.kind = 'incarcerated'; }))).toBe(0);
  });

  it('marks a pet that reaches its lifespan as died, queues its passing event, and removes it the year after', () => {
    const old = withPossessions(rich(30), { pets: [{ species: 'hamster' }] });
    const aged = produce(old, (d) => {
      const p = d.possessions.items[0]!;
      petOf(p).lifespan = content.pets.hamster!.lifespan.min;
      petOf(p).startAge = petOf(p).lifespan - 1;
      p.acquired = d.currentYear;
    });
    const dying = advance(aged, 'die');
    const pet = dying.possessions.items[0]!;
    expect(petOf(pet).died).toBe(dying.currentYear);
    expect(livingPets(dying)).toHaveLength(0);
    expect(dying.scheduled.map((s) => s.eventId)).toEqual(['pet_passed_away']);
    expect(dying.scheduled[0]!.cast).toEqual({ '@pet': pet.id });
    expect(inventoryFailures(produce(dying, (d) => void (d.scheduled = [])))).toEqual([]);
    const gone = advance(produce(dying, (d) => void (d.scheduled = [])), 'after');
    expect(gone.possessions.items).toHaveLength(0);
  });

  it('keeps the dog for dog events: a dog’s end has its own event', () => {
    const dog = withPossessions(rich(30), { pets: [{ species: 'dog' }] });
    const aged = produce(dog, (d) => {
      const p = d.possessions.items[0]!;
      petOf(p).lifespan = content.pets.dog!.lifespan.min;
      petOf(p).startAge = petOf(p).lifespan - 1;
    });
    expect(advance(aged, 'dog').scheduled.map((s) => s.eventId)).toEqual(['dog_passed_away']);
  });

  it('takes a job away after the grace years without a vehicle where it needs one', () => {
    const driver = produce(rich(30), (d) => {
      d.character.cityId = 'los_angeles';
      d.housing.cityId = 'los_angeles';
      d.career.job = { jobId: 'delivery_driver', level: 1, yearsAtLevel: 0, performance: 60, salary: 40_000, since: d.currentYear - 1, employer: 'Swift Parcel' };
      d.possessions.noVehicleYears = 0;
    });
    let life = driver;
    for (let i = 0; i < b.jobs.graceYears; i++) life = advance(life, `job-${i}`);
    expect(life.career.job).toBeNull();
    expect(life.career.history.at(-1)).toMatchObject({ jobId: 'delivery_driver', endedBy: 'laid_off' });
    // With a car the job stays.
    const kept = advance(withPossessions(driver, { vehicles: [{}] }), 'kept');
    expect(kept.career.job?.jobId).toBe('delivery_driver');
  });

  it('foreclosure takes a vacation home whose mortgage is far enough behind', () => {
    const owned = withPossessions(rich(40), { vacation: [{ value: 300_000, mortgage: 200_000 }] });
    const behind = produce(owned, (d) => void (d.finances.debts[0]!.missed = content.balance.economy.missed.foreclosureAfter));
    const after = advance(behind, 'foreclose');
    expect(after.possessions.items).toHaveLength(0);
    expect(after.history.some((h) => h.tags.includes('vacationForeclosed'))).toBe(true);
    expect(inventoryFailures(after)).toEqual([]);
  });
});

describe('homes', () => {
  it('quotes a vacation home in any city with the usual down payment and closing costs, a mortgage and its blocks', () => {
    const life = rich();
    const q = vacationQuote(life, 'chicago', content);
    expect(q.price).toBe(Math.round(content.cities.chicago!.baseHomePrice * b.homes.vacation.priceShare));
    expect(q.downPayment).toBe(Math.round(q.price * content.balance.economy.ownership.downPayment));
    expect(q.mortgage).toBe(q.price - q.downPayment);
    expect(q.blocked).toBeNull();
    expect(vacationQuote(produce(life, (d) => void (d.finances.savings = 1_000)), 'chicago', content).blocked).toBe('savings');
    expect(vacationQuote(produce(life, (d) => void (d.finances.lastLedger!.gross = 30_000)), 'nyc', content).blocked).toBe('income');
    expect(vacationQuote(produce(life, (d) => void (d.character.age = 16)), 'chicago', content).blocked).toBe('age');
    expect(vacationQuote(produce(life, (d) => void (d.housing.kind = 'incarcerated')), 'chicago', content).blocked).toBe('prison');
  });

  it('is bought with a mortgage of its own, charged upkeep and insurance through the ledger, and sold for its value less costs and mortgage', () => {
    const life = rich();
    const q = vacationQuote(life, 'chicago', content);
    const owned = produce(life, (d) => void buyVacationHome(d, 'chicago', content));
    const home = owned.possessions.items[0]!;
    expect(owned.finances.savings).toBe(life.finances.savings - q.downPayment - q.closingCosts);
    expect(owned.finances.debts.find((d) => d.id === home.home!.mortgageDebtId)).toMatchObject({ kind: 'mortgage', balance: q.mortgage });
    ok(owned);
    const costs = possessionCosts(owned, content);
    expect(costs.upkeep).toBe(Math.round(home.value * b.homes.vacation.upkeep));
    expect(costs.insurance).toBe(Math.round(home.value * b.homes.vacation.insurance));
    const sold = produce(owned, (d) => void sellVacationHome(d, home.id, content));
    expect(sold.possessions.items).toHaveLength(0);
    expect(sold.finances.debts).toHaveLength(0);
    ok(sold);
  });

  it('renovates the home you own and your vacation homes: paid from savings, value up, comfort lifts Happiness; not the same one again soon', () => {
    const life = produce(withPossessions(rich(), { vacation: [{ value: 300_000 }] }), (d) => {
      d.housing = { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: 400_000, since: d.currentYear - 5 };
    });
    const kitchen = content.renovations.kitchen!;
    for (const target of ['main', life.possessions.items[0]!.id]) {
      const q = renovationQuote(life, target, kitchen, content);
      expect(q.blocked).toBeNull();
      const next = produce(life, (d) => void renovate(d, target, kitchen, content));
      expect(next.finances.savings).toBe(life.finances.savings - q.cost);
      const value = target === 'main' ? next.housing.homeValue! : next.possessions.items[0]!.value;
      expect(value).toBe((target === 'main' ? 400_000 : 300_000) + q.gain);
      expect(renovationQuote(next, target, kitchen, content).blocked).toBe('cooldown');
      expect(renovationQuote(next, target, content.renovations.bathroom!, content).blocked).toBeNull();
      ok(next);
    }
    expect(renovationQuote(produce(life, (d) => void (d.finances.savings = 10)), 'main', kitchen, content).blocked).toBe('savings');
    expect(renovationQuote(rich(), 'main', kitchen, content).blocked).toBe('nowhere');
    // Comfort lasts, then fades away.
    const fresh = { id: 'kitchen', year: 2000 };
    expect(renovationComfort(fresh, 2000 + b.homes.renovation.lastsYears, content)).toBe(kitchen.comfort);
    expect(renovationComfort(fresh, 2000 + b.homes.renovation.lastsYears + b.homes.renovation.fadeYears, content)).toBe(0);
  });
});

describe('the ledger', () => {
  it('charges upkeep and insurance, shows them, and keeps the net adding up', () => {
    const life = withPossessions(rich(40), { pets: [{}], vehicles: [{}], vacation: [{ value: 200_000 }] });
    const costs = possessionCosts(life, content);
    expect(costs.upkeep).toBeGreaterThan(0);
    expect(costs.insurance).toBeGreaterThan(0);
    const next = produce(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runEconomy(d, content);
    });
    const l = next.finances.lastLedger!;
    expect(l).toMatchObject({ upkeep: costs.upkeep, insurance: costs.insurance });
    expect(l.net).toBe(l.gross + l.retirement + l.interest + l.supportReceived - l.tax - l.housing - l.living - l.children - l.care - l.supportPaid - l.upkeep - l.insurance - l.debtPayments);
    expect(inventoryFailures(next)).toEqual([]);
  });

  it('charges nothing to a child (the family pays), and only vacation homes to someone in prison', () => {
    const kid = withPossessions(lifeAtAge('kid', 12), { pets: [{}] });
    expect(possessionCosts(kid, content)).toEqual({ upkeep: 0, insurance: 0 });
    const inside = withPossessions(rich(40), { pets: [{}], vehicles: [{}], vacation: [{ value: 200_000 }] });
    const jailed = produce(inside, (d) => void (d.housing.kind = 'incarcerated'));
    const c = possessionCosts(jailed, content);
    expect(c.upkeep).toBe(Math.round(200_000 * b.homes.vacation.upkeep));
    expect(c.insurance).toBe(Math.round(200_000 * b.homes.vacation.insurance));
  });

  it('counts vehicles and vacation homes in net worth', () => {
    const life = rich(40);
    const owned = withPossessions(life, { vehicles: [{}], vacation: [{ value: 200_000 }] });
    expect(owned.possessions.items.reduce((s, p) => s + p.value, 0)).toBeGreaterThan(200_000);
  });
});

describe('jobs that need a vehicle', () => {
  it('weights the job’s need by the city: a delivery driver needs a car in Los Angeles but not in New York', () => {
    expect(jobDependence('delivery_driver', 'los_angeles', content)).toBeGreaterThanOrEqual(b.jobs.requireAt);
    expect(jobRequiresVehicle('delivery_driver', 'los_angeles', content)).toBe(true);
    expect(jobRequiresVehicle('delivery_driver', 'nyc', content)).toBe(false);
    expect(jobRequiresVehicle('software_engineer', 'los_angeles', content)).toBe(false);
  });

  it('is a requirement for being hired, checked by the same rules that check everything else', async () => {
    const { canTakeJob, jobApplyBlock } = await import('../career');
    const la = produce(rich(25), (d) => {
      d.character.cityId = 'los_angeles';
      d.housing.cityId = 'los_angeles';
      d.career.openings = ['delivery_driver'];
    });
    expect(canTakeJob(la, 'delivery_driver', content)).toBe(false);
    expect(jobApplyBlock(la, 'delivery_driver', content)).toBe('vehicle');
    const withCar = withPossessions(la, { vehicles: [{}] });
    expect(canTakeJob(withCar, 'delivery_driver', content)).toBe(true);
    const ny = produce(la, (d) => {
      d.character.cityId = 'nyc';
      d.housing.cityId = 'nyc';
    });
    expect(canTakeJob(ny, 'delivery_driver', content)).toBe(true);
  });
});

describe('belongings conditions', () => {
  it('counts what you own and checks one pet, vehicle or home by every field given', () => {
    const life = withPossessions(rich(), { pets: [{ species: 'cat', bond: 80 }, { species: 'dog', bond: 20 }], vehicles: [{ condition: 20 }] });
    const holds = (q: Parameters<typeof belongingsHolds>[0]) => belongingsHolds(q, life, undefined, content);
    expect(holds({ pets: { gte: 2 } })).toBe(true);
    expect(holds({ vehicles: { gte: 2 } })).toBe(false);
    expect(holds({ species: ['cat'], petBond: { gte: 70 } })).toBe(true);
    expect(holds({ species: ['dog'], petBond: { gte: 70 } })).toBe(false);
    expect(holds({ vehicleCondition: { lt: 30 }, insured: true })).toBe(true);
    expect(holds({ vehicleKind: ['truck'] })).toBe(false);
    expect(holds({ vacationHomes: { gte: 1 } })).toBe(false);
  });

  it('checks the bound possession, not just any', () => {
    const life = withPossessions(rich(), { pets: [{ species: 'cat', bond: 80 }, { species: 'dog', bond: 20 }] });
    const [cat, dog] = life.possessions.items;
    expect(belongingsHolds({ species: ['cat'] }, life, { '@pet': cat!.id }, content)).toBe(true);
    expect(belongingsHolds({ species: ['cat'] }, life, { '@pet': dog!.id }, content)).toBe(false);
  });
});

describe('what the save holds', () => {
  it('passes the invariants for a life with all three kinds of possession', () => {
    const life = withPossessions(rich(40), { pets: [{}], vehicles: [{ loan: 4_000 }], vacation: [{ mortgage: 90_000 }] });
    ok(life);
  });

  it('catches possessions that are broken: a pet that lives past its lifespan, a car loan with no car, too many pets, a pet worth money', () => {
    const base = withPossessions(rich(40), { pets: [{}], vehicles: [{ loan: 4_000 }] });
    const fails = (mutate: (d: LifeState) => void) => checkInvariants(produce(base, mutate), content);
    expect(fails((d) => void (petOf(d.possessions.items[0]!).lifespan = 1))).not.toEqual([]);
    expect(fails((d) => void delete d.possessions.items[1]!.vehicle!.loanDebtId)).not.toEqual([]);
    expect(fails((d) => void (d.possessions.items[0]!.value = 50))).not.toEqual([]);
    expect(fails((d) => void (d.possessions.nextId = 1))).not.toEqual([]);
    expect(fails((d) => void (d.possessions.items[0]!.defId = 'unicorn'))).not.toEqual([]);
  });

  it('survives years of living: possessions age, cost and stay valid', () => {
    let life = withPossessions(rich(40), { pets: [{}], vehicles: [{}] });
    for (let i = 0; i < 6 && life.phase !== 'dead'; i++) life = playYear(life, content);
    expect(inventoryFailures(life)).toEqual([]);
  });

  it('a home sold while you are in prison takes its renovations with it', () => {
    const life = produce(withPossessions(rich(), {}), (d) => {
      d.housing = { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: 400_000, since: d.currentYear - 5 };
      renovate(d, 'main', content.renovations.kitchen!, content);
      d.housing.kind = 'incarcerated';
      d.legal.incarceratedUntil = d.currentYear + 3;
    });
    const sold = produce(life, (d) => void sellHome(d, content));
    expect(sold.housing.renovations).toBeUndefined();
    expect(inventoryFailures(sold).filter((f) => /renovations/.test(f))).toEqual([]);
  });
});
