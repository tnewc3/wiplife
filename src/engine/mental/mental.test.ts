/**
 * Mental health (M1): onset by trauma, support and relapse; conditions named
 * only after a diagnosis; born-with conditions and how they are inherited;
 * the course with and without care; costs through the finance module; leaning
 * on people; who notices and how they take it; the crisis; the diagnosis as a
 * secret; and the actions that start and stop care.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from '../actions';
import { evaluate } from '../conditions';
import { castCandidates } from '../events/casting';
import { applyEffects } from '../events/effects';
import { onsetChance } from '../health';
import { checkInvariants } from '../invariants';
import { resolveChoice } from '../life';
import { chance, cloneRng, createRng } from '../rng';
import { getHealthView } from '../selectors';
import { runHealth } from '../systems/health';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { Id, LifeState, Reaction } from '../types';
import { careBlock, startCare, stopCare } from './care';
import { gradeDrag, performanceDrag } from './drag';
import { applyCrisis, crisisPossible } from './crisis';
import { diagnose, rollDiagnosis, undiagnosed } from './diagnose';
import { giveNeuro, rollNeuro } from './neuro';
import { runNotice } from './notice';
import { circleSupport, supportScore } from './query';
import { runMental } from './step';
import { canSeeTherapist, seeTherapist } from './therapist';

const bal = content.balance.mentalHealth;

/** An adult renting in Chicago with savings and these conditions (id → severity). */
function adult(conditions: Record<string, number> = {}, setup: (d: LifeState) => void = () => {}, age = 35): LifeState {
  return produce(lifeAtAge('mental', age), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.birthYear + 20 };
    d.finances.savings = 50_000;
    d.health.conditions = Object.entries(conditions).map(([conditionId, severity]) => ({ conditionId, since: d.currentYear - 1, severity, treated: false }));
    setup(d);
  });
}

const template = Object.values(lifeAtAge('mental-template', 30).people)[0]!;

/** Someone close, in your city (not your household), who you trust. */
function withFriend(d: LifeState, id: Id, traits: { kindness?: number; sociability?: number } = {}, trust = 80, affection = 80): void {
  d.people[id] = { ...cloneJson(template), id, alive: true, birthYear: d.currentYear - 30, cityId: d.character.cityId, traits: { ...traits }, tags: ['friend'] };
  delete d.people[id]!.child;
  delete d.people[id]!.life;
  d.relationships[id] = { personId: id, kind: 'friend', status: 'active', affection, trust, memories: [], since: d.currentYear - 5 };
}

/** Nobody in your life (so a test can add exactly the people it wants). */
const alone = (d: LifeState): void => {
  for (const id of Object.keys(d.people).filter((p) => p !== 'p0')) delete d.people[id];
  d.relationships = {};
  d.web = { ties: {}, items: [], nextItem: 1, seen: [] };
};
const run = (life: LifeState, bundle: ContentBundle = content) => produce(life, (d) => runHealth(d, bundle));
const withContent = (change: (b: ContentBundle) => void): ContentBundle => {
  const bundle = cloneJson(content);
  change(bundle);
  return bundle;
};
/** A life whose generator is certain to roll in `fn`'s favor: runs it on many seeds and counts successes. */
function rate(trials: number, fn: (seed: string) => boolean): number {
  let n = 0;
  for (let i = 0; i < trials; i++) if (fn(`m1-${i}`)) n += 1;
  return n / trials;
}

