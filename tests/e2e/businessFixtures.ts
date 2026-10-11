/**
 * A saved adult for the Business tests (W3): 34 years old with savings and an income, and (as asked)
 * a café of their own. Built with the engine on the test content pack and written into the app's
 * database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { startBusiness } from '../../src/engine/business/found';
import type { LifeState } from '../../src/engine/types';
import { familyLife } from './heirFixtures';

const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

export interface BusinessLife {
  seed: string;
  /** Own a café already. */
  started?: boolean;
  savings?: number;
}

export function businessLife(options: BusinessLife): LifeState {
  const content = pack();
  const base = familyLife({ seed: options.seed, kids: [], age: 34, savings: options.savings ?? 500_000 });
  return produce(base, (d) => {
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 62_000, retirement: 0, tax: 8_000, housing: 14_000, living: 16_000, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: 24_000 };
    if (options.started) {
      startBusiness(d, { defId: 'cafe', name: 'The Grey Heron', cityId: d.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' }, content);
      d.scheduled = [];
    }
  });
}
