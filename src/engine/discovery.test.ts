/**
 * Self-discovery (Stage 9): latent traits surfacing and resurfacing, inner
 * conflict and its effects, accepting (identity effects with fromLatent),
 * "try it and decide" moments (adults only, through the Stage 5 rule),
 * coming out, hidden talents, and editing identity in the Profile sheet.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle } from '../content/schemas';
import { isLifeActionAvailable, performAction } from './actions';
import { performanceAim, startJob } from './career';
import { evaluate } from './conditions';
import { InvalidInputError } from './creation/input';
import { defaultPronouns, discoverTalent, editIdentity, hasLatent, identityEditIssues, isKnown, type IdentityEdit } from './discovery';
import { castCandidates, castEvent } from './events/casting';
import { successChance } from './events/checks';
import { applyEffects } from './events/effects';
import { eventWeight } from './events/selection';
import { textContext } from './events/text';
import { checkInvariants } from './invariants';
import { isRomanceEvent, romanceAllowed } from './relationships';
import { cloneRng, createRng } from './rng';
import { runSelfDiscovery } from './systems/selfDiscovery';
import { cloneJson, lifeAtAge } from './testFixtures';
import { renderText } from './text';
import type { LifeState } from './types';

const sure = [{ at: 0, x: 1 }];
const never = [{ at: 0, x: 0 }];

/** Content where surfacing (and, when asked, resurfacing) always happens. */
function surfacing(change: (b: ContentBundle) => void = () => {}): ContentBundle {
  const b = cloneJson(content);
  for (const kind of Object.keys(b.balance.discovery.surfacing) as (keyof typeof b.balance.discovery.surfacing)[]) {
    b.balance.discovery.surfacing[kind] = { minAge: 13, chance: kind === 'talent' ? never : sure };
  }
  change(b);
  return b;
}

/** Someone with a latent attraction to women (and men), no other latent traits. */
function questioning(age = 20, setup: (d: LifeState) => void = () => {}): LifeState {
  return produce(lifeAtAge('discovery', age), (d) => {
    d.character.identity.genderCategory = 'man';
    d.character.identity.genderIdentity = 'man';
    d.character.identity.attractedTo = ['woman'];
    d.character.latent = { identity: { attractedTo: ['man', 'woman'] } };
    d.character.hidden.talent = null;
    d.character.hidden.talentDiscovered = false;
    setup(d);
  });
}

const step = (life: LifeState, bundle: ContentBundle) => produce(life, (d) => runSelfDiscovery(d, bundle));

const effectCtx = (life: LifeState, cast: Record<string, string> = {}) => ({ def: content.events.discovery_feelings!, cast, rng: cloneRng(life.rng), content });

