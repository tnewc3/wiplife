/**
 * Health (Stage 9): condition onset, course, effects and costs, vice
 * escalation, seeing a doctor (through the debt system), health effects and
 * conditions, and condition deaths in the death check.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle } from '../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from './actions';
import { evaluate } from './conditions';
import { applyEffects } from './events/effects';
import { canSeeDoctor, conditionDeathChance, doctorQuote, onsetChance, seeDoctor } from './health';
import { checkInvariants } from './invariants';
import { endYear, resolveChoice } from './life';
import { cloneRng, createRng } from './rng';
import { getHealthView } from './selectors';
import { runHealth } from './systems/health';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { LifeState } from './types';

/** An adult renting in Chicago, with savings and these conditions (id → severity, treated). */
function adult(conditions: Record<string, [number, boolean]> = {}, setup: (d: LifeState) => void = () => {}, age = 45): LifeState {
  return produce(lifeAtAge('health', age), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.birthYear + 20 };
    d.finances.savings = 0;
    d.health.conditions = Object.entries(conditions).map(([conditionId, [severity, treated]]) => ({ conditionId, since: d.currentYear - 1, severity, treated }));
    setup(d);
  });
}

function withContent(change: (b: ContentBundle) => void): ContentBundle {
  const bundle = cloneJson(content);
  change(bundle);
  return bundle;
}

const run = (life: LifeState, bundle: ContentBundle = content) => produce(life, (d) => runHealth(d, bundle));

describe('condition onset', () => {
  it('follows the age curve, its factors and its requirements', () => {
    const cancer = content.conditions.cancer!;
    expect(onsetChance(adult({}, () => {}, 30), cancer, content)).toBe(0);
    const low = adult({}, (d) => (d.character.hidden.geneticRisk = 0), 70);
    const high = adult({}, (d) => (d.character.hidden.geneticRisk = 100), 70);
    expect(onsetChance(low, cancer, content)).toBeGreaterThan(0);
    expect(onsetChance(high, cancer, content)).toBeGreaterThan(onsetChance(low, cancer, content));
    // Already have it, or as many conditions as allowed: nothing new starts.
    expect(onsetChance(adult({ cancer: [20, false] }, () => {}, 70), cancer, content)).toBe(0);
    const full = adult({ depression: [10, false], back_injury: [10, false], broken_bone: [10, false], dementia: [10, false] }, () => {}, 70);
    expect(onsetChance(full, cancer, content)).toBe(0);
    // A requirement (condition language) must hold.
    const gated = withContent((b) => (b.conditions.cancer!.onset!.requires = { flag: 'in_recovery' }));
    expect(onsetChance(high, gated.conditions.cancer!, gated)).toBe(0);
  });

  it('starts a condition in the yearly step, with a history entry', () => {
    const bundle = withContent((b) => {
      for (const def of Object.values(b.conditions)) if (def.onset) def.onset.chance = [{ at: 0, x: 0 }];
      b.conditions.cancer!.onset!.chance = [{ at: 0, x: 1 }];
      b.conditions.cancer!.onset!.factors = [];
    });
    const after = run(adult(), bundle);
    expect(after.health.conditions.map((c) => c.conditionId)).toEqual(['cancer']);
    expect(after.history.at(-1)!.tags).toEqual(['health', 'diagnosed', 'condition:cancer']);
    expect(checkInvariants(after, bundle)).toEqual([]);
  });
});

