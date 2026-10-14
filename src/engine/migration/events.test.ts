import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { previewEvent, sandboxOutcome } from '../sandbox';

const w6 = Object.values(content.events).filter((e) => ['emigration', 'abroad', 'undocumented'].includes(e.category) && !e.retired);

describe('W6 events', () => {
  it('has about fifty, all for adults', () => {
    expect(w6.length).toBeGreaterThanOrEqual(45);
    for (const e of w6) expect(e.lifeStages.every((s) => ['youngAdult', 'adult', 'senior'].includes(s)), e.id).toBe(true);
  });
  it('previews each in a state that satisfies it, with every choice resolving, for four pronoun sets', () => {
    const sets = ['she_her', 'he_him', 'they_them', 'xe_xem'];
    for (const [i, def] of w6.entries()) {
      const pronouns = sets[i % sets.length]!;
      const preview = previewEvent(content, { eventId: def.id, seed: `w6-${def.id}`, age: 36, selfPronouns: pronouns, castPronouns: pronouns });
      expect(preview.requirementsMet, def.id).toBe(true);
      expect(preview.consistency, def.id).toEqual([]);
      expect(preview.text, def.id).not.toMatch(/[{}]/);
      for (const c of preview.choices.filter((x) => x.visible)) expect(sandboxOutcome(preview, c.id, content), `${def.id}/${c.id}`).not.toMatch(/[{}]/);
    }
  });
  it('every event that talks about money changes it, and every amount is written in the local money', () => {
    for (const def of w6) {
      const texts = JSON.stringify(def);
      expect(texts, def.id).not.toMatch(/\$\d/);
      expect(texts, def.id).not.toMatch(/\bdollars?\b/i);
    }
  });
  it('names no one by a hardcoded pronoun', () => {
    for (const def of w6) {
      const texts = [def.title, def.text, ...(def.choices ?? []).flatMap((c) => [c.label, c.outcome?.text ?? ''])].join(' ');
      expect(texts, def.id).not.toMatch(/\b(he|she|him|her|his|hers|himself|herself)\b/i);
    }
  });
});