describe('surfacing', () => {
  it('brings a latent trait to the surface with its event, once a year at most', () => {
    const bundle = surfacing();
    const life = step(questioning(), bundle);
    expect(life.scheduled).toEqual([{ eventId: 'discovery_feelings', dueYear: life.currentYear, cast: {} }]);
    expect(life.discovery.surfaced.attraction).toEqual({ year: life.currentYear, times: 1 });
    expect(isKnown(life, 'attraction')).toBe(true);
    expect(evaluate({ discovery: { known: ['attraction'] } }, life)).toBe(true);
  });

  it('waits for the teen years, and never happens in prison', () => {
    const bundle = surfacing();
    expect(step(questioning(10), bundle).scheduled).toEqual([]);
    const inside = questioning(30, (d) => {
      d.housing = { kind: 'incarcerated', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      d.legal = { record: [{ offenseId: 'theft', year: d.currentYear, outcome: 'jail', years: 1 }], incarceratedUntil: d.currentYear + 1 };
    });
    expect(step(inside, bundle).scheduled).toEqual([]);
  });
});

describe('suppressing and inner conflict', () => {
  it('grows inner conflict while a known trait is held back, and fades it otherwise', () => {
    const bundle = surfacing((b) => (b.balance.discovery.resurfacing.chance = never));
    const known = questioning(20, (d) => (d.discovery.surfaced.attraction = { year: d.currentYear - 1, times: 2 }));
    const ic = bundle.balance.discovery.innerConflict;
    expect(step(known, bundle).character.hidden.innerConflict).toBe(Math.min(ic.maxPerYear, ic.perYear + ic.perSuppression));
    const calm = produce(lifeAtAge('calm', 30), (d) => {
      d.character.latent = {};
      d.character.hidden.innerConflict = 20;
    });
    expect(step(calm, bundle).character.hidden.innerConflict).toBe(20 - ic.decay);
  });

  it('raises Stress and lowers Happiness as it builds', () => {
    const bundle = surfacing((b) => (b.balance.discovery.surfacing.attraction.chance = never));
    const at = (conflict: number) =>
      step(
        questioning(30, (d) => {
          d.character.hidden.innerConflict = conflict;
          d.character.stats.stress = 20;
          d.character.stats.happiness = 70;
          d.rng = createRng('same');
        }),
        bundle,
      ).character.stats;
    const calm = at(0);
    const torn = at(90);
    expect(torn.stress).toBeGreaterThan(calm.stress);
    expect(torn.happiness).toBeLessThan(calm.happiness);
  });

  it('brings a trait you pushed down back later, and at high conflict, a crisis', () => {
    const bundle = surfacing((b) => {
      b.balance.discovery.resurfacing.chance = sure;
      b.balance.discovery.crisis.chance = 0;
    });
    const pushed = questioning(25, (d) => (d.discovery.surfaced.attraction = { year: d.currentYear - 3, times: 1 }));
    const back = step(pushed, bundle);
    expect(back.scheduled.map((s) => s.eventId)).toEqual(['resurface_feelings']);
    expect(back.discovery.surfaced.attraction!.times).toBe(2);
    const tooSoon = step(produce(pushed, (d) => void (d.discovery.surfaced.attraction = { year: d.currentYear - 1, times: 1 })), bundle);
    expect(tooSoon.scheduled).toEqual([]);
    const crisisBundle = surfacing((b) => (b.balance.discovery.crisis.chance = 1));
    const crisis = step(produce(pushed, (d) => void (d.character.hidden.innerConflict = 90)), crisisBundle);
    expect(crisis.scheduled.map((s) => s.eventId)).toEqual(['identity_crisis']);
    expect(crisis.discovery.crisisYear).toBe(crisis.currentYear);
  });
});

describe('accepting', () => {
  it('takes the latent attraction, clears it and eases inner conflict, with a history entry', () => {
    const life = questioning(20, (d) => {
      d.discovery.surfaced.attraction = { year: d.currentYear - 2, times: 1 };
      d.character.hidden.innerConflict = 40;
    });
    const after = produce(life, (d) => applyEffects(d, [{ type: 'identity', field: 'attraction', value: 'fromLatent' }], effectCtx(d)));
    expect(after.character.identity.attractedTo).toEqual(['man', 'woman']);
    expect(hasLatent(after, 'attraction')).toBe(false);
    expect(after.character.latent).toEqual({});
    expect(after.discovery.surfaced.attraction).toBeUndefined();
    expect(after.character.hidden.innerConflict).toBe(40 - content.balance.discovery.innerConflict.acceptRelief);
    expect(after.history.at(-1)!.text).toBe('You came to understand that you’re attracted to men and women.'.replace('’', "'"));
    expect(checkInvariants(after, content)).toEqual([]);
  });

  it('takes a latent gender, with the usual pronouns for it when chosen, and later text uses them at once', () => {
    const life = produce(lifeAtAge('gender', 22), (d) => {
      d.character.identity = { genderIdentity: 'man', genderCategory: 'man', genderExpression: 'masculine', pronouns: defaultPronouns(content, 'man'), attractedTo: ['woman'] };
      d.character.latent = { identity: { genderCategory: 'woman', genderIdentity: 'trans woman' } };
    });
    const after = produce(life, (d) =>
      applyEffects(
        d,
        [
          { type: 'identity', field: 'gender', value: 'fromLatent' },
          { type: 'identity', field: 'pronouns', value: 'fromLatent' },
        ],
        effectCtx(d),
      ),
    );
    expect(after.character.identity.genderCategory).toBe('woman');
    expect(after.character.identity.genderIdentity).toBe('trans woman');
    expect(after.character.identity.pronouns).toEqual(defaultPronouns(content, 'woman'));
    expect(renderText('{self.They} {self:is|are} here.', textContext(after, {}, content))).toBe('She is here.');
  });

  it('takes a latent personality tendency', () => {
    const life = produce(lifeAtAge('trait', 30), (d) => {
      d.character.personality.riskTaking = 20;
      d.character.latent = { personality: { riskTaking: 70 } };
    });
    const after = produce(life, (d) => applyEffects(d, [{ type: 'identity', field: 'personality', value: 'fromLatent' }], effectCtx(d)));
    expect(after.character.personality.riskTaking).toBe(70);
    expect(after.character.latent.personality).toBeUndefined();
    expect(after.history.at(-1)!.text).toBe('You found a taste for risk you never let yourself have.');
  });

  it('does nothing without a latent trait', () => {
    const life = produce(lifeAtAge('none', 30), (d) => void (d.character.latent = {}));
    const after = produce(life, (d) => applyEffects(d, [{ type: 'identity', field: 'attraction', value: 'fromLatent' }], effectCtx(d)));
    expect(after.character.identity).toEqual(life.character.identity);
    expect(after.history).toEqual(life.history);
  });
});

describe('try it and decide', () => {
  it('is a romance event, so only adults ever get one (the Stage 5 rule)', () => {
    const def = content.events.unexpected_kiss!;
    expect(isRomanceEvent(def, content)).toBe(true);
    const teen = questioning(16);
    expect(eventWeight(teen, def, content)).toBe(0);
    expect(romanceAllowed(teen, def, {}, content)).toBe(false);
    expect(eventWeight(questioning(25), def, content)).toBeGreaterThan(0);
  });

  it('casts an adult admirer of a gender you’re not attracted to yet, leaning toward your latent one', () => {
    const life = questioning(25);
    const cast = produce(life, (d) => {
      const result = castEvent(d, content.events.unexpected_kiss!, d.rng, content);
      expect(result).not.toBeNull();
      const admirer = d.people[result!.cast.admirer!]!;
      expect(d.currentYear - admirer.birthYear).toBeGreaterThanOrEqual(18);
      expect(d.character.identity.attractedTo).not.toContain(admirer.identity.genderCategory);
      expect(admirer.identity.attractedTo).toContain('man');
    });
    expect(castCandidates(cast, content.events.unexpected_kiss!.cast!.admirer!, content).length).toBeGreaterThan(0);
  });

  it('adds their gender to who you’re attracted to when you liked it, clearing a latent trait it covers', () => {
    const life = questioning(25);
    const after = produce(life, (d) => {
      const { cast } = castEvent(d, content.events.unexpected_kiss!, d.rng, content)!;
      const category = d.people[cast.admirer!]!.identity.genderCategory;
      applyEffects(d, [{ type: 'identity', field: 'attraction', value: 'withRole', role: 'admirer' }], effectCtx(d, cast));
      expect(d.character.identity.attractedTo).toContain(category);
    });
    if (after.character.identity.attractedTo.includes('man')) expect(hasLatent(after, 'attraction')).toBe(false);
    expect(checkInvariants(after, content)).toEqual([]);
  });
});

describe('coming out', () => {
  it('lets family react by how they feel about you', () => {
    const life = lifeAtAge('coming-out', 24);
    const parent = Object.values(life.relationships).find((r) => r.kind === 'parent')!.personId;
    const check = content.events.coming_out_family!.choices!.find((c) => c.id === 'tell_parent')!.check!;
    const close = produce(life, (d) => void Object.assign(d.relationships[parent]!, { affection: 95, trust: 95 }));
    const distant = produce(life, (d) => void Object.assign(d.relationships[parent]!, { affection: 10, trust: 10 }));
    expect(successChance(close, check, content, { parent })).toBeGreaterThan(successChance(distant, check, content, { parent }));
  });

  it('always offers "Not yet"', () => {
    for (const id of content.registries.discovery.comingOut.events) {
      const choices = content.events[id]!.choices!;
      expect(choices.some((c) => c.id === 'not_yet' && c.visibleIf === undefined)).toBe(true);
    }
  });
});

describe('hidden talents', () => {
  it('are found once: their boosts apply and a matching job goes better', () => {
    const life = produce(lifeAtAge('talent', 30), (d) => {
      d.character.hidden.talent = 'math';
      d.character.hidden.talentDiscovered = false;
      d.character.stats.smarts = 50;
      d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18 }, { type: 'bachelor', refId: 'business', year: d.birthYear + 22, tier: 'state' }];
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      d.career.openings = ['accountant'];
      startJob(d, 'accountant', content);
    });
    expect(evaluate({ discovery: { talent: 'hidden' } }, life)).toBe(true);
    const found = produce(life, (d) => discoverTalent(d, content));
    expect(found.character.hidden.talentDiscovered).toBe(true);
    expect(found.character.stats.smarts).toBe(56);
    expect(found.history.at(-1)!.text).toBe('You discovered a real gift for math.');
    const def = content.jobs.accountant!;
    const smartsOnly = produce(found, (d) => void (d.character.stats.smarts = 50));
    expect(performanceAim(smartsOnly, def, content) - performanceAim(life, def, content)).toBe(content.balance.discovery.talent.performanceBonus);
    // Finding it again does nothing.
    expect(produce(found, (d) => discoverTalent(d, content))).toEqual(found);
  });
});