describe('onset', () => {
  it('rises with trauma for PTSD, and falls with support for depression', () => {
    const ptsd = content.conditions.ptsd!;
    const calm = adult({}, (d) => (d.health.mental.trauma = 0));
    const hurt = adult({}, (d) => (d.health.mental.trauma = 70));
    expect(onsetChance(hurt, ptsd, content)).toBeGreaterThan(onsetChance(calm, ptsd, content) * 20);
    const depression = content.conditions.depression!;
    const alone = adult({}, (d) => (d.relationships = {}));
    const held = adult({}, (d) => withFriend(d, 'pf1'));
    expect(circleSupport(held, content)).toBeGreaterThan(circleSupport(alone, content));
    expect(onsetChance(alone, depression, content)).toBeGreaterThan(onsetChance(held, depression, content));
  });

  it('is higher with genetic risk, stress and low happiness', () => {
    const d = content.conditions.depression!;
    const low = adult({}, (x) => ((x.character.hidden.geneticRisk = 0), (x.character.stats.stress = 10), (x.character.stats.happiness = 90)));
    const high = adult({}, (x) => ((x.character.hidden.geneticRisk = 100), (x.character.stats.stress = 90), (x.character.stats.happiness = 10)));
    expect(onsetChance(high, d, content)).toBeGreaterThan(onsetChance(low, d, content) * 3);
  });

  it('never gives a born-with condition, and born-with conditions don’t count toward the limit', () => {
    expect(onsetChance(adult(), content.conditions.adhd!, content)).toBe(0);
    const full = adult({ adhd: 40, neurodivergence: 40, back_injury: 10, broken_bone: 10, dementia: 10 }, (d) => (d.character.hidden.geneticRisk = 100), 70);
    // Three non-neuro conditions of four allowed: depression can still start.
    expect(onsetChance(full, content.conditions.depression!, content)).toBeGreaterThan(0);
  });

  it('is much likelier after recovering, and the effect fades over the years', () => {
    const d = content.conditions.depression!;
    const base = adult();
    const soon = produce(base, (x) => void (x.health.mental.past.depression = { year: x.currentYear - 1, times: 1, diagnosed: true }));
    const later = produce(base, (x) => void (x.health.mental.past.depression = { year: x.currentYear - bal.course.relapse.years, times: 1, diagnosed: true }));
    expect(onsetChance(soon, d, content)).toBeGreaterThan(onsetChance(base, d, content) * 4);
    expect(onsetChance(later, d, content)).toBeCloseTo(onsetChance(base, d, content));
  });

  it('starts a condition unnamed, with no history entry, until it is diagnosed', () => {
    const bundle = withContent((b) => {
      for (const def of Object.values(b.conditions)) if (def.onset) def.onset.chance = [{ at: 0, x: 0 }];
      b.conditions.depression!.onset!.chance = [{ at: 0, x: 1 }];
      b.conditions.depression!.onset!.factors = [];
    });
    const after = run(adult(), bundle);
    const dep = after.health.conditions.find((c) => c.conditionId === 'depression')!;
    expect(dep.diagnosed).toBeUndefined();
    expect(after.history.some((e) => e.tags.includes('diagnosed'))).toBe(false);
    expect(checkInvariants(after, bundle)).toEqual([]);
  });
});

describe('naming a condition only after diagnosis', () => {
  it('keeps unnamed conditions off the Health page and out of "named" conditions', () => {
    const life = adult({ depression: 50, adhd: 40, cancer: 30 });
    const view = getHealthView(life, content);
    expect(view.conditions.map((c) => c.id)).toEqual(['cancer']);
    expect(view.mental.conditions).toEqual([]);
    expect(evaluate({ health: { conditions: ['depression'], named: false } }, life)).toBe(true);
    expect(evaluate({ health: { conditions: ['depression'], named: true } }, life)).toBe(false);
  });

  it('names it once diagnosed, with a history entry and the diagnosing path', () => {
    const life = produce(adult({ depression: 50 }), (d) => void diagnose(d, 'depression', 'therapist', content));
    const dep = life.health.conditions[0]!;
    expect(dep.diagnosed).toBe(life.currentYear);
    expect(dep.diagnosedBy).toBe('therapist');
    expect(life.history.at(-1)!.tags).toEqual(['health', 'diagnosed', 'condition:depression']);
    const view = getHealthView(life, content);
    expect(view.mental.conditions.map((c) => c.name)).toEqual(['Depression']);
    expect(evaluate({ health: { conditions: ['depression'], named: true, within: 0 } }, life)).toBe(true);
    // Naming it twice does nothing.
    expect(produce(life, (d) => void diagnose(d, 'depression', 'doctor', content)).health.conditions[0]!.diagnosedBy).toBe('therapist');
  });

  it('waits for the age a doctor can name it', () => {
    const child = produce(lifeAtAge('mental-kid', 3), (d) => void (d.health.conditions = [{ conditionId: 'adhd', since: d.birthYear, severity: 50, treated: false }]));
    expect(undiagnosed(child, content)).toEqual([]);
    const older = produce(lifeAtAge('mental-kid', 7), (d) => void (d.health.conditions = [{ conditionId: 'adhd', since: d.birthYear, severity: 50, treated: false }]));
    expect(undiagnosed(older, content)).toEqual(['adhd']);
  });

  it('is likelier from a therapist than a doctor, and worse conditions are named more often', () => {
    const named = (by: 'doctor' | 'therapist', severity: number) =>
      rate(300, (seed) => {
        const life = produce(adult({ depression: severity }), (d) => void (d.rng = createRng(seed)));
        return produce(life, (d) => void rollDiagnosis(d, by, content)).health.conditions[0]!.diagnosed !== undefined;
      });
    expect(named('therapist', 40)).toBeGreaterThan(named('doctor', 40));
    expect(named('doctor', 90)).toBeGreaterThan(named('doctor', 5));
  });

  it('turns a doctor visit into a "diagnosed" answer when something is named', () => {
    const sure = withContent((b) => (b.balance.mentalHealth.diagnosis.doctor = [{ at: 0, x: 1 }]));
    const life = adult({ anxiety_disorder: 50 });
    const acted = performAction(life, 'see_doctor', {}, sure);
    expect(sure.registries.health.doctor.diagnosed.events).toContain(acted.pending[0]!.eventId);
    expect(acted.pending[0]!.eventId).toBe('dx_anxiety');
    const card = acted.pending[0]!;
    const done = finishAction(resolveChoice(acted, card.instanceId, 'wait', sure));
    expect(done.health.conditions[0]!.diagnosed).toBe(done.currentYear);
  });

  it('is a secret: a diagnosis starts a knowledge item that others may hear', () => {
    const life = produce(
      adult({ depression: 50 }, (d) => withFriend(d, 'pf1')),
      (d) => void diagnose(d, 'depression', 'doctor', content),
    );
    const item = life.web.items.find((i) => i.kind === 'mentalHealth');
    expect(item).toBeDefined();
    expect(item!.subject).toBe('you');
    expect(item!.truth).toBe('depression');
    expect(content.registries.web.kinds.mentalHealth.secret).toBe(true);
  });
});

