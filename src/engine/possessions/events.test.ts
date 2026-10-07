import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { castEvent } from '../events/casting';
import { eventWeight } from '../events/selection';
import { checkInvariants } from '../invariants';
import { resolveChoice } from '../life';
import { getEventCard } from '../selectors';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { withPossessions } from './fixtures';
import { livingPets, petOf, vehiclesOf } from './query';
import { vehicleQuote } from './vehicles';

const rich = (age = 35, seed = 'e5-ev') =>
  produce(lifeAtAge(seed, age), (d) => {
    d.finances.savings = 400_000;
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 150_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, net: 150_000 };
  });
const inventoryFailures = (life: LifeState) => checkInvariants(life, content).filter((f) => !/input log|recap|lifetime/.test(f));

/** The life with this event pending, cast for it (the possession it binds is picked from what the life owns). */
function withEvent(life: LifeState, eventId: string, preset: Record<string, string> = {}, seed = 'cast'): LifeState {
  return produce(life, (d) => {
    const def = content.events[eventId]!;
    const result = castEvent(d, def, createRng(seed), content, preset);
    if (!result) throw new Error(`could not cast ${eventId}`);
    d.rng = createRng(`${seed}:play`);
    d.phase = 'events';
    d.pending = [{ instanceId: 'e1', eventId, cast: result.cast }];
  });
}