describe('editing identity in the Profile sheet', () => {
  const edit = (life: LifeState, change: Partial<IdentityEdit>): IdentityEdit => ({
    genderCategory: life.character.identity.genderCategory,
    genderIdentity: life.character.identity.genderIdentity,
    genderExpression: life.character.identity.genderExpression,
    pronouns: life.character.identity.pronouns,
    comingOut: false,
    ...change,
  });

  it('works at any age, takes effect at once and never forces a coming-out event', () => {
    for (const age of [0, 6, 15, 40]) {
      const life = lifeAtAge(`edit-${age}`, age);
      const they = defaultPronouns(content, 'nonbinary');
      const params = edit(life, { pronouns: they });
      expect(isLifeActionAvailable(life, 'edit_identity', { identity: params }, content)).toBe(true);
      const after = performAction(life, 'edit_identity', params, content);
      expect(after.phase).toBe('yearStart');
      expect(after.character.identity.pronouns).toEqual(they);
      expect(after.scheduled).toEqual(life.scheduled);
      expect(renderText('{self.they}', textContext(after, {}, content))).toBe(they.subject);
      expect(after.inputLog.at(-1)!.payload.actionId).toBe('edit_identity');
      expect(checkInvariants(after, content)).toEqual([]);
    }
  });

  it('offers a coming-out event next year only when asked', () => {
    const life = lifeAtAge('edit-out', 25);
    const after = performAction(life, 'edit_identity', edit(life, { genderExpression: 'androgynous and loud', comingOut: true }), content);
    expect(after.scheduled).toEqual([expect.objectContaining({ dueYear: life.currentYear + 1 })]);
    expect(content.registries.discovery.comingOut.events).toContain(after.scheduled[0]!.eventId);
  });

  it('clears a matching latent trait and eases inner conflict', () => {
    const life = produce(lifeAtAge('edit-latent', 25), (d) => {
      d.character.identity.genderCategory = 'man';
      d.character.latent = { identity: { genderCategory: 'nonbinary', genderIdentity: 'genderqueer', genderExpression: 'fluid' } };
      d.discovery.surfaced.gender = { year: d.currentYear - 1, times: 1 };
      d.character.hidden.innerConflict = 50;
    });
    const after = produce(life, (d) => editIdentity(d, edit(d, { genderCategory: 'nonbinary', genderIdentity: 'nonbinary', genderExpression: 'Fluid' }), content));
    expect(after.character.latent).toEqual({});
    expect(after.discovery.surfaced.gender).toBeUndefined();
    expect(after.character.hidden.innerConflict).toBe(50 - content.balance.discovery.innerConflict.editRelief);
    // An edit that matches nothing leaves the latent trait and the conflict alone.
    const other = produce(life, (d) => editIdentity(d, edit(d, { genderExpression: 'masculine' }), content));
    expect(other.character.latent.identity?.genderCategory).toBe('nonbinary');
    expect(other.character.hidden.innerConflict).toBe(50);
  });

  it('validates every edit', () => {
    const life = lifeAtAge('edit-bad', 25);
    expect(identityEditIssues(edit(life, { genderIdentity: '   ' }))).toHaveProperty('genderIdentity');
    expect(identityEditIssues({ ...edit(life, {}), pronouns: { ...life.character.identity.pronouns, subject: '' } })).toHaveProperty(['pronouns.subject']);
    expect(() => performAction(life, 'edit_identity', { ...edit(life, {}), genderCategory: 'robot' }, content)).toThrow(InvalidInputError);
    // Nothing changed: there is nothing to save.
    expect(() => performAction(life, 'edit_identity', edit(life, {}), content)).toThrow(InvalidInputError);
  });
});
