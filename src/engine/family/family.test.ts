import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { applyEffects } from '../events/effects';
import { performAction, finishAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { checkInvariants } from '../invariants';
import { closeInteraction, performInteraction, resolveInteractionChoice } from '../interactions/perform';
import { beginYear, createLife, endYear, resolveChoice } from '../life';
import { createRng } from '../rng';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { LifeState, Person } from '../types';
import { canConceiveWith, conceiveChance, defaultCanCarry, fertilityFactor, naturalCarrier, tryChance } from './carrying';
import { childCosts, childSupportDue } from './costs';
import { createChild, createStepchildren, livingChildren } from './children';
import { applyCustody, custodyCase, custodyHearings } from './custody';
import { growChildren } from './growth';
import { beginPregnancy, decidePregnancy, miscarriageChance } from './pregnancy';
import { canStartProcess, processView, startProcess } from './process';
import { runFamily } from './step';

/** A content bundle with some family balance numbers replaced. */
function withFamily(patch: (f: ContentBundle['balance']['family']) => void): ContentBundle {
  const family = cloneJson(content.balance.family);
  patch(family);
  return { ...content, balance: { ...content.balance, family } };
}

/** A copy of the first person, as someone new. */
function person(d: LifeState, id: string, over: Partial<Person>): Person {
  const template = cloneJson(Object.values(d.people)[0]!);
  return { ...template, id, name: { first: `N${id}`, last: 'Test' }, tags: [], alive: true, ...over } as Person;
}

interface Couple {
  /** You can carry a pregnancy. */
  you?: boolean;
  partner?: boolean;
  age?: number;
  partnerAge?: number;
  kind?: 'spouse' | 'partner' | 'friend';
  savings?: number;
}

/** An adult with a partner (id "p"), attracted to each other, and who can carry as given. */
function couple(c: Couple = {}, seed = 'family'): LifeState {
  return produce(lifeAtAge(seed, c.age ?? 30), (d) => {
    d.character.canCarry = c.you ?? false;
    d.character.identity.attractedTo = ['man', 'woman', 'nonbinary'];
    d.people.p = person(d, 'p', {
      birthYear: d.currentYear - (c.partnerAge ?? 30),
      canCarry: c.partner ?? true,
      cityId: d.character.cityId,
      identity: { ...cloneJson(d.character.identity), attractedTo: ['man', 'woman', 'nonbinary'] },
      traits: {},
    });
    const kind = c.kind ?? 'spouse';
    d.relationships.p = { personId: 'p', kind, status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 5, kindSince: d.currentYear - 3, ...(kind === 'spouse' ? { wasSpouse: true as const } : {}) };
    d.finances.savings = c.savings ?? 300_000;
  });
}

describe('who can carry a pregnancy', () => {
  it('follows from gender category: women can, men can’t, nonbinary people choose', () => {
    expect(defaultCanCarry('woman')).toBe(true);
    expect(defaultCanCarry('man')).toBe(false);
    expect(defaultCanCarry('nonbinary')).toBe(false);
    const woman = createLife({ mode: 'random', seed: 'w', birthYear: 2000 }, content);
    expect(woman.character.canCarry).toBe(woman.character.identity.genderCategory === 'woman' || woman.character.canCarry);
    for (const life of ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => createLife({ mode: 'random', seed, birthYear: 2000 }, content))) {
      if (life.character.identity.genderCategory === 'woman') expect(life.character.canCarry).toBe(true);
      if (life.character.identity.genderCategory === 'man') expect(life.character.canCarry).toBe(false);
    }
  });

  it('is a creation choice for a nonbinary custom character, and checked for the rest', () => {
    const base = {
      name: { first: 'Robin', last: 'Okafor' },
      identity: { genderIdentity: 'nonbinary', genderCategory: 'nonbinary' as const, genderExpression: 'androgynous', pronouns: { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true }, attractedTo: [] },
      appearance: { descriptors: [] },
      cityId: 'chicago',
      familyWealth: 'working' as const,
      family: { parents: 2 as const, siblings: 0 },
      stats: { health: 50, happiness: 50, smarts: 50, looks: 50, fitness: 50, stress: 50 },
      personality: { ambition: 50, confidence: 50, kindness: 50, riskTaking: 50, discipline: 50, sociability: 50 },
    };
    const yes = createLife({ mode: 'custom', seed: 'nb', birthYear: 2000, custom: { ...base, canCarry: true } }, content);
    const no = createLife({ mode: 'custom', seed: 'nb', birthYear: 2000, custom: { ...base, canCarry: false } }, content);
    expect([yes.character.canCarry, no.character.canCarry]).toEqual([true, false]);
    const man = { ...base, identity: { ...base.identity, genderCategory: 'man' as const } };
    expect(() => createLife({ mode: 'custom', seed: 'm', birthYear: 2000, custom: { ...man, canCarry: true } }, content)).toThrow(InvalidInputError);
    expect(createLife({ mode: 'custom', seed: 'm', birthYear: 2000, custom: man }, content).character.canCarry).toBe(false);
  });

  it('gives relatives and new people a carrying ability that matches their category, and nonbinary ones a chance', () => {
    let nonbinary = 0;
    let carriers = 0;
    for (let i = 0; i < 400; i++) {
      for (const p of Object.values(createLife({ mode: 'random', seed: `rel-${i}`, birthYear: 2000 }, content).people)) {
        if (p.identity.genderCategory === 'woman') expect(p.canCarry).toBe(true);
        if (p.identity.genderCategory === 'man') expect(p.canCarry).toBe(false);
        if (p.identity.genderCategory === 'nonbinary') {
          nonbinary++;
          if (p.canCarry) carriers++;
        }
      }
    }
    expect(nonbinary).toBeGreaterThan(20);
    expect(carriers / nonbinary).toBeGreaterThan(0.25);
    expect(carriers / nonbinary).toBeLessThan(0.75);
  });
});

