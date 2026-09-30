import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { createRng } from '../rng';
import { characterDeathChance, npcDeathChance, pickCause } from './mortality';

const { maxAge } = content.balance.mortality;

describe('mortality curve', () => {
  it('rises with age after childhood until it becomes certain', () => {
    let previous = 0;
    for (let age = 10; age <= maxAge; age += 5) {
      const p = characterDeathChance(age, 70, 30, content);
      if (previous < 1) expect(p, `age ${age}`).toBeGreaterThan(previous);
      else expect(p, `age ${age}`).toBe(1);
      previous = p;
    }
  });

  it('is certain at the maximum age, for everyone', () => {
    expect(characterDeathChance(maxAge, 100, 0, content)).toBe(1);
    expect(npcDeathChance(maxAge, content)).toBe(1);
  });

  it('stays a probability', () => {
    for (let age = 0; age <= maxAge; age++) {
      for (const health of [0, 50, 100]) {
        const p = characterDeathChance(age, health, 100, content);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is higher with low Health and with high genetic risk', () => {
    expect(characterDeathChance(60, 20, 30, content)).toBeGreaterThan(characterDeathChance(60, 90, 30, content));
    expect(characterDeathChance(60, 70, 90, content)).toBeGreaterThan(characterDeathChance(60, 70, 10, content));
  });

  it('is low for children', () => {
    for (let age = 1; age < 18; age++) expect(characterDeathChance(age, 70, 30, content)).toBeLessThan(0.005);
  });
});

describe('causes of death', () => {
  it('come from the band for the age and exist in content', () => {
    const rng = createRng('causes');
    const band = (age: number) => content.balance.mortality.causes.find((b) => age <= b.maxAge)!;
    for (const age of [1, 10, 40, 70, 95, maxAge]) {
      for (let i = 0; i < 20; i++) {
        const id = pickCause(rng, age, content);
        expect(content.causes[id], id).toBeDefined();
        expect(Object.keys(band(age).weights)).toContain(id);
      }
    }
  });
});
