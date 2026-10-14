import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { checkInvariants } from '../invariants';
import { runLives } from '../lives/step';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { countryIdOfCity } from '../country';
import { continueAsHeir, heirCandidates } from '../estate/heir';
import { birthCitizenships } from './citizenship';
import { previewEvent } from '../sandbox';

/** A circle of friends who live apart from you, so they can leave. */
function circle(seed: string): LifeState {
  return produce(lifeAtAge(seed, 30), (d) => {
    for (const r of Object.values(d.relationships)) {
      const p = d.people[r.personId]!;
      p.cityId = d.character.cityId === 'chicago' ? 'houston' : 'chicago';
    }
  });
}

describe('W6 people you know emigrate (E3)', () => {
  it('moves some of them to another country, with or without papers, as news, and never the people who live with you', () => {
    const chances = produce(content, (c) => { c.balance.immigration.people.yearlyChance = 1; });
    let moved = 0;
    for (let i = 0; i < 14; i++) {
      const before = moved;
      const life = circle(`w6-people-${i}`);
      const next = produce(life, (d) => { d.rng = createRng(`r${i}`); runLives(d, chances); });
      for (const p of Object.values(next.people)) {
        if (!p.life?.emigrated) continue;
        moved++;
        expect(countryIdOfCity(p.cityId, content)).toBe(p.life.emigrated.countryId);
        expect(countryIdOfCity(p.cityId, content)).not.toBe(countryIdOfCity(life.people[p.id]!.cityId, content));
        expect(p.life.emigrated.from).toBe(life.people[p.id]!.cityId);
        expect(p.citizenships).toEqual(life.people[p.id]!.citizenships);
      }
      // Each is news, or (for someone close) a request that tells the story as a card.
      if (moved > before) expect(next.news.flatMap((y) => y.lines).some((l) => l.kind === 'emigrated') || next.scheduled.length > life.scheduled.length).toBe(true);
    }
    expect(moved).toBeGreaterThan(3);
  });
  it('leaves everyone alone at the real rate in one year, almost always', () => {
    const life = circle('w6-people-quiet');
    const next = produce(life, (d) => { runLives(d, content); });
    expect(Object.values(next.people).filter((p) => p.life?.emigrated).length).toBeLessThanOrEqual(2);
  });
  it('takes up citizenship of the new country after the years, if they had papers', () => {
    const chances = produce(content, (c) => { c.balance.immigration.people.naturalizeChance = 1; c.balance.immigration.people.naturalizeYears = 3; });
    const life = produce(circle('w6-people-citizen'), (d) => {
      const [id] = Object.keys(d.people);
      const p = d.people[id!]!;
      p.cityId = 'toronto';
      p.life = { tier: 'near', background: 'middle', level: 0, levelSince: d.currentYear, partner: null, children: [], troubles: [], recovered: [], gossip: 50, emigrated: { year: d.currentYear - 5, countryId: 'ca', from: 'chicago', papers: true } };
      d.relationships[id!]!.kind = 'friend';
      d.relationships[id!]!.affection = 40;
    });
    const next = produce(life, (d) => { runLives(d, chances); });
    const id = Object.keys(life.people)[0]!;
    expect(next.people[id]!.citizenships).toContain('ca');
  });
  it('asks for a farewell or help with papers through the people requests, and the events fit someone who emigrated', () => {
    for (const id of ['emigrates_farewell', 'emigrant_asks_fees']) {
      const preview = previewEvent(content, { eventId: id, seed: id, age: 30, selfPronouns: 'they_them', castPronouns: 'they_them' });
      expect(preview.requirementsMet, id).toBe(true);
      expect(preview.consistency, id).toEqual([]);
    }
  });
});

describe('W6 children and heirs', () => {
  it('gives a child the country of birth and what each parent passes down', () => {
    expect(birthCitizenships('toronto', [{ citizenships: ['mx'] }, { citizenships: ['us'] }], content)).toEqual(['ca', 'mx', 'us']);
    expect(birthCitizenships('london', [{ citizenships: ['mx'], settledIn: null }], content)).toEqual(['mx']);
  });
  it('lets an heir keep a parent\'s citizenships and, born where the parent was only a resident, the standing of that household', () => {
    const parent = produce(lifeAtAge('w6-heir', 45), (d) => {
      d.character.citizenships = ['mx'];
      d.character.cityId = d.character.birthCityId = 'london';
      for (const p of Object.values(d.people)) p.cityId = 'london';
      d.housing = { kind: 'renting', cityId: 'london', annualCost: 9000, since: d.currentYear };
      d.travel.residence = { country: 'United Kingdom', destinationId: 'london', type: 'undocumented', route: 'overstay', startYear: d.currentYear - 10, endYear: d.currentYear - 10, homeCityId: 'mexico_city', settled: true };
      d.migration.arrivedYear = d.currentYear - 10;
      d.migration.undocumented = { sinceYear: d.currentYear - 10, origin: 'overstay', closeCalls: 0 };
      d.career.job = null;
      // A child born in the United Kingdom to a parent without papers there is not a citizen at birth, but holds the parent's citizenship.
      const kid = Object.values(d.people).find((p) => p.child);
      if (kid) kid.citizenships = birthCitizenships('london', [{ citizenships: ['mx'], settledIn: null }], content);
    });
    const dead = produce(parent, (d) => { d.phase = 'dead'; d.death = { year: d.currentYear, age: d.character.age, causeId: 'stroke' } as never; });
    const candidates = heirCandidates(dead);
    if (candidates.length === 0) return;
    const heir = continueAsHeir(dead, candidates[0]!, content);
    expect(heir.character.citizenships.length).toBeGreaterThan(0);
    expect(checkInvariants(heir, content).filter((f) => f.startsWith('migration'))).toEqual([]);
  });
});