describe('born-with conditions', () => {
  it('are rolled at the population rate, and likelier with an affected parent', () => {
    const base = rate(2000, (seed) => rollNeuro(createRng(seed), content, []).includes('adhd'));
    const one = rate(2000, (seed) => rollNeuro(createRng(seed), content, [['adhd']]).includes('adhd'));
    const two = rate(2000, (seed) => rollNeuro(createRng(seed), content, [['adhd'], ['adhd']]).includes('adhd'));
    expect(base).toBeGreaterThan(bal.neuro.adhd!.rate * 0.6);
    expect(base).toBeLessThan(bal.neuro.adhd!.rate * 1.5);
    expect(one).toBeGreaterThan(base * 2);
    expect(two).toBeGreaterThan(one);
  });

  it('give a severity and shift your personality at birth, and stay unnamed', () => {
    const life = produce(lifeAtAge('neuro-birth', 0), (d) => {
      d.health.conditions = [];
      d.character.personality.discipline = 60;
      giveNeuro(d, ['adhd'], content);
    });
    expect(life.health.conditions).toEqual([expect.objectContaining({ conditionId: 'adhd', since: life.birthYear })]);
    expect(life.health.conditions[0]!.diagnosed).toBeUndefined();
    expect(life.character.personality.discipline).toBe(60 + bal.neuro.adhd!.traits.discipline!);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('give strengths as well as challenges every year, and care softens only the challenges', () => {
    const base = adult({ adhd: 100 }, (d) => ((d.character.stats.smarts = 50), (d.character.stats.stress = 20)));
    const bundle = withContent((b) => (b.conditions.adhd!.strengths = { smarts: { perYear: 5, limit: 90 } }));
    const after = run(base, bundle);
    expect(after.character.stats.smarts).toBeGreaterThan(50);
    expect(after.character.stats.stress).toBeGreaterThan(20);
    const cared = run(
      produce(base, (d) => {
        diagnose(d, 'adhd', 'assessment', bundle);
        startCare(d, 'adhd', 'medication', bundle);
      }),
      bundle,
    );
    expect(cared.character.stats.smarts).toBeGreaterThanOrEqual(after.character.stats.smarts);
    expect(cared.health.conditions[0]!.severity).toBe(100);
  });

  it('never recover: severity does not change from year to year', () => {
    const life = adult({ neurodivergence: 60 });
    expect(run(life).health.conditions[0]!.severity).toBe(60);
  });
});

describe('the course of a condition', () => {
  const calm = withContent((b) => {
    b.balance.mentalHealth.course.swing = 0;
    b.balance.mentalHealth.course.flare.chance = 0;
    b.conditions.depression!.course = { untreated: 4, treated: -12 };
  });
  const sever = (life: LifeState, bundle = calm) => run(life, bundle).health.conditions[0]?.severity ?? 0;

  it('worsens untreated, and improves with therapy, with medication, and most with both', () => {
    const named = produce(adult({ depression: 50 }), (d) => void diagnose(d, 'depression', 'doctor', calm));
    const none = sever(named);
    const therapy = sever(produce(named, (d) => void startCare(d, 'depression', 'therapy', calm)));
    const meds = sever(produce(named, (d) => void startCare(d, 'depression', 'medication', calm)));
    const both = sever(
      produce(named, (d) => {
        startCare(d, 'depression', 'therapy', calm);
        startCare(d, 'depression', 'medication', calm);
      }),
    );
    expect(none).toBeGreaterThan(50);
    expect(therapy).toBeLessThan(none);
    expect(meds).toBeLessThan(none);
    expect(both).toBeLessThanOrEqual(Math.min(therapy, meds));
  });

  it('can fall to nothing (recovery) and is then remembered, with its name', () => {
    const named = produce(adult({ depression: 3 }), (d) => void (diagnose(d, 'depression', 'doctor', calm), startCare(d, 'depression', 'therapy', calm)));
    const recovered = run(named, calm);
    expect(recovered.health.conditions).toEqual([]);
    expect(recovered.health.mental.past.depression).toEqual({ year: recovered.currentYear, times: 1, diagnosed: true });
    expect(recovered.history.at(-1)!.tags).toEqual(['health', 'recovered', 'condition:depression']);
    expect(evaluate({ mental: { recovered: ['depression'] } }, recovered)).toBe(true);
  });

  it('can come back, named, with a history entry', () => {
    const bundle = withContent((b) => {
      for (const def of Object.values(b.conditions)) if (def.onset) def.onset.chance = [{ at: 0, x: 0 }];
      b.conditions.depression!.onset!.chance = [{ at: 0, x: 1 }];
      b.conditions.depression!.onset!.factors = [];
    });
    const life = produce(adult(), (d) => void (d.health.mental.past.depression = { year: d.currentYear - 3, times: 1, diagnosed: true }));
    const after = run(life, bundle);
    expect(after.health.conditions[0]).toEqual(expect.objectContaining({ conditionId: 'depression', diagnosed: after.currentYear }));
    expect(after.history.at(-1)!.tags).toEqual(['health', 'relapsed', 'condition:depression']);
  });

  it('flares up now and then, less in care', () => {
    const flaring = withContent((b) => {
      b.balance.mentalHealth.course.swing = 0;
      b.balance.mentalHealth.course.flare.chance = 1;
      b.balance.mentalHealth.course.flare.careMult = 0;
      b.conditions.depression!.course = { untreated: 0, treated: 0 };
    });
    const life = adult({ depression: 40 });
    expect(sever(life, flaring)).toBeGreaterThanOrEqual(40 + bal.course.flare.severity.min);
    const inCare = produce(life, (d) => void (diagnose(d, 'depression', 'doctor', flaring), startCare(d, 'depression', 'therapy', flaring)));
    expect(sever(inCare, flaring)).toBe(40);
  });

  it('weighs on work and grades while ignored, and not when in care', () => {
    const calmer = withContent((b) => (b.balance.mentalHealth.course.swing = 0));
    const ignored = adult({ depression: 80 }, (d) => void (d.character.cityId = 'chicago'));
    expect(content.balance.mentalHealth.course.ignored.performance).toBeLessThan(0);
    // The drag reads the same state the Health page shows.
    expect(performanceDrag(ignored, calmer)).toBeLessThan(0);
    expect(gradeDrag(ignored, calmer)).toBeLessThan(0);
    const cared = produce(ignored, (d) => void (diagnose(d, 'depression', 'doctor', calmer), startCare(d, 'depression', 'medication', calmer)));
    expect(performanceDrag(cared, calmer)).toBe(0);
  });
});

describe('caring for a condition', () => {
  const named = (conditions: Record<string, number> = { depression: 60 }, setup: (d: LifeState) => void = () => {}) =>
    produce(adult(conditions, setup), (d) => {
      for (const id of Object.keys(conditions)) diagnose(d, id, 'doctor', content);
    });

  it('charges therapy and medication through the finance module: savings first, then medical debt', () => {
    const rich = produce(named(), (d) => void startCare(d, 'depression', 'therapy', content));
    expect(rich.finances.savings).toBe(50_000 - Math.round(bal.care.therapy.intake * (content.cities.chicago?.costOfLiving ?? 1)));
    expect(rich.finances.debts).toEqual([]);
    const broke = produce(named({ depression: 60 }, (d) => (d.finances.savings = 0)), (d) => void startCare(d, 'depression', 'medication', content));
    expect(broke.finances.debts).toEqual([expect.objectContaining({ kind: 'medical' })]);
    // The yearly cost: therapy once however many conditions it covers; medication for each condition.
    const both = produce(named({ depression: 60, anxiety_disorder: 40 }), (d) => {
      startCare(d, 'depression', 'therapy', content);
      startCare(d, 'anxiety_disorder', 'therapy', content);
      startCare(d, 'depression', 'medication', content);
    });
    const before = both.finances.savings;
    const after = run(both);
    const col = content.cities.chicago?.costOfLiving ?? 1;
    expect(before - after.finances.savings).toBeGreaterThanOrEqual(Math.round(bal.care.therapy.yearly * col) + Math.round(bal.care.medication.yearly * col));
    expect(before - after.finances.savings).toBeLessThan(Math.round(bal.care.therapy.yearly * col) * 2 + Math.round(bal.care.medication.yearly * col) * 2);
  });

  it('costs a child nothing: the family pays', () => {
    const kid = produce(lifeAtAge('mental-care-kid', 9), (d) => {
      d.health.conditions = [{ conditionId: 'anxiety_disorder', since: d.currentYear, severity: 50, treated: false }];
      diagnose(d, 'anxiety_disorder', 'doctor', content);
      startCare(d, 'anxiety_disorder', 'therapy', content);
    });
    expect(kid.finances.debts).toEqual([]);
    expect(kid.health.conditions[0]!.treated).toBe(true);
  });

  it('marks professional care as treated, and leaning on people as not', () => {
    const base = named({ depression: 60 }, (d) => withFriend(d, 'pf1'));
    const therapy = produce(base, (d) => void startCare(d, 'depression', 'therapy', content));
    expect(therapy.health.conditions[0]).toEqual(expect.objectContaining({ treated: true, care: ['therapy'] }));
    expect(therapy.history.at(-1)!.tags).toEqual(['health', 'treated', 'condition:depression']);
    const lean = produce(base, (d) => void startCare(d, 'depression', 'support', content));
    expect(lean.health.conditions[0]).toEqual(expect.objectContaining({ treated: false, care: ['support'] }));
    const off = produce(therapy, (d) => void stopCare(d, 'depression', 'therapy', content));
    expect(off.health.conditions[0]!.treated).toBe(false);
    expect(off.health.conditions[0]!.care).toBeUndefined();
  });

  it('needs a named condition, a fitting care, and for leaning on people, someone to lean on', () => {
    const unnamed = adult({ depression: 60 }, (d) => withFriend(d, 'pf1'));
    expect(careBlock(unnamed, 'depression', 'therapy', content)).toBe('unnamed');
    expect(careBlock(named(), 'neurodivergence', 'therapy', content)).toBe('unknown');
    const nd = produce(adult({ neurodivergence: 60 }, (d) => withFriend(d, 'pf1')), (d) => void diagnose(d, 'neurodivergence', 'assessment', content));
    expect(careBlock(nd, 'neurodivergence', 'medication', content)).toBe('unsuitable');
    const lonely = named({ depression: 60 }, (d) => ((d.relationships = {}), (d.people = {})));
    expect(careBlock(lonely, 'depression', 'support', content)).toBe('alone');
    expect(careBlock(named({ depression: 60 }, (d) => withFriend(d, 'pf1')), 'depression', 'support', content)).toBeNull();
  });

  it('shows each way’s cost and trade-offs on the Health page, and who it would draw on', () => {
    const life = named({ depression: 60 }, (d) => (alone(d), withFriend(d, 'pf1')));
    const dep = getHealthView(life, content).mental.conditions[0]!;
    expect(dep.care.map((o) => o.care)).toEqual(['therapy', 'medication', 'support']);
    expect(dep.care.find((o) => o.care === 'therapy')!.yearly).toBeGreaterThan(0);
    expect(dep.care.find((o) => o.care === 'support')!.people).toHaveLength(1);
  });

  it('can bring a flare-up when you stop medication', () => {
    const certain = withContent((b) => (b.balance.mentalHealth.care.medication.stopFlare = 1));
    const life = produce(named({ depression: 40 }), (d) => void startCare(d, 'depression', 'medication', certain));
    const stopped = produce(life, (d) => void stopCare(d, 'depression', 'medication', certain));
    expect(stopped.health.conditions[0]!.severity).toBeGreaterThan(40);
  });

  it('gives medication a chance of side effects each year', () => {
    const sure = withContent((b) => (b.balance.mentalHealth.care.medication.sideEffectChance = 1));
    const life = produce(named({ adhd: 50 }), (d) => void (startCare(d, 'adhd', 'medication', sure), (d.character.stats.health = 80)));
    const after = run(life, sure);
    expect(after.health.mental.sideEffectYear).toBe(after.currentYear);
    expect(after.character.stats.health).toBeLessThan(80);
    expect(evaluate({ mental: { sideEffects: true } }, after)).toBe(true);
  });

  it('is started and stopped through actions, recorded for replay', () => {
    const life = named({ depression: 60 }, (d) => withFriend(d, 'pf1'));
    expect(isLifeActionAvailable(life, 'set_care', { conditionId: 'depression', care: 'therapy', on: true }, content)).toBe(true);
    expect(isLifeActionAvailable(life, 'set_care', { conditionId: 'depression', care: 'therapy', on: false }, content)).toBe(false);
    const on = performAction(life, 'set_care', { conditionId: 'depression', care: 'therapy', on: true }, content);
    expect(on.health.conditions[0]!.care).toEqual(['therapy']);
    expect(on.inputLog.at(-1)).toEqual({ year: on.currentYear, kind: 'action', payload: { actionId: 'set_care', params: { conditionId: 'depression', care: 'therapy', on: true } } });
    const off = performAction(on, 'set_care', { conditionId: 'depression', care: 'therapy', on: false }, content);
    expect(off.health.conditions[0]!.treated).toBe(false);
    expect(() => performAction(life, 'set_care', { conditionId: 'depression', care: 'nope', on: true }, content)).toThrow();
  });
});

describe('seeing a therapist', () => {
  it('costs a medical cost once a year, and names what you carry (or answers with a talk)', () => {
    const sure = withContent((b) => (b.balance.mentalHealth.diagnosis.therapist = [{ at: 0, x: 1 }]));
    const life = adult({ ptsd: 50 });
    expect(canSeeTherapist(life, sure)).toBe(true);
    const acted = performAction(life, 'see_therapist', {}, sure);
    expect(acted.phase).toBe('action');
    expect(acted.health.mental.lastTherapist).toBe(acted.currentYear);
    expect(acted.health.conditions[0]!.diagnosed).toBe(acted.currentYear);
    expect(acted.finances.savings).toBeLessThan(life.finances.savings);
    expect(acted.pending[0]!.eventId).toBe('dx_ptsd');
    const done = finishAction(resolveChoice(acted, acted.pending[0]!.instanceId, 'wait', sure));
    expect(isLifeActionAvailable(done, 'see_therapist', {}, sure)).toBe(false);
    expect(getHealthView(done, sure).mental.therapist.block).toBe('visited');

    const healthy = adult();
    const talked = performAction(healthy, 'see_therapist', {}, content);
    expect(talked.pending[0]!.eventId).toBe('therapist_talked');
  });

  it('is for people from age 10, never from prison', () => {
    expect(canSeeTherapist(lifeAtAge('mental-young', 6), content)).toBe(false);
    const inside = produce(adult(), (d) => void (d.housing = { kind: 'incarcerated', cityId: d.character.cityId, annualCost: 0, since: d.currentYear }));
    expect(canSeeTherapist(inside, content)).toBe(false);
    expect(produce(adult(), (d) => void seeTherapist(d, content)).health.mental.lastTherapist).toBeDefined();
  });
});

describe('who notices, and how they take it', () => {
  const noticing = withContent((b) => {
    b.balance.mentalHealth.notice.base = 1;
    b.balance.mentalHealth.notice.maxPerYear = 5;
  });
  const struggling = (setup: (d: LifeState) => void = () => {}) => adult({ depression: 70 }, (d) => (d.relationships = {}, d.people = {}, setup(d)));

  it('is likelier the closer they are and the nearer they live', () => {
    const mild = withContent((b) => (b.balance.mentalHealth.notice.base = 0.12));
    const lives = {
      close: struggling((d) => withFriend(d, 'pf1', {}, 90, 90)),
      far: struggling((d) => withFriend(d, 'pf1', {}, 15, 15)),
      home: struggling((d) => (withFriend(d, 'pf1', {}, 90, 90), (d.housing = { ...d.housing, partnerId: 'pf1' }))),
    };
    const noticed = (kind: keyof typeof lives) =>
      rate(400, (seed) => Object.keys(produce(lives[kind], (d) => void ((d.rng = createRng(seed)), runNotice(d, mild))).health.mental.noticed).length > 0);
    expect(noticed('close')).toBeGreaterThan(noticed('far'));
    expect(noticed('home')).toBeGreaterThan(noticed('close'));
  });

  it('only happens while you struggle, and fades after a while', () => {
    const calm = adult({ depression: 5 }, (d) => withFriend(d, 'pf1'));
    expect(Object.keys(produce(calm, (d) => void runNotice(d, noticing)).health.mental.noticed)).toEqual([]);
    const forgotten = produce(calm, (d) => void (d.health.mental.noticed.pf1 = { since: d.currentYear - 20, year: d.currentYear - 20, reaction: 'supportive' }));
    expect(Object.keys(produce(forgotten, (d) => void runNotice(d, noticing)).health.mental.noticed)).toEqual([]);
  });

  it('reacts by personality: kind people are supportive, unkind ones dismissive', () => {
    const reaction = (kindness: number): Reaction | undefined => {
      const life = struggling((d) => withFriend(d, 'pf1', { kindness, sociability: 50 }));
      const counts: Record<Reaction, number> = { supportive: 0, neutral: 0, dismissive: 0 };
      for (let i = 0; i < 80; i++) {
        const noticedLife = produce(life, (d) => void ((d.rng = createRng(`r-${i}`)), runNotice(d, noticing)));
        const r = noticedLife.health.mental.noticed.pf1?.reaction;
        if (r) counts[r] += 1;
      }
      return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0] as Reaction);
    };
    expect(reaction(95)).toBe('supportive');
    expect(reaction(2)).toBe('dismissive');
  });

  it('adds up to support that helps recovery, or its absence that hurts', () => {
    const base = adult({ depression: 60 }, (d) => withFriend(d, 'pf1', {}, 80, 90));
    const supportive = produce(base, (d) => void (d.health.mental.noticed.pf1 = { since: d.currentYear, year: d.currentYear, reaction: 'supportive' }));
    const dismissive = produce(base, (d) => void (d.health.mental.noticed.pf1 = { since: d.currentYear, year: d.currentYear, reaction: 'dismissive' }));
    expect(supportScore(supportive, false, content)).toBeGreaterThan(0);
    expect(supportScore(dismissive, false, content)).toBeLessThan(0);
    const calm = withContent((b) => ((b.balance.mentalHealth.course.swing = 0), (b.balance.mentalHealth.course.flare.chance = 0)));
    const sev = (l: LifeState) => run(l, calm).health.conditions[0]!.severity;
    expect(sev(supportive)).toBeLessThan(sev(base));
    expect(sev(dismissive)).toBeGreaterThan(sev(base));
  });

  it('wears on the people you lean on, and on the partner you live with', () => {
    const lean = produce(
      adult({ depression: 80 }, (d) => withFriend(d, 'pf1', {}, 90, 90)),
      (d) => {
        diagnose(d, 'depression', 'doctor', content);
        d.health.mental.noticed.pf1 = { since: d.currentYear, year: d.currentYear, reaction: 'supportive' };
        startCare(d, 'depression', 'support', content);
        d.people.pf1!.mood = 70;
      },
    );
    const after = produce(lean, (d) => void runMental(d, content));
    expect(after.people.pf1!.mood).toBeLessThan(70);
  });

  it('lets an event be cast with the person who noticed, closest first, and only those', () => {
    const life = produce(adult({ depression: 70 }, (d) => (withFriend(d, 'pf1', {}, 90, 90), withFriend(d, 'pf2', {}, 50, 50))), (d) => {
      d.health.mental.noticed.pf1 = { since: d.currentYear, year: d.currentYear, reaction: 'supportive' };
      d.health.mental.noticed.pf2 = { since: d.currentYear, year: d.currentYear, reaction: 'dismissive' };
    });
    const ids = (r: Reaction[]) => castCandidates(life, { noticed: r, presence: 'anywhere' }, content).map((p) => p.id);
    expect(ids(['supportive'])).toEqual(['pf1']);
    expect(ids(['dismissive'])).toEqual(['pf2']);
    expect(ids(['supportive', 'dismissive'])).toEqual(['pf1', 'pf2']);
    expect(evaluate({ role: 'x', mental: { reaction: ['supportive'] } }, life, { cast: { x: 'pf1' } })).toBe(true);
    expect(evaluate({ role: 'x', mental: { reaction: ['supportive'] } }, life, { cast: { x: 'pf2' } })).toBe(false);
  });
});