describe('conceiving', () => {
  it('needs exactly one of you to be able to carry, and two adults', () => {
    expect(naturalCarrier(couple({ you: false, partner: true }), 'p')).toBe('p');
    expect(naturalCarrier(couple({ you: true, partner: false }), 'p')).toBe('you');
    expect(naturalCarrier(couple({ you: true, partner: true }), 'p')).toBeNull();
    expect(naturalCarrier(couple({ you: false, partner: false }), 'p')).toBeNull();
    expect(canConceiveWith(couple({ you: false, partner: true }), 'p', content)).toBe(true);
    expect(canConceiveWith(couple({ you: true, partner: true }), 'p', content)).toBe(false);
    const minor = produce(couple({ you: false, partner: true }), (d) => {
      d.people.p!.birthYear = d.currentYear - 16;
    });
    expect(canConceiveWith(minor, 'p', content)).toBe(false);
  });

  it('is less likely with age, and with protection', () => {
    const young = couple({ partner: true, partnerAge: 26 });
    const older = couple({ partner: true, partnerAge: 41 });
    expect(tryChance(young, 'p', false, content)).toBeGreaterThan(tryChance(older, 'p', false, content));
    expect(tryChance(young, 'p', true, content)).toBeGreaterThan(tryChance(young, 'p', false, content));
    expect(conceiveChance(young, 'p', 'carefree', content)).toBeGreaterThan(conceiveChance(young, 'p', 'careful', content));
    expect(conceiveChance(couple({ you: true, partner: true }), 'p', 'carefree', content)).toBe(0);
    expect(fertilityFactor(couple({ partner: true, partnerAge: 53 }), 'p', undefined, content)).toBe(0);
  });

  it('starts a pregnancy only when one is possible, and one at a time', () => {
    const life = produce(couple({ partner: true }), (d) => {
      expect(beginPregnancy(d, 'trying', 'p', content)).toBe(true);
      expect(beginPregnancy(d, 'trying', 'p', content)).toBe(false);
    });
    expect(life.family.pregnancy).toMatchObject({ how: 'trying', carrier: 'p', otherParentId: 'p', decision: 'keep' });
    const none = produce(couple({ you: true, partner: true }), (d) => {
      expect(beginPregnancy(d, 'unplanned', 'p', content)).toBe(false);
    });
    expect(none.family.pregnancy).toBeNull();
  });

  it('offers trying for a baby as an action only to couples who can', () => {
    const life = couple({ partner: true });
    expect(performAction(life, 'try_for_baby', { personId: 'p' }, content).phase).toBe('action');
    const two = couple({ you: true, partner: true });
    expect(() => performAction(two, 'try_for_baby', { personId: 'p' }, content)).toThrow(InvalidInputError);
    const old = couple({ partner: true, partnerAge: 52 });
    expect(() => performAction(old, 'try_for_baby', { personId: 'p' }, content)).toThrow(InvalidInputError);
  });
});