describe('condition course and effects', () => {
  it('heals an injury over its course and records the recovery', () => {
    let life = adult({ broken_bone: [30, false] });
    life = run(life);
    expect(life.health.conditions[0]!.severity).toBe(5);
    life = run(life);
    expect(life.health.conditions).toEqual([]);
    expect(life.history.some((e) => e.tags.includes('recovered'))).toBe(true);
  });

  it('pulls on stats by severity, and treatment softens the pull', () => {
    const base = adult({}, (d) => (d.character.stats.happiness = 80));
    const untreated = run(produce(base, (d) => void (d.health.conditions = [{ conditionId: 'depression', since: d.currentYear, severity: 100, treated: false }])));
    const treated = run(produce(base, (d) => void (d.health.conditions = [{ conditionId: 'depression', since: d.currentYear, severity: 100, treated: true }])));
    expect(untreated.character.stats.happiness).toBeLessThan(treated.character.stats.happiness);
    expect(treated.character.stats.happiness).toBeLessThan(80);
  });

  it('escalates vice with an untreated addiction and eases it with treatment', () => {
    const v = content.balance.health.vice;
    const untreated = run(adult({ alcohol_addiction: [40, false] }, (d) => (d.character.hidden.vice = 50)));
    expect(untreated.character.hidden.vice).toBe(50 + v.untreatedPerYear);
    const treated = run(adult({ alcohol_addiction: [40, true] }, (d) => (d.character.hidden.vice = 50)));
    expect(treated.character.hidden.vice).toBe(50 - v.treatedPerYear);
  });

  it('charges medication as medical debt, and an untreated habit as ordinary spending', () => {
    const meds = run(adult({ type_2_diabetes: [50, true] }));
    expect(meds.finances.debts.map((d) => d.kind)).toEqual(['medical']);
    const habit = run(adult({ gambling_addiction: [50, false] }));
    expect(habit.finances.debts.map((d) => d.kind)).toEqual(['personal']);
  });
});

describe('seeing a doctor', () => {
  const sure = withContent((b) => (b.balance.health.doctor.treatChance = [{ at: 0, x: 1 }]));

  it('treats what it can, and the bill goes through the debt system as medical debt', () => {
    const life = adult({ cancer: [40, false] });
    const quote = doctorQuote(life, sure);
    expect(quote.treatment).toBe(sure.conditions.cancer!.costs!.treatment);
    const after = produce(life, (d) => void expect(seeDoctor(d, sure)).toBe('treated'));
    expect(after.health.conditions[0]!.treated).toBe(true);
    expect(after.health.lastVisit).toBe(after.currentYear);
    expect(after.finances.debts).toEqual([expect.objectContaining({ kind: 'medical', balance: quote.visit + quote.treatment })]);
    expect(canSeeDoctor(after)).toBe(false);
    expect(checkInvariants(after, sure)).toEqual([]);
  });

  it('pays from savings first', () => {
    const life = adult({}, (d) => (d.finances.savings = 10_000));
    const after = produce(life, (d) => void seeDoctor(d, content));
    expect(after.finances.savings).toBe(10_000 - doctorQuote(life, content).visit);
    expect(after.finances.debts).toEqual([]);
  });

  it('eases what it cannot treat, and a checkup with nothing to treat does Health good', () => {
    const dementia = produce(adult({ dementia: [40, false] }), (d) => void expect(seeDoctor(d, content)).toBe('managed'));
    expect(dementia.health.conditions[0]!.severity).toBe(40 - content.balance.health.doctor.manageSeverity);
    const healthy = adult({}, (d) => (d.character.stats.health = 50));
    const checked = produce(healthy, (d) => void expect(seeDoctor(d, content)).toBe('clean'));
    expect(checked.character.stats.health).toBe(50 + content.balance.health.doctor.checkupHealth);
  });

  it('costs a child nothing: the family pays', () => {
    const child = produce(lifeAtAge('health-child', 8), (d) => void (d.health.conditions = [{ conditionId: 'broken_bone', since: d.currentYear, severity: 40, treated: false }]));
    const after = produce(child, (d) => void seeDoctor(d, sure));
    expect(after.finances.debts).toEqual([]);
    expect(after.health.conditions[0]!.treated).toBe(true);
  });

  it('is a once-a-year action answered by a result event, and not from prison', () => {
    const life = adult({ cancer: [40, false] });
    expect(isLifeActionAvailable(life, 'see_doctor', {}, sure)).toBe(true);
    const acted = performAction(life, 'see_doctor', {}, sure);
    expect(acted.phase).toBe('action');
    expect(sure.registries.health.doctor.treated.events).toContain(acted.pending[0]!.eventId);
    expect(acted.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'action', payload: { actionId: 'see_doctor', params: {} } });
    const card = acted.pending[0]!;
    const done = finishAction(resolveChoice(acted, card.instanceId, sure.events[card.eventId]!.choices![0]!.id, sure));
    expect(isLifeActionAvailable(done, 'see_doctor', {}, sure)).toBe(false);
    expect(getHealthView(done, sure).doctor.block).toBe('visited');
    const inside = produce(life, (d) => {
      d.housing = { kind: 'incarcerated', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      d.legal = { record: [{ offenseId: 'theft', year: d.currentYear, outcome: 'jail', years: 2 }], incarceratedUntil: d.currentYear + 2 };
    });
    expect(isLifeActionAvailable(inside, 'see_doctor', {}, sure)).toBe(false);
    expect(getHealthView(inside, sure).doctor.block).toBe('prison');
  });
});