describe('telling someone', () => {
  const ctx = (life: LifeState, cast: Record<string, Id>) => ({ def: content.events.dx_depression!, cast, rng: cloneRng(life.rng), content });

  it('is taken by who they are, changes how they feel about you and schedules the matching follow-up', () => {
    const kind = produce(adult({ depression: 60 }, (d) => withFriend(d, 'pf1', { kindness: 100, sociability: 100 }, 60, 60)), (d) => {
      d.rng = createRng('confide');
    });
    const told = produce(kind, (d) =>
      applyEffects(d, [{ type: 'mental', action: 'confide', role: 'friend', then: { supportive: 'told_supportive', neutral: 'told_neutral', dismissive: 'told_dismissive' } }], ctx(d, { friend: 'pf1' })),
    );
    const noticing = told.health.mental.noticed.pf1!;
    expect(noticing.told).toBe(true);
    expect(told.scheduled.map((s) => s.eventId)).toEqual([`told_${noticing.reaction}`]);
    const rel = told.relationships.pf1!;
    expect(rel.trust).not.toBe(60);
    expect(checkInvariants(told, content)).toEqual([]);
  });
});

describe('a crisis', () => {
  it('names everything you carry, makes it worse, and is rare (not twice in a row)', () => {
    const life = produce(adult({ depression: 60, adhd: 40 }, (d) => (d.character.stats.stress = 70)), (d) => void applyCrisis(d, content));
    expect(life.health.conditions.every((c) => c.diagnosed !== undefined)).toBe(true);
    expect(life.health.conditions.find((c) => c.conditionId === 'depression')!.severity).toBe(60 + bal.crisis.severity);
    expect(life.health.conditions.find((c) => c.conditionId === 'depression')!.diagnosedBy).toBe('crisis');
    expect(life.health.mental.crises).toBe(1);
    expect(life.character.stats.stress).toBe(70 + bal.crisis.stress);
    expect(crisisPossible(life, content)).toBe(false);
    expect(evaluate({ mental: { crisis: true } }, life)).toBe(true);
    expect(evaluate({ not: { mental: { crisis: bal.crisis.cooldownYears } } }, life)).toBe(false);
  });

  it('is only possible with a mental health condition', () => {
    expect(crisisPossible(adult(), content)).toBe(false);
    expect(crisisPossible(adult({ adhd: 50 }), content)).toBe(false);
    expect(crisisPossible(adult({ anxiety_disorder: 50 }), content)).toBe(true);
  });
});

describe('trauma', () => {
  it('builds from events, fades each year and leads toward PTSD', () => {
    const life = produce(adult(), (d) => applyEffects(d, [{ type: 'mental', action: 'trauma', amount: 40 }], { def: content.events.hard_grip!, cast: {}, rng: cloneRng(d.rng), content }));
    expect(life.health.mental.trauma).toBe(40);
    expect(run(life).health.mental.trauma).toBe(40 - bal.trauma.decay);
    expect(evaluate({ mental: { trauma: { gte: 30 } } }, life)).toBe(true);
    expect(chance(createRng('x'), 0)).toBe(false);
  });
});

describe('the content', () => {
  it('has no suicide or self-harm choice (the content build enforces this) and describes medication generally', () => {
    const text = JSON.stringify(content.events);
    expect(text).not.toMatch(/suicid|self-harm|self harm/i);
    expect(text).not.toMatch(/\d+ ?mg\b/i);
  });
});