describe('pregnancy, birth and miscarriage', () => {
  const sure = withFamily((f) => {
    f.pregnancy.miscarriage.base = 0;
  });
  const doomed = withFamily((f) => {
    f.pregnancy.miscarriage.base = 1;
    f.pregnancy.miscarriage.carrierAge = [{ at: 0, x: 1 }];
    f.pregnancy.miscarriage.health = [{ at: 0, x: 1 }];
  });

  it('ends the year after it began: a birth makes a child with a relationship, and queues the birth event', () => {
    const start = produce(couple({ partner: true }), (d) => void beginPregnancy(d, 'trying', 'p', sure));
    const born = beginYear(start, sure);
    const babies = livingChildren(born);
    expect(babies).toHaveLength(1);
    expect(born.family.pregnancy).toBeNull();
    expect(born.relationships[babies[0]!.id]).toMatchObject({ kind: 'child', status: 'active' });
    expect(born.pending.map((p) => p.eventId)).toContain('birth_partner');
    expect(babies[0]!.child.custody).toBe('you');
    expect(checkInvariants(born, sure)).toEqual([]);
  });

  it('can end in a miscarriage, which counts and always queues its grief chain', () => {
    const start = produce(couple({ partner: true }), (d) => void beginPregnancy(d, 'trying', 'p', doomed));
    const lost = beginYear(start, doomed);
    expect(livingChildren(lost)).toHaveLength(0);
    expect(lost.family.miscarriages).toBe(1);
    const ids = lost.pending.map((p) => p.eventId);
    expect(ids).toContain('miscarriage_carried');
    expect(lost.relationships.p!.memories.some((m) => m.tag === 'lost_a_pregnancy')).toBe(true);
    let life = lost;
    while (life.phase === 'events') {
      const card = life.pending.find((p) => p.resolvedChoiceId === undefined)!;
      life = resolveChoice(life, card.instanceId, content.events[card.eventId]!.choices![0]!.id, doomed);
    }
    expect(life.scheduled.map((s) => s.eventId)).toEqual(expect.arrayContaining(['miscarriage_partner_talk_spouse', 'miscarriage_anniversary']));
    expect(life.flags.had_miscarriage).toBe(true);
  });

  it('has a miscarriage chance that rises with the carrier’s age', () => {
    const young = couple({ partner: true, partnerAge: 26 });
    const older = couple({ partner: true, partnerAge: 41 });
    expect(miscarriageChance(older, 'p', content)).toBeGreaterThan(miscarriageChance(young, 'p', content));
    expect(miscarriageChance(young, 'you', content)).toBeGreaterThan(0);
  });

  it('puts a baby carried by someone who isn’t your partner with them, and you pay child support', () => {
    const start = produce(couple({ partner: true, kind: 'friend' }), (d) => void beginPregnancy(d, 'unplanned', 'p', sure));
    const decided = produce(start, (d) => decidePregnancy(d, 'keep'));
    const born = beginYear(decided, sure);
    const baby = livingChildren(born)[0]!;
    expect(baby.child.custody).toBe('other');
    expect(born.family.support).toEqual({ direction: 'pay', personId: 'p' });
    expect(born.pending.map((p) => p.eventId)).toContain('birth_coparent');
  });
});

