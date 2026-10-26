/**
 * A saved adult for the Business tests (W3): 34 years old with savings and an income, and (as asked)
 * a café of their own. Built with the engine on the test content pack and written into the app's
 * database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { openLocation, startBusiness } from '../../src/engine/business/found';
import { hireStaff } from '../../src/engine/business/staff';
import { createPerson } from '../../src/engine/events/casting';
import { createRng } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import { familyLife } from './heirFixtures';

const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

export interface BusinessLife {
  seed: string;
  /** Own a café already. */
  started?: boolean;
  savings?: number;
  /** B2: places the café has (in your city), people you know who are free to hire, named people already working there, and a name that has earned the right to franchise. */
  places?: number;
  people?: number;
  named?: number;
  franchiseReady?: boolean;
}

export function businessLife(options: BusinessLife): LifeState {
  const content = pack();
  const base = familyLife({ seed: options.seed, kids: [], age: 34, savings: options.savings ?? 500_000 });
  return produce(base, (d) => {
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 62_000, retirement: 0, tax: 8_000, housing: 14_000, living: 16_000, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: 24_000 };
    if (options.started) {
      startBusiness(d, { defId: 'cafe', name: 'The Grey Heron', cityId: d.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' }, content);
      const b = d.business.items[0]!;
      for (let i = 1; i < (options.places ?? 1); i++) openLocation(d, { id: b.id, cityId: d.character.cityId, style: 'standard', funding: 'savings' }, content);
      const rng = createRng(`${options.seed}:biz-people`);
      for (let i = 0; i < (options.people ?? 0); i++) {
        const id = createPerson(d, { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: 25, max: 45 } }, rng, content);
        if (id) d.relationships[id]!.affection = 85;
      }
      for (let i = 0; i < (options.named ?? 0); i++) hireStaff(d, b, { locationId: b.locations[0]!.id }, content, true);
      if (options.franchiseReady) {
        b.founded -= 8;
        b.quality = 72;
        b.reputation = 72;
        b.profits = [40_000, 50_000, 60_000];
      }
      d.scheduled = [];
    }
  });
}