describe('health effects and conditions', () => {
  const ctx = (life: LifeState) => ({ def: content.events.dark_season!, cast: {}, rng: cloneRng(life.rng), content });

  it('gives, worsens, eases and treats a condition', () => {
    const life = adult();
    const given = produce(life, (d) => applyEffects(d, [{ type: 'health', conditionId: 'depression', severity: 30 }], ctx(d)));
    expect(given.health.conditions).toEqual([expect.objectContaining({ conditionId: 'depression', severity: 30, treated: false })]);
    const treated = produce(given, (d) => applyEffects(d, [{ type: 'health', conditionId: 'depression', severity: -10, treated: true }], ctx(d)));
    expect(treated.health.conditions[0]).toEqual(expect.objectContaining({ severity: 20, treated: true }));
    const gone = produce(treated, (d) => applyEffects(d, [{ type: 'health', conditionId: 'depression', severity: -50 }], ctx(d)));
    expect(gone.health.conditions).toEqual([]);
    // Easing a condition you don't have does nothing.
    const none = produce(life, (d) => applyEffects(d, [{ type: 'health', conditionId: 'cancer', severity: -10 }], ctx(d)));
    expect(none.health.conditions).toEqual([]);
  });

  it('lets events check conditions, treatment and severity', () => {
    const life = adult({ depression: [40, false] });
    expect(evaluate({ health: { conditions: ['depression'] } }, life)).toBe(true);
    expect(evaluate({ health: { conditions: ['depression'], treated: true } }, life)).toBe(false);
    expect(evaluate({ health: { severity: { gte: 40 } } }, life)).toBe(true);
    expect(evaluate({ health: { conditions: ['cancer'] } }, life)).toBe(false);
  });
});

describe('condition deaths', () => {
  it('scale with severity and are softened by treatment', () => {
    const untreated = conditionDeathChance({ conditionId: 'cancer', since: 0, severity: 100, treated: false }, content);
    const half = conditionDeathChance({ conditionId: 'cancer', since: 0, severity: 50, treated: false }, content);
    const treated = conditionDeathChance({ conditionId: 'cancer', since: 0, severity: 100, treated: true }, content);
    expect(untreated).toBe(content.conditions.cancer!.mortality);
    expect(half).toBeCloseTo(untreated / 2);
    expect(treated).toBeCloseTo(untreated * content.balance.health.treated.mortality);
    expect(conditionDeathChance({ conditionId: 'broken_bone', since: 0, severity: 100, treated: false }, content)).toBe(0);
  });

  it('are put down to the condition’s own cause in the death check', () => {
    const bundle = withContent((b) => {
      b.balance.mortality.background = 0;
      b.balance.mortality.ageCurve.base = 0;
      b.conditions.cancer!.mortality = 1;
    });
    const life = produce(adult({ cancer: [100, false] }), (d) => {
      d.phase = 'yearEnd';
      d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
      d.lifetime.years -= 1;
      d.lifetime.happinessTotal = d.character.stats.happiness * d.lifetime.years;
      d.rng = createRng('death');
    });
    const dead = endYear(life, bundle);
    expect(dead.phase).toBe('dead');
    expect(dead.death!.causeId).toBe('cancer');
  });

});