describe('an unplanned pregnancy', () => {
  const sure = withFamily((f) => {
    f.unplanned.carefree = 1;
    f.fertility.carrierAge = [{ at: 0, x: 1 }];
    f.fertility.otherAge = [{ at: 0, x: 1 }];
    f.fertility.health = [{ at: 0, x: 1 }];
  });

  it('begins from an intimate night when the protection choice and fertility allow it, then asks all three questions', () => {
    let found: LifeState | null = null;
    for (const seed of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8']) {
      const life = produce(couple({ partner: true }, seed), (d) => {
        d.relationships.p!.affection = 95;
        d.relationships.p!.trust = 95;
        d.people.p!.mood = 90;
      });
      let done = performInteraction(life, { interactionId: 'be_intimate', personId: 'p' }, sure);
      if (done.pendingInteraction?.tier === 'bad' || done.pendingInteraction?.tier === 'backfire' || !done.pendingInteraction?.choice) continue;
      // Choose "Don't stop".
      const choiceId = done.pendingInteraction!.choice!.options.find((o) => o.id === 'carefree')!.id;
      done = resolveInteractionChoice(done, choiceId, sure);
      if (done.family.pregnancy?.decision === 'pending') {
        found = done;
        break;
      }
    }
    expect(found).not.toBeNull();
    const closed = closeInteraction(found!, sure);
    expect(closed.phase).toBe('action');
    expect(closed.pending[0]!.eventId).toBe('unplanned_pregnancy');
    expect(closed.pendingInteraction).toBeNull();
    // Always all three choices.
    const def = content.events.unplanned_pregnancy!;
    expect(def.choices!.map((c) => c.id).sort()).toEqual(['adoption', 'end', 'keep']);
    // Ending the pregnancy ends it, flags it and schedules the afterward.
    const ended = resolveChoice(closed, closed.pending[0]!.instanceId, 'end', sure);
    expect(ended.family.pregnancy).toBeNull();
    expect(ended.flags.ended_a_pregnancy).toBe(true);
    // Keeping it, or placing the baby for adoption, goes on.
    const kept = resolveChoice(closed, closed.pending[0]!.instanceId, 'keep', sure);
    expect(kept.family.pregnancy?.decision).toBe('keep');
    const placed = resolveChoice(closed, closed.pending[0]!.instanceId, 'adoption', sure);
    expect(placed.family.pregnancy?.decision).toBe('adoption');
    expect(checkInvariants(finishAction(kept), sure)).toEqual([]);
  });

  it('can’t be skipped: ageing up waits for the decision', () => {
    const life = produce(couple({ partner: true }), (d) => void beginPregnancy(d, 'unplanned', 'p', content));
    expect(() => beginYear(life, content)).toThrow(/Decide first/);
  });
});

