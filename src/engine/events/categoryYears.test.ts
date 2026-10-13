import { produce } from 'immer';
import { expect, it } from 'vitest';
import { content } from '../../content';
import { lifeAtAge } from '../testFixtures';
import { categoryYears, eventWeight } from './selection';
it('keeps category cooldown weights identical as travel and other event logs grow', () => {
  const base = lifeAtAge('travel-log-cooldowns', 50);
  const life = produce(base, (d) => {
    for (const [i, def] of Object.values(content.events).entries()) if (i % 3 === 0) d.eventLog[def.id] = { count: 2, lastYear: d.currentYear - i % 7 };
    d.eventLog.retired_unknown_event = { count: 3, lastYear: d.currentYear };
  });
  const years = categoryYears(life, content);
  for (const def of Object.values(content.events)) expect(eventWeight(life, def, content, undefined, years)).toBe(eventWeight(life, def, content));
  expect(categoryYears(life, content)).toEqual(years);
  expect(categoryYears(base, content).size).toBe(0);
});
