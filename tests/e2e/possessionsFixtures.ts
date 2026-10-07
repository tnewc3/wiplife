/**
 * A saved life for the belongings tests (E5): a grown-up with money, a home of
 * their own, a cat, a worn-out sedan, built with the engine on the test content
 * pack and written into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { createLife } from '../../src/engine/life';
import { addPet } from '../../src/engine/possessions/pets';
import { nextPossessionId } from '../../src/engine/possessions/query';
import { refreshVehicleValue } from '../../src/engine/possessions/vehicles';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface BelongingsLife {
  seed: string;
  savings?: number;
  /** Own the home you live in (so it can be renovated). */
  ownsHome?: boolean;
  /** Start with a cat and a sedan. */
  owns?: boolean;
}

export function belongingsLife(options: BelongingsLife): LifeState {
  const content = pack();
  const age = 36;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990 }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    d.teen = startingTeen(age, d.currentYear, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(d.people)) {
      if (d.currentYear - person.birthYear >= content.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = d.currentYear;
      }
    }
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    d.finances.savings = options.savings ?? 600_000;
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 200_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, net: 200_000 };
    d.housing = options.ownsHome
      ? { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: 300_000, since: d.currentYear - 6 }
      : { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
    if (options.owns) {
      const cat = addPet(d, 'cat', 'shelter', 'Pepper', content);
      cat.pet!.personality = 'anxious';
      cat.pet!.bond = 40;
      d.history.pop();
      const id = nextPossessionId(d);
      d.possessions.items.push({ id, kind: 'vehicle', defId: 'sedan', acquired: d.currentYear - 3, value: 0, condition: 30, vehicle: { startAge: 4, insured: true } });
      refreshVehicleValue(d, d.possessions.items.at(-1)!, content);
    }
  });
}