describe('adoption, IVF and surrogacy', () => {
  it('check age, record, money and housing, and show costs and odds', () => {
    const rich = couple({ you: true, partner: false, savings: 500_000 });
    expect(processView(rich, 'adoption', content).blocks).toEqual([]);
    expect(processView(rich, 'ivf', content).odds).toBeGreaterThan(0.2);
    expect(processView(rich, 'ivf', content).cost).toBeGreaterThan(0);
    expect(processView(rich, 'surrogacy', content).odds).toBe(content.balance.family.surrogacy.success);
    const poor = produce(rich, (d) => void (d.finances.savings = 50));
    for (const kind of ['adoption', 'ivf', 'surrogacy'] as const) expect(processView(poor, kind, content).blocks).toContain('money');
    const record = produce(rich, (d) => void d.legal.record.push({ offenseId: 'assault', year: d.currentYear - 2, outcome: 'jail', years: 1 }));
    expect(processView(record, 'adoption', content).blocks).toContain('record');
    const noCarrier = couple({ you: false, partner: false, savings: 500_000 });
    expect(processView(noCarrier, 'ivf', content).blocks).toContain('carrier');
    expect(processView(noCarrier, 'surrogacy', content).blocks).toEqual([]);
    const tooOld = couple({ you: true, age: 47, savings: 500_000 });
    expect(processView(tooOld, 'ivf', content).blocks).toContain('age');
    const homeless = produce(rich, (d) => void (d.housing.kind = 'homeless'));
    expect(processView(homeless, 'adoption', content).blocks).toContain('housing');
    expect(canStartProcess(rich, 'adoption', content)).toBe(true);
  });

  it('go through the start events, charge the fees through the finance module, and wait', () => {
    const life = couple({ you: false, partner: false, savings: 200_000 });
    const queued = performAction(life, 'start_adoption', {}, content);
    expect(queued.phase).toBe('action');
    expect(queued.pending[0]!.eventId).toBe('adoption_apply');
    const started = resolveChoice(queued, queued.pending[0]!.instanceId, 'sign', content);
    expect(started.family.process?.kind).toBe('adoption');
    expect(started.finances.savings).toBeLessThan(200_000);
    expect(started.pending[0]!.money?.change).toBeLessThan(0);
    const backed = resolveChoice(queued, queued.pending[0]!.instanceId, 'back', content);
    expect(backed.family.process).toBeNull();
    expect(backed.finances.savings).toBe(200_000);
  });

  it('an adoption brings an adopted child (with independent genetics) after its wait, or falls through', () => {
    const yes = withFamily((f) => {
      f.adoption.waitYears = { min: 1, max: 1 };
      f.adoption.declineChance = 0;
    });
    const no = withFamily((f) => {
      f.adoption.waitYears = { min: 1, max: 1 };
      f.adoption.declineChance = 1;
    });
    const waiting = produce(couple({ you: false, partner: false }), (d) => startProcess(d, createRng('a'), 'adoption', yes));
    const home = beginYear(waiting, yes);
    const child = livingChildren(home)[0]!;
    expect(child.child.origin).toBe('adopted');
    expect(home.pending.map((p) => p.eventId)).toContain('adoption_match');
    expect(home.family.process).toBeNull();
    expect(checkInvariants(home, yes)).toEqual([]);
    const declined = beginYear(waiting, no);
    expect(livingChildren(declined)).toHaveLength(0);
    expect(declined.pending.map((p) => p.eventId)).toContain('adoption_declined');
  });

  it('IVF and surrogacy start a pregnancy when they work, and say so when they don’t', () => {
    const works = withFamily((f) => {
      f.ivf.success = [{ at: 0, x: 1 }];
      f.surrogacy.success = 1;
    });
    const fails = withFamily((f) => {
      f.ivf.success = [{ at: 0, x: 0 }];
      f.surrogacy.success = 0;
    });
    const ivf = produce(couple({ you: true, partner: false }), (d) => startProcess(d, createRng('i'), 'ivf', works));
    const ok = beginYear(ivf, works);
    expect(ok.family.pregnancy).toMatchObject({ how: 'ivf', carrier: 'you' });
    expect(ok.pending.map((p) => p.eventId)).toContain('ivf_success');
    expect(beginYear(ivf, fails).pending.map((p) => p.eventId)).toContain('ivf_failed');
    const sur = produce(couple({ you: false, partner: false }), (d) => startProcess(d, createRng('s'), 'surrogacy', works));
    expect(beginYear(sur, works).family.pregnancy).toMatchObject({ how: 'surrogacy', carrier: 'surrogate' });
    expect(beginYear(sur, fails).pending.map((p) => p.eventId)).toContain('surrogacy_fell_through');
  });

  it('IVF odds fall with age', () => {
    expect(processView(couple({ you: true, age: 28 }), 'ivf', content).odds!).toBeGreaterThan(processView(couple({ you: true, age: 41 }), 'ivf', content).odds!);
  });
});

