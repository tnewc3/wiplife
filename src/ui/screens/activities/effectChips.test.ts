import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { effectChips } from './effectChips';

describe('effectChips (U3)', () => {
  it('reads the chips of every activity from its tiers in content, never from the screen', () => {
    for (const def of Object.values(content.pastimes)) {
      const chips = effectChips(def);
      // Every good chip names a stat that a good or great tier really changes.
      for (const c of chips.filter((x) => x.tone === 'good')) {
        const keys = [def.tiers.good, def.tiers.great].flatMap((t) => (t?.effects ?? []).flatMap((e) => (e.type === 'stat' ? [e.key] : [])));
        expect(keys.length, def.id).toBeGreaterThan(0);
        expect(c.text).toMatch(/^[+−]{1,2} /);
      }
    }
  });

  it('shows a lower stress as a good thing and keeps the number of chips small', () => {
    const calming = Object.values(content.pastimes).find((d) => d.tiers.good.effects.some((e) => e.type === 'stat' && e.key === 'stress' && e.delta < 0));
    expect(calming).toBeDefined();
    const chips = effectChips(calming);
    expect(chips.find((c) => c.text.endsWith('Stress'))?.tone).toBe('good');
    for (const def of Object.values(content.pastimes)) expect(effectChips(def).length).toBeLessThanOrEqual(6);
  });

  it('marks gambling as money at risk', () => {
    const bet = Object.values(content.pastimes).find((d) => d.mechanic === 'gamble');
    expect(effectChips(bet).some((c) => c.text === 'Money at risk' && c.tone === 'risk')).toBe(true);
  });
});
