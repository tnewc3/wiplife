import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { curveAt, powInt } from '../curve';
import { beginYear } from '../life';
import { cloneJson, lifeAtAge } from '../testFixtures';
import { lifeStageForAge, yearlyHealthDecline } from './aging';
import { addHistory } from './history';

describe('curves', () => {
  const curve = [
    { at: 10, x: 1 },
    { at: 20, x: 3 },
  ];
  it('interpolates between points and stays flat beyond the ends', () => {
    expect([curveAt(curve, 0), curveAt(curve, 10), curveAt(curve, 15), curveAt(curve, 20), curveAt(curve, 99)]).toEqual([1, 1, 2, 3, 3]);
  });
  it('raises to whole powers by multiplication', () => {
    expect([powInt(2, 0), powInt(2, 10), powInt(1.5, 2)]).toEqual([1, 1024, 2.25]);
  });
});

describe('life stages', () => {
  it('follow the ages in balance/aging.yaml', () => {
    const s = content.balance.aging.lifeStages;
    expect(lifeStageForAge(0, content)).toBe('early');
    expect(lifeStageForAge(s.child - 1, content)).toBe('early');
    expect(lifeStageForAge(s.child, content)).toBe('child');
    expect(lifeStageForAge(s.teen, content)).toBe('teen');
    expect(lifeStageForAge(s.youngAdult, content)).toBe('youngAdult');
    expect(lifeStageForAge(s.adult, content)).toBe('adult');
    expect(lifeStageForAge(s.senior, content)).toBe('senior');
    expect(lifeStageForAge(120, content)).toBe('senior');
  });

  it('change on the birthday that starts them, with a history entry', () => {
    const teen = content.balance.aging.lifeStages.teen;
    const life = beginYear(lifeAtAge('stage', teen - 1), content);
    expect(life.character.age).toBe(teen);
    expect(life.character.lifeStage).toBe('teen');
    const entry = life.history.find((e) => e.tags.includes('lifeStage'));
    expect(entry).toMatchObject({ year: life.currentYear, age: teen, tags: ['milestone', 'lifeStage', 'teen'] });
    expect(content.text.history.lifeStage.teen.variants.map((v) => v.replace('{age}', String(teen)))).toContain(entry!.text);
  });

  it('write no entry in a year without a stage change', () => {
    const life = beginYear(lifeAtAge('no-stage', 20), content);
    expect(life.history.filter((e) => e.tags.includes('lifeStage'))).toEqual([]);
  });
});

describe('health decline with age', () => {
  it('is zero for the young and grows with age', () => {
    expect(yearlyHealthDecline(10, 50, content)).toBe(0);
    expect(yearlyHealthDecline(30, 50, content)).toBe(0);
    const d60 = yearlyHealthDecline(60, 50, content);
    const d90 = yearlyHealthDecline(90, 50, content);
    expect(d60).toBeGreaterThan(0);
    expect(d90).toBeGreaterThan(d60);
  });

  it('is slower for fit people', () => {
    expect(yearlyHealthDecline(70, 90, content)).toBeLessThan(yearlyHealthDecline(70, 10, content));
  });

  it('lowers Health slowly over the years and never below zero', () => {
    const start = lifeAtAge('decline', 60);
    let life = start;
    for (let i = 0; i < 20; i++) {
      life = beginYear(life, content);
      // Skip the death check, and clear any illness the year brought, to follow aging alone.
      life = { ...life, phase: 'yearStart', health: { ...life.health, conditions: [] } };
    }
    const lost = start.character.stats.health - life.character.stats.health;
    expect(lost).toBeGreaterThan(5);
    expect(lost).toBeLessThan(40);
    expect(life.character.stats.health).toBeGreaterThanOrEqual(0);
  });
});

describe('history', () => {
  it('drops the oldest least important entry past the limit', () => {
    const small = { ...content, balance: { ...content.balance, aging: { ...content.balance.aging, history: { maxEntries: 10 } } } };
    const life = cloneJson(lifeAtAge('history', 30));
    addHistory(life, { text: 'major', tags: [], importance: 3 }, small);
    for (let i = 0; i < 12; i++) addHistory(life, { text: `minor ${i}`, tags: [], importance: 1 }, small);
    addHistory(life, { text: 'notable', tags: [], importance: 2 }, small);
    expect(life.history).toHaveLength(10);
    expect(life.history[0]!.text).toBe('major');
    expect(life.history.at(-1)!.text).toBe('notable');
    expect(life.history.map((e) => e.text)).toContain('minor 11');
    expect(life.history.map((e) => e.text)).not.toContain('minor 0');
  });
});