describe('children as people', () => {
  /** Many children of the same parents. */
  function brood(n: number, parentSmarts: [number, number]) {
    const life = produce(couple({ partner: true }), (d) => {
      d.character.stats.smarts = parentSmarts[0];
      d.people.p!.smarts = parentSmarts[1];
    });
    return produce(life, (d) => {
      const rng = createRng('brood');
      for (let i = 0; i < n; i++) createChild(d, rng, { origin: 'birth', age: 0, parents: { you: true, other: 'p' }, otherParentId: 'p', custody: 'you' }, content);
    });
  }

  it('start between their parents’ values with variation, and follow them', () => {
    const lowHigh = brood(300, [30, 30]);
    const high = brood(300, [80, 80]);
    const mean = (l: LifeState) => livingChildren(l).reduce((s, c) => s + c.smarts, 0) / 300;
    expect(mean(lowHigh)).toBeGreaterThan(24);
    expect(mean(lowHigh)).toBeLessThan(36);
    expect(mean(high)).toBeGreaterThan(74);
    expect(mean(high)).toBeLessThan(86);
    const spread = livingChildren(high).map((c) => c.smarts);
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(10);
    const mixed = brood(300, [30, 80]);
    expect(mean(mixed)).toBeGreaterThan(48);
    expect(mean(mixed)).toBeLessThan(62);
  });

  it('adopted children’s values are independent of yours', () => {
    const life = produce(couple({ partner: true }), (d) => {
      d.character.stats.smarts = 95;
      const rng = createRng('adopt');
      for (let i = 0; i < 200; i++) createChild(d, rng, { origin: 'adopted', age: 3, parents: { you: false }, custody: 'you' }, content);
    });
    const mean = livingChildren(life).reduce((s, c) => s + c.smarts, 0) / 200;
    expect(mean).toBeLessThan(60);
  });

  it('roll identity and hidden traits independently, never from their parents', () => {
    const woman = produce(couple({ you: true, partner: false }), (d) => {
      d.character.identity.genderCategory = 'woman';
      d.character.identity.attractedTo = ['woman'];
      d.character.latent = { identity: { genderCategory: 'man', attractedTo: ['man'] } };
      const rng = createRng('id');
      for (let i = 0; i < 300; i++) createChild(d, rng, { origin: 'birth', age: 0, parents: { you: true }, custody: 'you' }, content);
    });
    const kids = livingChildren(woman);
    const categories = new Set(kids.map((k) => k.identity.genderCategory));
    expect(categories.size).toBe(3);
    // A parent attracted only to women doesn't pass it on: daughters are attracted to women as often as anyone's.
    const daughters = kids.filter((k) => k.identity.genderCategory === 'woman');
    const attractedToWomenOnly = daughters.filter((k) => k.identity.attractedTo.length === 1 && k.identity.attractedTo[0] === 'woman').length;
    expect(attractedToWomenOnly / daughters.length).toBeLessThan(0.15);
    expect(kids.filter((k) => k.child.latent.identity !== undefined).length).toBeGreaterThan(0);
  });

  it('become stepchildren when you marry someone who has children, once', () => {
    const life = produce(couple({ partner: true, kind: 'partner' }), (d) => {
      d.people.p!.priorChildren = [d.currentYear - 4, d.currentYear - 9];
    });
    const married = produce(life, (d) => {
      applyEffects(d, [{ type: 'relationship', role: 'person', kind: 'fiance' }], { def: { id: 't', rarity: 'common' }, cast: { person: 'p' }, rng: createRng('m'), content });
      applyEffects(d, [{ type: 'relationship', role: 'person', kind: 'spouse' }], { def: { id: 't', rarity: 'common' }, cast: { person: 'p' }, rng: createRng('m'), content });
    });
    const steps = Object.values(married.relationships).filter((r) => r.kind === 'stepchild');
    expect(steps).toHaveLength(2);
    expect(married.people.p!.priorChildren).toBeUndefined();
    expect(checkInvariants(married, content)).toEqual([]);
    // Doing it again makes nobody new.
    const again = produce(married, (d) => void createStepchildren(d, createRng('x'), 'p', content));
    expect(Object.values(again.relationships).filter((r) => r.kind === 'stepchild')).toHaveLength(2);
  });
});

describe('parenting style shapes children', () => {
  /** A parent with one child at 4, raised for years at a fixed style (no events), then read at 17. */
  function raised(style: { warmth: number; strictness: number; involvement: number }, seed: string) {
    let life = produce(couple({ partner: true }, seed), (d) => {
      createChild(d, createRng(seed), { origin: 'birth', age: 4, parents: { you: true, other: 'p' }, otherParentId: 'p', custody: 'you' }, content);
    });
    const id = livingChildren(life)[0]!.id;
    for (let i = 0; i < 13; i++) {
      life = produce(life, (d) => {
        d.currentYear += 1;
        d.relationships[id]!.parenting = { ...style };
        d.rng = { ...d.rng };
        growChildren(d, content);
      });
    }
    return life.people[id]!;
  }

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const group = (style: { warmth: number; strictness: number; involvement: number }) => Array.from({ length: 30 }, (_, i) => raised(style, `raise-${i}`));
  const base = { warmth: 50, strictness: 50, involvement: 50 };

  it('warmth builds kindness, in both directions', () => {
    const warm = avg(group({ ...base, warmth: 90 }).map((c) => c.traits.kindness!));
    const cold = avg(group({ ...base, warmth: 10 }).map((c) => c.traits.kindness!));
    expect(warm - cold).toBeGreaterThanOrEqual(content.balance.targets.family.styleEffect.personality);
  });

  it('strictness builds discipline, in both directions', () => {
    const strict = avg(group({ ...base, strictness: 90 }).map((c) => c.traits.discipline!));
    const relaxed = avg(group({ ...base, strictness: 10 }).map((c) => c.traits.discipline!));
    expect(strict - relaxed).toBeGreaterThanOrEqual(content.balance.targets.family.styleEffect.personality);
  });

  it('involvement lifts grades, in both directions', () => {
    const involved = avg(group({ ...base, involvement: 90 }).map((c) => c.child!.gpa));
    const absent = avg(group({ ...base, involvement: 10 }).map((c) => c.child!.gpa));
    expect(involved - absent).toBeGreaterThanOrEqual(content.balance.targets.family.styleEffect.grades);
  });
});

