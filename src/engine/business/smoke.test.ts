import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { performAction } from '../actions';
import { checkInvariants } from '../invariants';
import { playYear } from '../autoplay';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';

function owner(seed: string): LifeState {
  return produce(lifeAtAge(seed, 32), (d) => {
    d.finances.savings = 400_000;
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 60_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: 60_000 };
  });
}

describe('smoke', () => {
  it('starts a cafe and plays 10 years', () => {
    let life = owner('smoke-a');
    life = performAction(life, 'start_business', { biz: { defId: 'cafe', name: 'Test Cafe', cityId: life.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' } }, content);
    expect(life.business.items).toHaveLength(1);
    console.log(life.business.items[0]!.cash, life.finances.savings);
    for (let i = 0; i < 10 && life.phase !== 'dead'; i++) {
      life = playYear(life, content);
      const b = life.business.items[0];
      console.log(life.currentYear, life.character.age, b ? JSON.stringify({ rev: b.report?.revenue, profit: b.report?.profit, cash: b.cash, q: b.quality, rep: b.reputation, notes: b.report?.notes }) : 'none', life.finances.savings);
      const fails = checkInvariants(life, content);
      expect(fails).toEqual([]);
    }
  });
});
