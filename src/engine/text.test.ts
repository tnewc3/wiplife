import { describe, expect, it } from 'vitest';
import { checkTemplate, placeholders, renderText, TextError, type TextRole } from './text';

const xe: TextRole = {
  name: { first: 'Robin', last: 'Okafor' },
  pronouns: { subject: 'xe', object: 'xem', possessive: 'xyr', possessivePronoun: 'xyrs', reflexive: 'xemself', verbPlural: false },
};
const they: TextRole = {
  name: { first: 'Sam', last: 'Lee' },
  pronouns: { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true },
};

describe('renderText', () => {
  it('fills names, every pronoun form and values', () => {
    const text = '{npc.name} {npc.last} ({npc.fullName}): {npc.they}, {npc.them}, {npc.their}, {npc.theirs}, {npc.themself}. Age {age}.';
    expect(renderText(text, { roles: { npc: xe }, values: { age: 40 } })).toBe(
      'Robin Okafor (Robin Okafor): xe, xem, xyr, xyrs, xemself. Age 40.',
    );
  });

  it('capitalizes pronouns that start a sentence', () => {
    expect(renderText('{npc.They} left. {npc.Their} coat stayed.', { roles: { npc: xe } })).toBe('Xe left. Xyr coat stayed.');
  });

  it('picks verbs that agree with the pronouns', () => {
    const text = '{npc.They} {npc:is|are} here.';
    expect(renderText(text, { roles: { npc: xe } })).toBe('Xe is here.');
    expect(renderText(text, { roles: { npc: they } })).toBe('They are here.');
  });

  it('leaves text without placeholders alone', () => {
    expect(renderText('You turned five.')).toBe('You turned five.');
  });

  it('throws for a missing role or value', () => {
    expect(() => renderText('{npc.name}')).toThrow(TextError);
    expect(() => renderText('{age}', { values: {} })).toThrow(TextError);
  });

  it('throws for malformed placeholders', () => {
    for (const bad of ['{npc.shoeSize}', '{npc:is}', '{}', '{npc.name', 'a } b', '{a b}']) {
      expect(() => placeholders(bad), bad).toThrow(TextError);
    }
  });
});

describe('checkTemplate', () => {
  it('accepts placeholders that are allowed', () => {
    expect(checkTemplate('{self.They} {self:was|were} {age}.', { roles: ['self'], values: ['age'] })).toEqual([]);
  });

  it('reports unknown roles, unknown values and syntax errors', () => {
    expect(checkTemplate('{npc.name} was {age}', { roles: ['self'], values: [] })).toHaveLength(2);
    expect(checkTemplate('{self.hat}', { roles: ['self'] })[0]).toMatch(/unknown field/);
  });
});