describe('money: costs, custody and child support', () => {
  const withKids = (n: number, over: { custody?: 'you' | 'shared' | 'other' } = {}) =>
    produce(couple({ partner: true, kind: 'spouse' }), (d) => {
      const rng = createRng('kids');
      for (let i = 0; i < n; i++) createChild(d, rng, { origin: 'birth', age: 5, parents: { you: true, other: 'p' }, otherParentId: 'p', custody: over.custody ?? 'you' }, content);
    });

  it('children cost money each year, scaled by city and lifestyle, shared when a partner lives with you', () => {
    const alone = withKids(2);
    expect(childCosts(alone, content)).toBeGreaterThan(0);
    expect(childCosts(withKids(2), content)).toBeGreaterThan(childCosts(withKids(1), content));
    const frugal = produce(alone, (d) => void (d.finances.lifestyle = 'frugal'));
    expect(childCosts(frugal, content)).toBeLessThan(childCosts(alone, content));
    const together = produce(alone, (d) => void (d.housing.partnerId = 'p'));
    expect(childCosts(together, content)).toBeLessThan(childCosts(alone, content));
    const kidsElsewhere = withKids(2, { custody: 'other' });
    expect(childCosts(kidsElsewhere, content)).toBe(0);
  });

  it('go through the yearly ledger with child costs and support, and the ledger adds up', () => {
    const life = produce(withKids(2), (d) => {
      d.character.age = 30;
    });
    const next = beginYear(life, content);
    const ledger = next.finances.lastLedger!;
    expect(ledger.children).toBeGreaterThan(0);
    expect(ledger.net).toBe(ledger.gross + ledger.retirement + ledger.interest + ledger.supportReceived - ledger.tax - ledger.housing - ledger.living - ledger.children - ledger.supportPaid - ledger.debtPayments);
    expect(checkInvariants(next, content)).toEqual([]);
  });

  it('puts the children where custody says, and sets child support to match', () => {
    const apart = produce(withKids(2), (d) => {
      d.relationships.p!.kind = 'ex';
      d.relationships.p!.wasSpouse = true;
    });
    expect(custodyHearings(apart, content)).toEqual(['p']);
    const full = produce(apart, (d) => void applyCustody(d, 'p', 'full', content));
    expect(full.family.support).toEqual({ direction: 'receive', personId: 'p' });
    expect(childSupportDue(full, 50_000, content).received).toBeGreaterThan(0);
    const other = produce(apart, (d) => void applyCustody(d, 'p', 'other', content));
    expect(other.family.support).toEqual({ direction: 'pay', personId: 'p' });
    expect(childSupportDue(other, 50_000, content).paid).toBeGreaterThanOrEqual(content.balance.family.support.payMin);
    expect(childSupportDue(other, 200_000, content).paid).toBeGreaterThan(childSupportDue(other, 50_000, content).paid);
    const shared = produce(apart, (d) => void applyCustody(d, 'p', 'shared', content));
    expect(shared.family.support).toBeNull();
    expect(custodyHearings(full, content)).toEqual([]);
    expect(checkInvariants(full, content)).toEqual([]);
    expect(custodyCase(apart, 'p', content)).toBeGreaterThan(20);
  });

  it('queues a custody hearing for exes with undecided children, and it always has all three outcomes', () => {
    const apart = produce(withKids(1), (d) => {
      d.relationships.p!.kind = 'ex';
    });
    const next = beginYear(apart, content);
    expect(next.pending.map((p) => p.eventId)).toContain('custody_hearing');
    const def = content.events.custody_hearing!;
    expect(def.choices!.map((c) => c.id).sort()).toEqual(['fight', 'give_up', 'share']);
  });

  it('keeps the children with you when the other parent has died', () => {
    const widowed = produce(withKids(1), (d) => {
      d.people.p!.alive = false;
      d.people.p!.deathYear = d.currentYear;
    });
    const next = beginYear(widowed, content);
    const kid = livingChildren(next)[0]!;
    expect([kid.child.custody, kid.child.custodyDecided]).toEqual(['you', true]);
    expect(next.pending.map((p) => p.eventId)).not.toContain('custody_hearing');
  });
});