describe('belongings actions', () => {
  const life = rich();

  it('adopt a pet by name and source, spend the price, and write the input to the log', () => {
    const next = performAction(life, 'adopt_pet', { defId: 'dog', source: 'shelter', name: 'Waffles' }, content);
    expect(livingPets(next)[0]).toMatchObject({ defId: 'dog', name: 'Waffles' });
    expect(next.finances.savings).toBeLessThan(life.finances.savings);
    expect(next.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'adopt_pet', params: { defId: 'dog', source: 'shelter', name: 'Waffles' } } });
    expect(inventoryFailures(next)).toEqual([]);
  });

  it('refuse bad input: a name that isn’t a name, a stray from a shelter desk, an unknown kind, extra fields', () => {
    const bad = [
      { defId: 'dog', source: 'shelter', name: '<b>' },
      { defId: 'dog', source: 'stray', name: 'Waffles' },
      { defId: 'dog', source: 'breeder' },
      { defId: 'dragon', source: 'shelter', name: 'Smaug' },
      { defId: 'dog', source: 'shelter', name: 'Waffles', free: true },
    ];
    for (const params of bad) expect(() => performAction(life, 'adopt_pet', params, content), JSON.stringify(params)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'buy_vehicle', { defId: 'sedan', used: 'yes', loan: false }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'renovate', { renovationId: 'moat', target: 'main' }, content)).toThrow(InvalidInputError);
  });

  it('are not available to a child, a pauper, in prison or outside the time between years', () => {
    const can = (l: LifeState, id: 'adopt_pet' | 'buy_vehicle', params: Record<string, unknown>) => isLifeActionAvailable(l, id, params as never, content);
    const adopt = { defId: 'dog', source: 'shelter', name: 'Waffles' };
    expect(can(life, 'adopt_pet', adopt)).toBe(true);
    expect(can(lifeAtAge('kid', 12), 'adopt_pet', adopt)).toBe(false);
    expect(can(produce(life, (d) => void (d.finances.savings = 5)), 'adopt_pet', adopt)).toBe(false);
    expect(can(produce(life, (d) => void (d.housing.kind = 'incarcerated')), 'buy_vehicle', { defId: 'sedan', used: false, loan: false })).toBe(false);
    expect(can(produce(life, (d) => void (d.phase = 'events')), 'adopt_pet', adopt)).toBe(false);
  });

  it('buy a vehicle with cash or a loan, service it, switch insurance, and sell it', () => {
    let l = performAction(life, 'buy_vehicle', { defId: 'hatchback', used: true, loan: true }, content);
    const car = vehiclesOf(l)[0]!;
    expect(l.finances.debts.some((d) => d.kind === 'auto')).toBe(true);
    l = produce(l, (d) => void (d.possessions.items[0]!.condition = 40));
    l = performAction(l, 'service_vehicle', { possessionId: car.id }, content);
    expect(vehiclesOf(l)[0]!.condition).toBeGreaterThan(40);
    l = performAction(l, 'set_insurance', { insured: false }, content);
    expect(vehiclesOf(l)[0]!.vehicle!.insured).toBe(false);
    expect(() => performAction(l, 'set_insurance', { insured: false }, content)).toThrow(InvalidInputError);
    l = performAction(l, 'sell_vehicle', { possessionId: car.id }, content);
    expect(vehiclesOf(l)).toHaveLength(0);
    expect(l.finances.debts.filter((d) => d.kind === 'auto')).toHaveLength(0);
    expect(inventoryFailures(l)).toEqual([]);
  });

  it('will not sell the last vehicle of someone whose job needs one', () => {
    const driver = produce(withPossessions(rich(), { vehicles: [{}] }), (d) => {
      d.character.cityId = 'los_angeles';
      d.housing.cityId = 'los_angeles';
      d.career.job = { jobId: 'delivery_driver', level: 1, yearsAtLevel: 0, performance: 60, salary: 40_000, since: d.currentYear - 1, employer: 'Swift Parcel' };
    });
    expect(isLifeActionAvailable(driver, 'sell_vehicle', { possessionId: driver.possessions.items[0]!.id }, content)).toBe(false);
  });

  it('buy a vacation home, renovate it and the home you own, and sell it', () => {
    let l = performAction(life, 'buy_vacation_home', { cityId: 'chicago' }, content);
    const home = l.possessions.items[0]!;
    expect(l.finances.debts.some((d) => d.kind === 'mortgage')).toBe(true);
    l = performAction(l, 'renovate', { renovationId: 'kitchen', target: home.id }, content);
    expect(l.possessions.items[0]!.value).toBeGreaterThan(home.value);
    expect(() => performAction(l, 'renovate', { renovationId: 'kitchen', target: home.id }, content)).toThrow(InvalidInputError);
    expect(() => performAction(l, 'renovate', { renovationId: 'kitchen', target: 'main' }, content)).toThrow(InvalidInputError);
    l = performAction(l, 'sell_vacation_home', { possessionId: home.id }, content);
    expect(l.possessions.items).toHaveLength(0);
    expect(inventoryFailures(l)).toEqual([]);
  });

  it('only a quote that isn’t blocked can be bought', () => {
    const poor = produce(life, (d) => void (d.finances.savings = 500));
    expect(vehicleQuote(poor, 'sedan', false, content).cashBlock).toBe('savings');
    expect(() => performAction(poor, 'buy_vehicle', { defId: 'sedan', used: false, loan: false }, content)).toThrow(InvalidInputError);
  });
});

