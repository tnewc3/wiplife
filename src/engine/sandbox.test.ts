import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { previewEvent, sandboxOutcome } from './sandbox';

/** An age inside the event's first life stage. */
function ageFor(stage: string): number {
  const starts: Record<string, number> = { early: 2, ...content.balance.aging.lifeStages };
  return (starts[stage] ?? 30) + 1;
}

describe('event sandbox', () => {
  it('previews an event with the chosen pronouns and character state', () => {
    const preview = previewEvent(content, {
      eventId: 'stranger_on_the_bench',
      seed: 'sandbox',
      age: 40,
      selfPronouns: 'they_them',
      castPronouns: 'xe_xem',
      stats: { happiness: 12 },
      personality: { kindness: 99 },
    });
    expect(preview.text).toMatch(/\bXe introduces xemself\b/);
    expect(preview.life.character.age).toBe(40);
    expect(preview.life.character.stats.happiness).toBe(12);
    expect(preview.life.character.personality.kindness).toBe(99);
    expect(preview.cast).toHaveLength(1);
    expect(preview.choices.map((c) => c.id)).toEqual(['listen', 'walk_away']);
    expect(sandboxOutcome(preview, 'listen', content)).toMatch(/bench is empty/);
  });

  it('marks choices this state would hide', () => {
    const preview = previewEvent(content, { eventId: 'treehouse', seed: 's', age: 9, selfPronouns: 'she_her', castPronouns: 'he_him' });
    expect(preview.choices.find((c) => c.id === 'careful')?.visible).toBe(false);
    expect(preview.choices.find((c) => c.id === 'high')?.visible).toBe(true);
  });

  it('previews every event and resolves its first visible choice, with four pronoun sets', () => {
    const sets = ['she_her', 'he_him', 'they_them', 'xe_xem'];
    for (const def of Object.values(content.events)) {
      const pronouns = sets[def.id.length % sets.length]!;
      const preview = previewEvent(content, { eventId: def.id, seed: def.id, age: ageFor(def.lifeStages[0]!), selfPronouns: pronouns, castPronouns: pronouns });
      expect(preview.text, def.id).not.toMatch(/[{}]/);
      const choice = preview.choices.find((c) => c.visible);
      if (choice) expect(sandboxOutcome(preview, choice.id, content), def.id).not.toMatch(/[{}]/);
    }
  });

  it('rejects an unknown event', () => {
    expect(() => previewEvent(content, { eventId: 'nope', seed: 's', age: 1, selfPronouns: 'she_her', castPronouns: 'she_her' })).toThrow(/Unknown event/);
  });
});