describe('losing a child', () => {
  const deadly = withFamily((f) => {
    f.children.death.byAge = [{ at: 0, x: 1 }];
  });

  it('is rare, kills the child, counts, and always opens its grief chain', () => {
    const life = produce(couple({ partner: true }), (d) => {
      createChild(d, createRng('d'), { origin: 'birth', age: 6, parents: { you: true, other: 'p' }, otherParentId: 'p', custody: 'you' }, content);
    });
    const next = beginYear(life, deadly);
    expect(livingChildren(next)).toHaveLength(0);
    expect(next.family.lostChildren).toBe(1);
    expect(next.pending.map((p) => p.eventId)).toContain('child_dies_young');
    let resolved = next;
    while (resolved.phase === 'events') {
      const card = resolved.pending.find((p) => p.resolvedChoiceId === undefined)!;
      resolved = resolveChoice(resolved, card.instanceId, content.events[card.eventId]?.choices?.[0]?.id ?? 'continue', deadly);
    }
    expect(resolved.flags.lost_a_child).toBe(true);
    expect(resolved.scheduled.map((s) => s.eventId)).toEqual(
      expect.arrayContaining(['after_child_death_numb', 'after_child_death_together', 'after_child_death_sibling', 'after_child_death_milestone']),
    );
    expect(resolved.history.some((h) => h.importance === 3 && h.text.includes('lost your child'))).toBe(true);
    expect(checkInvariants(endYear(resolved, deadly), deadly)).toEqual([]);
  });

  it('is rare at the usual odds', () => {
    let died = 0;
    for (let i = 0; i < 200; i++) {
      const life = produce(couple({ partner: true }, `rare-${i}`), (d) => {
        createChild(d, createRng(`c${i}`), { origin: 'birth', age: 8, parents: { you: true, other: 'p' }, otherParentId: 'p', custody: 'you' }, content);
      });
      const next = produce(life, (d) => {
        d.currentYear += 1;
        runFamily(d, content);
      });
      if (next.family.lostChildren > 0) died++;
    }
    expect(died).toBeLessThan(5);
  });
});

describe('children and the rules', () => {
  it('never include romance: a child can’t be a partner, and the adult checks hold for the whole family', () => {
    const life = produce(couple({ partner: true }), (d) => {
      createChild(d, createRng('r'), { origin: 'birth', age: 10, parents: { you: true }, custody: 'you' }, content);
    });
    const kid = livingChildren(life)[0]!;
    const romantic = produce(life, (d) => void (d.relationships[kid.id]!.kind = 'partner'));
    expect(checkInvariants(romantic, content).length).toBeGreaterThan(0);
    expect(checkInvariants(life, content)).toEqual([]);
    // No romance interaction is ever available with a child.
    for (const def of Object.values(content.interactions)) {
      if (def.romance) expect(def.availability.kinds.includes('child')).toBe(false);
    }
  });

  it('keeps a save valid after the family upgrade: a life from before has no children and no pregnancy', () => {
    const fresh = lifeAtAge('upgrade', 30);
    expect(fresh.family).toEqual({ pregnancy: null, process: null, support: null, attempts: 0, lostChildren: 0, miscarriages: 0 });
    expect(typeof fresh.character.canCarry).toBe('boolean');
  });
});