describe('events about what you own', () => {
  it('only happen to someone who owns what they are about, and name it', () => {
    const none = rich();
    for (const id of ['pet_bond_moment', 'pet_falls_ill', 'car_wont_start', 'speeding_ticket', 'vacation_first_summer', 'vacation_storm']) {
      expect(eventWeight(none, content.events[id]!, content), id).toBe(0);
    }
    const owner = withPossessions(rich(), { pets: [{ bond: 90, health: 80 }], vehicles: [{ condition: 20 }], vacation: [{}] });
    for (const id of ['pet_bond_moment', 'car_wont_start', 'speeding_ticket', 'vacation_first_summer']) {
      expect(eventWeight(owner, content.events[id]!, content), id).toBeGreaterThan(0);
    }
    const bound = withEvent(owner, 'pet_bond_moment');
    expect(bound.pending[0]!.cast['@pet']).toBe(livingPets(owner)[0]!.id);
  });

  it('pick the possession that fits the requirements: the pet that is ill, the car that is worn out', () => {
    const owner = withPossessions(rich(), { pets: [{ health: 80 }, { health: 20 }], vehicles: [{ condition: 90 }, { condition: 10 }] });
    const ill = produce(owner, (d) => void (petOf(d.possessions.items[1]!).ill = true));
    expect(withEvent(ill, 'pet_falls_ill').pending[0]!.cast['@pet']).toBe(ill.possessions.items[1]!.id);
    expect(withEvent(ill, 'car_wont_start').pending[0]!.cast['@vehicle']).toBe(ill.possessions.items[3]!.id);
    expect(() => withEvent(owner, 'pet_falls_ill')).toThrow();
  });

  it('settle an accident through the finance module: the deductible, a claim, and the money on the card', () => {
    const life = withPossessions(rich(), { vehicles: [{}] });
    const car = life.possessions.items[0]!;
    const after = resolveChoice(withEvent(life, 'fender_bender', { '@vehicle': car.id }), 'e1', 'report', content);
    expect(after.possessions.claims).toHaveLength(1);
    // A small repair costs less than the deductible: you pay it, and the claim is still made.
    const b = content.balance.possessions.vehicles;
    const paid = Math.min(Math.max(100, Math.round(content.vehicles.sedan!.price * b.repair.minor.cost)), b.insurance.deductible);
    expect(after.finances.savings).toBe(life.finances.savings - paid);
    const resolved = after.pending[0]!;
    expect(resolved.money).toMatchObject({ change: -paid, balance: after.finances.savings });
    expect(resolved.outcomeText).toContain('report');
    expect(after.flags.had_car_accident).toBe(true);
  });

  it('link accidents to health and the law: a drunk crash injures you, costs the car and ends on your record', () => {
    const life = produce(withPossessions(rich(), { vehicles: [{}] }), (d) => void (d.character.hidden.vice = 80));
    const car = life.possessions.items[0]!;
    let crashed: LifeState | null = null;
    for (let i = 0; i < 60 && !crashed; i++) {
      const after = resolveChoice(withEvent(life, 'drove_home_drunk', { '@vehicle': car.id }, `drunk-${i}`), 'e1', 'drive', content);
      if (after.flags.drove_drunk_crash === true) crashed = after;
    }
    expect(crashed).not.toBeNull();
    const c = crashed!;
    expect(c.health.conditions.some((h) => h.conditionId === 'broken_bone')).toBe(true);
    expect(c.legal.record.some((r) => r.offenseId === 'dui')).toBe(true);
    expect(c.possessions.claims.length).toBeGreaterThan(0);
    expect(c.flags.dui_arrest).toBe(true);
    expect(c.pending[0]!.outcomeText).toMatch(/court hands down/);
  });

  it('can take a possession away and still name it in what happens: a pet that ran off, a car that was stolen', () => {
    const pets = withPossessions(rich(), { pets: [{ name: 'Waffles', species: 'dog', personality: 'stubborn' }] });
    let lost: LifeState | null = null;
    for (let i = 0; i < 80 && !lost; i++) {
      const after = resolveChoice(withEvent(pets, 'pet_runs_off', {}, `run-${i}`), 'e1', 'wait', content);
      if (after.flags.pet_never_found === true) lost = after;
    }
    expect(lost).not.toBeNull();
    expect(livingPets(lost!)).toHaveLength(0);
    expect(lost!.pending[0]!.outcomeText).toContain('Waffles');
    // The card itself is still shown, though the pet is gone.
    expect(getEventCard(lost!, 0, content)!.text).toContain('Waffles');
    expect(lost!.history.at(-1)!.text).toContain('Waffles');
    expect(inventoryFailures(lost!)).toEqual([]);

    const car = withPossessions(rich(), { vehicles: [{ defId: 'pickup_truck' }] });
    const stolen = resolveChoice(withEvent(car, 'car_stolen'), 'e1', 'continue', content);
    expect(vehiclesOf(stolen)).toHaveLength(0);
    expect(stolen.pending[0]!.outcomeText).toContain('pickup truck');
    expect(stolen.flags.car_was_stolen).toBe(true);
    // Insured, it is paid out.
    expect(stolen.finances.savings).toBeGreaterThan(car.finances.savings);
  });

  it('drop an event about a pet an earlier event this year took away', () => {
    const life = withPossessions(rich(), { pets: [{ species: 'dog', bond: 90, personality: 'stubborn' }] });
    const petId = life.possessions.items[0]!.id;
    let current = produce(life, (d) => {
      d.phase = 'events';
      d.rng = createRng('same-pet');
      d.pending = [
        { instanceId: 'e1', eventId: 'pet_runs_off', cast: { '@pet': petId } },
        { instanceId: 'e2', eventId: 'pet_bond_moment', cast: { '@pet': petId } },
      ];
    });
    // Lose the pet, whatever the dice say: play the first event until it does.
    for (let i = 0; i < 80 && livingPets(current).length > 0; i++) {
      current = resolveChoice(produce(life, (d) => {
        d.phase = 'events';
        d.rng = createRng(`lose-${i}`);
        d.pending = [
          { instanceId: 'e1', eventId: 'pet_runs_off', cast: { '@pet': petId } },
          { instanceId: 'e2', eventId: 'pet_bond_moment', cast: { '@pet': petId } },
        ];
      }), 'e1', 'wait', content);
    }
    expect(livingPets(current)).toHaveLength(0);
    expect(current.pending.map((p) => p.instanceId)).toEqual(['e1']);
    expect(current.phase).toBe('yearEnd');
  });

  it('bring a pet in when asked (a stray, a family pet), but not past the limit, and never a young pet’s death', () => {
    const base = rich();
    const taken = resolveChoice(withEvent(base, 'stray_at_the_door'), 'e1', 'keep', content);
    expect(livingPets(taken)).toHaveLength(1);
    expect(livingPets(taken)[0]!.defId).toBe('cat');
    const full = withPossessions(base, { pets: Array.from({ length: content.balance.possessions.limits.pets }, () => ({})) });
    expect(eventWeight(full, content.events.stray_at_the_door!, content)).toBe(0);
    // The engine keeps the limit even if an event asks.
    const forced = resolveChoice(produce(full, (d) => {
      d.phase = 'events';
      d.rng = createRng('forced');
      d.pending = [{ instanceId: 'e1', eventId: 'stray_at_the_door', cast: {} }];
    }), 'e1', 'keep', content);
    expect(livingPets(forced)).toHaveLength(content.balance.possessions.limits.pets);
  });

  it('settle who keeps a pet in a divorce: the event is scheduled by the divorce papers, and a choice decides', () => {
    const papers = content.events.divorce_papers!;
    const scheduled = JSON.stringify(papers).match(/pet_after_divorce/g) ?? [];
    expect(scheduled.length).toBeGreaterThanOrEqual(4);
    const base = withPossessions(
      produce(rich(), (d) => {
        const [id] = Object.keys(d.relationships);
        d.relationships[id!]!.kind = 'ex';
        d.relationships[id!]!.status = 'active';
      }),
      { pets: [{ species: 'cat', name: 'Pepper' }] },
    );
    const exId = Object.keys(base.relationships).find((id) => base.relationships[id]!.kind === 'ex')!;
    const kept = resolveChoice(withEvent(base, 'pet_after_divorce', { person: exId }), 'e1', 'keep', content);
    expect(livingPets(kept)).toHaveLength(1);
    const gone = resolveChoice(withEvent(base, 'pet_after_divorce', { person: exId }), 'e1', 'let_go', content);
    expect(livingPets(gone)).toHaveLength(0);
    expect(gone.history.at(-1)!.text).toContain('Pepper');
    expect(gone.relationships[exId]!.affection).toBeGreaterThan(base.relationships[exId]!.affection);
  });

  it('only offer the "share the pet" choice to someone who lives in your city', () => {
    const choice = content.events.pet_after_divorce!.choices!.find((c) => c.id === 'share')!;
    expect(JSON.stringify(choice.visibleIf)).toContain('city');
  });
});
