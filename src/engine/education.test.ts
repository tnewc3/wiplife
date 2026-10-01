import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle, Effect, EventDef } from '../content/schemas';
import { isLifeActionAvailable, performAction } from './actions';
import { evaluate } from './conditions';
import {
  admissionChance,
  applicationGpa,
  applyBlock,
  billFor,
  expectedGrade,
  letterGrade,
  modelChance,
  placeForAge,
  schoolAges,
  scholarshipShare,
  yearGrade,
  type ApplyTarget,
} from './education';
import { applyEffects } from './events/effects';
import { InvalidInputError } from './creation/input';
import { checkInvariants } from './invariants';
import { createRng } from './rng';
import { getApplicationOptions, getMoneyView, getSchoolView } from './selectors';
import { advanceAge } from './systems/aging';
import { runEconomy } from './systems/economy';
import { runEducation } from './systems/education';
import { lifeAtAge } from './testFixtures';
import type { Enrollment, LifeState } from './types';

const edu = content.balance.education;
const ages = schoolAges(content);

/** Content where every admission and GED model gives exactly `percent`. */
function odds(percent: number): ContentBundle {
  return produce(content, (c) => {
    const a = c.balance.education.admission;
    for (const m of [a.college.community, a.college.state, a.college.elite, a.trade, ...Object.values(a.grad), c.balance.education.ged.pass]) {
      m.min = percent;
      m.max = percent;
    }
  });
}
const always = odds(100);
const never = odds(0);

/** One year passes for the school step only (aging, then education). */
function year(life: LifeState, bundle: ContentBundle = content): LifeState {
  return produce(life, (d) => {
    // What beginYear and endYear keep track of, so invariants hold.
    d.inputLog.push({ year: d.currentYear, kind: 'ageUp', payload: {} });
    d.lifetime.years += 1;
    d.lifetime.happinessTotal += d.character.stats.happiness;
    advanceAge(d, bundle);
    runEducation(d, bundle);
    d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: { ...d.character.stats } };
  });
}

function years(life: LifeState, n: number, bundle: ContentBundle = content): LifeState {
  let current = life;
  for (let i = 0; i < n; i++) current = year(current, bundle);
  return current;
}

/** A child just before school starts, with average stats and a middle-class family. */
function preschooler(seed = 'school', setup: (d: LifeState) => void = () => {}): LifeState {
  return produce(lifeAtAge(seed, ages.startAge - 1), (d) => {
    d.character.familyWealth = 'middle';
    Object.assign(d.character.stats, { smarts: 60, stress: 10 });
    d.character.personality.discipline = 60;
    setup(d);
  });
}

const act = (life: LifeState, id: string, params?: unknown, bundle: ContentBundle = content) => performAction(life, id, params, bundle);

/** An 18-year-old who has just finished high school with this GPA. */
function graduate(seed: string, gpa = 3.2, setup: (d: LifeState) => void = () => {}): LifeState {
  return produce(lifeAtAge(seed, 18), (d) => {
    d.character.familyWealth = 'middle';
    // Enough for application fees.
    d.finances.savings = 1_000;
    d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear, gpa });
    for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent') rel.status = 'active';
    setup(d);
  });
}

const enrolled = (d: LifeState, e: Partial<Enrollment> & Pick<Enrollment, 'program'>) => {
  d.education.current = { year: 1, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear, ...e };
};

describe('automatic school', () => {
  it('starts kindergarten at the start age and moves through elementary, middle and high school with age', () => {
    let life = preschooler();
    expect(life.education.current).toBeNull();
    for (let age = ages.startAge; age < ages.highEnd; age++) {
      life = year(life);
      const expected = placeForAge(age, content)!;
      expect(life.character.age).toBe(age);
      expect(life.education.current).toMatchObject({ program: expected.program, year: expected.year });
      expect(checkInvariants(life, content)).toEqual([]);
    }
    const tags = life.history.flatMap((e) => e.tags);
    expect(tags).toEqual(expect.arrayContaining(['startedSchool', 'startedMiddle', 'startedHigh']));
  });

  it('graduates from high school as you turn 18, with a diploma and a GPA', () => {
    const life = years(preschooler('grad18'), ages.highEnd - ages.startAge + 1);
    expect(life.character.age).toBe(ages.highEnd);
    expect(life.education.current).toBeNull();
    const diploma = life.education.credentials.find((c) => c.type === 'hs_diploma')!;
    expect(diploma.year).toBe(life.currentYear);
    expect(diploma.gpa).toBeGreaterThan(0);
    expect(life.history.at(-1)!.tags).toContain('graduatedHigh');
    // Nothing more happens on its own.
    expect(year(life).education.current).toBeNull();
  });

  it('holds a failing student back once at most, so school always ends at 18 or 19', () => {
    for (let i = 0; i < 20; i++) {
      let life = preschooler(`failing-${i}`, (d) => {
        d.character.familyWealth = 'poor';
        Object.assign(d.character.stats, { smarts: 0, stress: 100 });
        d.character.personality.discipline = 0;
      });
      while (!life.education.credentials.length) {
        life = year(life);
        expect(life.character.age).toBeLessThanOrEqual(ages.lastDiplomaAge);
        expect(checkInvariants(life, content)).toEqual([]);
      }
      expect([ages.highEnd, ages.lastDiplomaAge]).toContain(life.character.age);
    }
    const held = years(preschooler('held', (d) => {
      Object.assign(d.character.stats, { smarts: 0, stress: 100 });
      d.character.personality.discipline = 0;
      d.character.familyWealth = 'poor';
    }), ages.lastDiplomaAge - ages.startAge + 1);
    expect(held.history.some((e) => e.tags.includes('heldBack'))).toBe(true);
    expect(held.education.credentials[0]).toMatchObject({ type: 'hs_diploma', year: held.birthYear + ages.lastDiplomaAge });
  });
});

describe('grades', () => {
  const base = produce(lifeAtAge('grades', 15), (d) => {
    Object.assign(d.character.stats, { smarts: 50, stress: 10 });
    d.character.personality.discipline = 50;
    d.character.familyWealth = 'middle';
  });
  const with_ = (setup: (d: LifeState) => void) => produce(base, setup);
  const high = { program: 'high' as const };

  it('rise with Smarts and Discipline and fall with Stress and hard majors', () => {
    const g = (l: LifeState, place: Parameters<typeof expectedGrade>[1] = high) => expectedGrade(l, place, content);
    expect(g(with_((d) => void (d.character.stats.smarts = 80)))).toBeGreaterThan(g(base));
    expect(g(with_((d) => void (d.character.personality.discipline = 80)))).toBeGreaterThan(g(base));
    expect(g(with_((d) => void (d.character.stats.stress = 95)))).toBeLessThan(g(base));
    expect(g(base, { program: 'college', tier: 'state', majorId: 'engineering' })).toBeLessThan(g(base, { program: 'college', tier: 'state', majorId: 'business' }));
    expect(g(with_((d) => void (d.character.familyWealth = 'rich')))).toBeGreaterThan(g(with_((d) => void (d.character.familyWealth = 'poor'))));
  });

  it('stay within 0–4 and within the swing of what your stats point to, plus what events added', () => {
    const rng = createRng('grades');
    const enrollment: Enrollment = { program: 'high', year: 1, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: 0 };
    const expected = expectedGrade(base, enrollment, content);
    for (let i = 0; i < 200; i++) {
      const grade = yearGrade(base, enrollment, content, rng);
      expect(Math.abs(grade - expected)).toBeLessThanOrEqual(edu.grades.swing + 0.011);
      const boosted = yearGrade(base, { ...enrollment, boost: 1 }, content, rng);
      expect(boosted).toBeGreaterThanOrEqual(0);
      expect(boosted).toBeLessThanOrEqual(4);
    }
  });

  it('show as letter grades', () => {
    expect(letterGrade(4, content)).toBe('A');
    expect(letterGrade(3.2, content)).toBe('B+');
    expect(letterGrade(2.9, content)).toBe('B');
    expect(letterGrade(0, content)).toBe('F');
  });

  it('are nudged by events', () => {
    const life = produce(base, (d) => enrolled(d, { program: 'high' }));
    const effect: Effect = { type: 'education', action: 'grades', value: 0.5 };
    const def = { id: 'x', rarity: 'common' } as EventDef;
    const after = produce(life, (d) => applyEffects(d, [effect], { def, cast: {}, rng: createRng('e'), content }));
    expect(after.education.current!.boost).toBe(0.5);
    // Not in school: nothing to nudge.
    const out = produce(lifeAtAge('out', 30), (d) => applyEffects(d, [effect], { def, cast: {}, rng: createRng('e'), content }));
    expect(out.education.current).toBeNull();
  });
});

describe('admissions', () => {
  const state: ApplyTarget = { program: 'college', tier: 'state', majorId: 'nursing' };
  const elite: ApplyTarget = { program: 'college', tier: 'elite', majorId: 'nursing' };

  it('respond to GPA and stats', () => {
    const at = (gpa: number, smarts = 50) => admissionChance(graduate('odds', gpa, (d) => void (d.character.stats.smarts = smarts)), state, content);
    expect(at(3.8)).toBeGreaterThan(at(3.0));
    expect(at(3.0)).toBeGreaterThan(at(2.2));
    expect(at(3.0, 80)).toBeGreaterThan(at(3.0, 30));
  });

  it('never guarantee an elite university, and never rule it out for a strong record', () => {
    const best = graduate('elite-best', 4, (d) => {
      Object.assign(d.character.stats, { smarts: 100 });
      Object.assign(d.character.personality, { ambition: 100, confidence: 100 });
      d.character.hidden.luck = 100;
      d.character.familyWealth = 'rich';
      for (const flag of Object.keys(edu.admission.college.elite.flags ?? {})) if ((edu.admission.college.elite.flags![flag] ?? 0) > 0) d.flags[flag] = true;
    });
    expect(admissionChance(best, elite, content)).toBeLessThan(1);
    const strong = graduate('elite-strong', 3.7, (d) => void (d.character.stats.smarts = 70));
    expect(admissionChance(strong, elite, content)).toBeGreaterThan(0.15);
    const weak = graduate('elite-weak', 1.5, (d) => {
      d.character.stats.smarts = 0;
      d.character.hidden.luck = 0;
    });
    expect(admissionChance(weak, elite, content)).toBeGreaterThan(0);
    expect(admissionChance(weak, elite, content)).toBeLessThan(0.05);
  });

  it('count flags from your past', () => {
    const plain = graduate('flags', 3.2);
    const cheated = produce(plain, (d) => void (d.flags.caught_cheating = true));
    const tested = produce(plain, (d) => void (d.flags.high_test_scores = true));
    expect(admissionChance(cheated, state, content)).toBeLessThan(admissionChance(plain, state, content));
    expect(admissionChance(tested, state, content)).toBeGreaterThan(admissionChance(plain, state, content));
  });

  it('judge college on your current GPA in your last year of high school, and on your bachelor’s for grad school', () => {
    const senior = produce(lifeAtAge('senior', 17), (d) => enrolled(d, { program: 'high', year: 4, gpa: 3.6 }));
    expect(applicationGpa(senior, 'college', content)).toBe(3.6);
    const ged = produce(lifeAtAge('ged', 25), (d) => void d.education.credentials.push({ type: 'ged', year: d.currentYear }));
    expect(applicationGpa(ged, 'college', content)).toBe(edu.admission.noGpa);
    const bachelor = produce(ged, (d) => void d.education.credentials.push({ type: 'bachelor', refId: 'biology', year: d.currentYear, gpa: 3.4, tier: 'state' }));
    expect(applicationGpa(bachelor, 'grad', content)).toBe(3.4);
  });

  it('let you apply in your last year of high school or after, once per school a year', () => {
    expect(applyBlock(produce(lifeAtAge('junior', 16), (d) => enrolled(d, { program: 'high', year: 3 })), state, content)).toBe('age');
    const senior = produce(lifeAtAge('senior', 17), (d) => enrolled(d, { program: 'high', year: 4, gpa: 3.2 }));
    expect(applyBlock(senior, state, content)).toBeNull();
    const dropout = lifeAtAge('dropout', 20);
    expect(applyBlock(dropout, state, content)).toBe('highSchool');
    const accepted = act(senior, 'apply_school', state, always);
    expect(accepted.education.admission).toMatchObject({ program: 'college', tier: 'state', majorId: 'nursing' });
    expect(accepted.education.applied).toEqual([{ option: 'college:state', accepted: true }]);
    expect(applyBlock(accepted, state, content)).toBe('tried');
    expect(() => act(accepted, 'apply_school', state, always)).toThrow(InvalidInputError);
    // A reach that fails keeps the place you had; one that works replaces it.
    const rejected = act(accepted, 'apply_school', elite, never);
    expect(rejected.education.admission).toMatchObject({ tier: 'state' });
    expect(rejected.history.at(-1)!.tags).toContain('rejected');
    const upgraded = act(accepted, 'apply_school', elite, always);
    expect(upgraded.education.admission).toMatchObject({ tier: 'elite' });
  });

  it('reject bad application parameters', () => {
    const grad = graduate('params');
    expect(() => act(grad, 'apply_school', { program: 'college', tier: 'state' })).toThrow(InvalidInputError);
    expect(() => act(grad, 'apply_school', { program: 'college', tier: 'ivy', majorId: 'nursing' })).toThrow(InvalidInputError);
    expect(() => act(grad, 'apply_school', { program: 'college', tier: 'state', majorId: 'alchemy' })).toThrow(InvalidInputError);
    expect(() => act(grad, 'apply_school', { program: 'trade', tradeId: 'welder', extra: 1 })).toThrow(InvalidInputError);
    expect(() => act(grad, 'apply_school', { program: 'space' })).toThrow(InvalidInputError);
  });

  it('require a bachelor’s degree for grad school (in a fitting major for medicine)', () => {
    const law: ApplyTarget = { program: 'grad', gradProgramId: 'law' };
    const medicine: ApplyTarget = { program: 'grad', gradProgramId: 'medicine' };
    const hs = graduate('grad-req');
    expect(applyBlock(hs, law, content)).toBe('bachelor');
    const withAssociate = produce(hs, (d) => void d.education.credentials.push({ type: 'associate', refId: 'english', year: d.currentYear, gpa: 3, tier: 'community' }));
    expect(applyBlock(withAssociate, law, content)).toBe('bachelor');
    const english = produce(hs, (d) => void d.education.credentials.push({ type: 'bachelor', refId: 'english', year: d.currentYear, gpa: 3.5, tier: 'state' }));
    expect(applyBlock(english, law, content)).toBeNull();
    expect(applyBlock(english, medicine, content)).toBe('major');
    const biology = produce(hs, (d) => void d.education.credentials.push({ type: 'bachelor', refId: 'biology', year: d.currentYear, gpa: 3.5, tier: 'state' }));
    expect(applyBlock(biology, medicine, content)).toBeNull();
    // Finishing a bachelor's this year counts.
    const senior = produce(hs, (d) => enrolled(d, { program: 'college', tier: 'state', majorId: 'english', year: 4 }));
    expect(applyBlock(senior, law, content)).toBeNull();
    // Grad school never starts without the degree.
    const starts = years(act(senior, 'apply_school', law, always), 1);
    expect(starts.education.current).toMatchObject({ program: 'grad', gradProgramId: 'law' });
    expect(starts.education.credentials.map((c) => c.type)).toContain('bachelor');
  });
});

describe('tuition and student loans', () => {
  it('split tuition between scholarships, family help and a student loan, by family wealth and GPA', () => {
    const place = { program: 'college' as const, tier: 'state' as const, majorId: 'nursing' };
    const bill = (wealth: LifeState['character']['familyWealth'], gpa: number) => {
      const life = graduate(`bill-${wealth}`, gpa, (d) => void (d.character.familyWealth = wealth));
      return billFor(life, place, scholarshipShare(life, 'college', content), content);
    };
    for (const b of [bill('poor', 3), bill('middle', 3), bill('rich', 3), bill('middle', 4)]) {
      expect(b.tuition).toBe(edu.tuition.college.state);
      expect(b.scholarship + b.family + b.fund + b.loan).toBe(b.tuition);
      for (const v of Object.values(b)) expect(Number.isInteger(v)).toBe(true);
    }
    expect(bill('rich', 3).loan).toBe(0);
    expect(bill('poor', 3).scholarship).toBeGreaterThan(bill('middle', 3).scholarship);
    expect(bill('middle', 4).scholarship).toBeGreaterThan(bill('middle', 3).scholarship);
    expect(bill('middle', 3).loan).toBeGreaterThan(0);
  });

  it('borrow through the existing debt system: one student loan that pauses while you study and is due after', () => {
    const accepted = act(graduate('loans', 3), 'apply_school', { program: 'college', tier: 'elite', majorId: 'business' }, always);
    let life = year(accepted);
    expect(life.education.current).toMatchObject({ program: 'college', tier: 'elite', year: 1, lengthYears: 4 });
    const bill = life.education.lastBill!;
    expect(bill.loan).toBeGreaterThan(0);
    const loans = life.finances.debts.filter((d) => d.kind === 'student');
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ balance: bill.loan, annualRate: content.balance.economy.interest.debts.student });
    const studentDebt = (l: LifeState) => getMoneyView(l, content).debts.find((d) => d.kind === 'student')!;
    expect(studentDebt(life).paused).toBe(true);
    // The ledger asks for nothing while you're in school.
    const ledger = produce(life, (d) => runEconomy(d, content));
    expect(ledger.finances.debts.find((d) => d.kind === 'student')!.missed).toBe(0);
    expect(ledger.finances.lastLedger!.debtPayments).toBe(0);
    // Four years of tuition in one loan, then payments are due.
    life = years(life, 3);
    expect(life.finances.debts.filter((d) => d.kind === 'student')).toHaveLength(1);
    life = year(life);
    expect(life.education.current).toBeNull();
    expect(life.education.credentials.at(-1)).toMatchObject({ type: 'bachelor', refId: 'business', tier: 'elite' });
    expect(studentDebt(life).paused).toBe(false);
    const due = produce(life, (d) => {
      d.finances.savings = 100_000;
      runEconomy(d, content);
    });
    expect(due.finances.lastLedger!.debtPayments).toBeGreaterThan(0);
  });

  it('pay from scholarship money won in events before borrowing', () => {
    const accepted = act(graduate('fund', 3, (d) => void (d.character.familyWealth = 'poor')), 'apply_school', { program: 'trade', tradeId: 'welder' }, always);
    const def = { id: 'x', rarity: 'common' } as EventDef;
    const funded = produce(accepted, (d) => applyEffects(d, [{ type: 'education', action: 'scholarship', value: 100_000 }], { def, cast: {}, rng: createRng('f'), content }));
    const life = year(funded);
    expect(life.education.lastBill!.loan).toBe(0);
    expect(life.education.lastBill!.fund).toBeGreaterThan(0);
    expect(life.education.fund).toBe(100_000 - life.education.lastBill!.fund);
    expect(life.finances.debts).toEqual([]);
  });

  it('let a child’s family cover what would be a loan', () => {
    const child = produce(lifeAtAge('child-bill', 17), (d) => void (d.character.familyWealth = 'poor'));
    const b = billFor(child, { program: 'trade', tradeId: 'welder' }, 0, content);
    expect(b.loan).toBe(0);
    expect(b.family).toBe(b.tuition);
  });

  it('quote an application for the year it starts, when a senior is old enough to borrow', () => {
    const senior = produce(lifeAtAge('quote', 17), (d) => {
      d.character.familyWealth = 'working';
      enrolled(d, { program: 'high', year: 4, gpa: 3.2 });
    });
    const state = getApplicationOptions(senior, content).college.find((o) => o.tier === 'state')!;
    const started = year(act(produce(senior, (d) => void (d.finances.savings = 1_000)), 'apply_school', { program: 'college', tier: 'state', majorId: 'nursing' }, always));
    const { year: _year, ...bill } = started.education.lastBill!;
    expect(state.bill.loan).toBeGreaterThan(0);
    expect(bill).toEqual(state.bill);
  });
});

describe('programs', () => {
  it('earn a trade license only by finishing trade school', () => {
    const accepted = act(graduate('trade', 3), 'apply_school', { program: 'trade', tradeId: 'electrician' }, always);
    let life = year(accepted);
    expect(life.education.current).toMatchObject({ program: 'trade', tradeId: 'electrician', lengthYears: content.trades.electrician!.years });
    const quit = act(life, 'drop_out');
    expect(quit.education.credentials.some((c) => c.type === 'trade_license')).toBe(false);
    expect(quit.education.left).toMatchObject({ program: 'trade', tradeId: 'electrician' });
    life = years(life, content.trades.electrician!.years);
    expect(life.education.credentials.at(-1)).toMatchObject({ type: 'trade_license', refId: 'electrician' });
    expect(life.history.at(-1)!.tags).toContain('licensed');
  });

  it('count an associate degree toward a bachelor’s', () => {
    let life = act(graduate('transfer', 3), 'apply_school', { program: 'college', tier: 'community', majorId: 'psychology' }, always);
    life = years(life, 1 + edu.college.years.community - 1);
    expect(life.education.current).toMatchObject({ program: 'college', tier: 'community', year: edu.college.years.community });
    life = act(life, 'apply_school', { program: 'college', tier: 'state', majorId: 'psychology' }, always);
    life = year(life);
    expect(life.education.credentials.at(-1)).toMatchObject({ type: 'associate', tier: 'community' });
    expect(life.education.current).toMatchObject({ tier: 'state', year: 1 + edu.college.transferCredit });
  });

  it('change majors freely at first, and at the cost of a year later', () => {
    let life = year(act(graduate('major', 3), 'apply_school', { program: 'college', tier: 'state', majorId: 'english' }, always));
    life = act(life, 'choose_major', { majorId: 'biology' });
    expect(life.education.current).toMatchObject({ majorId: 'biology', lengthYears: 4 });
    expect(isLifeActionAvailable(life, 'choose_major', { majorId: 'english' }, content)).toBe(false);
    life = years(life, edu.college.freeChangeYears);
    life = act(life, 'choose_major', { majorId: 'nursing' });
    expect(life.education.current).toMatchObject({ majorId: 'nursing', lengthYears: 5 });
    expect(() => act(lifeAtAge('no-college', 30), 'choose_major', { majorId: 'nursing' })).toThrow(InvalidInputError);
  });

  it('withdraw a place when you don’t finish what it needs', () => {
    const senior = produce(lifeAtAge('withdraw', 17), (d) => enrolled(d, { program: 'high', year: 4, gpa: 3 }));
    const accepted = act(senior, 'apply_school', { program: 'college', tier: 'state', majorId: 'business' }, always);
    const quit = act(accepted, 'drop_out');
    expect(quit.education.admission).toBeNull();
    expect(quit.history.at(-1)!.tags).toContain('withdrawn');
  });

  it('let you decline a place', () => {
    const accepted = act(graduate('decline', 3), 'apply_school', { program: 'trade', tradeId: 'welder' }, always);
    const declined = act(accepted, 'decline_admission');
    expect(declined.education.admission).toBeNull();
    expect(year(declined).education.current).toBeNull();
  });
});

describe('dropping out, the GED and going back', () => {
  const sophomore = (age: number) => produce(lifeAtAge(`hs-${age}`, age), (d) => enrolled(d, { program: 'high', year: age - ages.highStart + 1, gpa: 2 }));

  it('allow dropping out of high school only from the dropout age', () => {
    expect(isLifeActionAvailable(sophomore(edu.school.dropoutAge - 1), 'drop_out', {}, content)).toBe(false);
    const out = act(sophomore(edu.school.dropoutAge), 'drop_out');
    expect(out.education.current).toBeNull();
    expect(out.education.left).toMatchObject({ program: 'high', leftYear: out.currentYear });
    // Not forced back to school.
    expect(year(out).education.current).toBeNull();
    // An event can't push a younger student out either.
    const def = { id: 'x', rarity: 'common' } as EventDef;
    const young = produce(sophomore(edu.school.dropoutAge - 1), (d) => applyEffects(d, [{ type: 'education', action: 'drop_out' }], { def, cast: {}, rng: createRng('x'), content }));
    expect(young.education.current).not.toBeNull();
  });

  it('let a dropout go back while they can still finish by 19', () => {
    const out = act(sophomore(edu.school.dropoutAge), 'drop_out');
    expect(isLifeActionAvailable(out, 'return_to_school', {}, content)).toBe(true);
    const back = year(act(out, 'return_to_school'));
    expect(back.education.current).toMatchObject({ program: 'high', year: out.education.left!.year });
    expect(back.education.left).toBeNull();
    const late = years(out, ages.lastDiplomaAge - out.character.age);
    expect(isLifeActionAvailable(late, 'return_to_school', {}, content)).toBe(false);
    // Going back, or a GED: not both (found by the Stage 9 careless-player simulation).
    expect(isLifeActionAvailable(act(out, 'return_to_school'), 'take_ged', {}, content)).toBe(false);
  });

  it('give a GED to those who pass it, once a year', () => {
    const out = act(sophomore(edu.school.dropoutAge), 'drop_out');
    const failed = act(out, 'take_ged', {}, never);
    expect(failed.education.credentials).toEqual([]);
    expect(isLifeActionAvailable(failed, 'take_ged', {}, content)).toBe(false);
    const passed = act(year(failed), 'take_ged', {}, always);
    expect(passed.education.credentials).toEqual([{ type: 'ged', year: passed.currentYear }]);
    expect(passed.education.left).toBeNull();
    expect(isLifeActionAvailable(passed, 'take_ged', {}, content)).toBe(false);
    // A GED opens college.
    expect(applyBlock(passed, { program: 'college', tier: 'community', majorId: 'business' }, content)).toBeNull();
  });

  it('work at any adult age: going back to a program you left, or applying fresh', () => {
    let life = year(act(graduate('return', 3), 'apply_school', { program: 'college', tier: 'state', majorId: 'education' }, always));
    life = year(life);
    life = act(life, 'drop_out');
    expect(life.education.left).toMatchObject({ program: 'college', year: 2 });
    for (const age of [30, 45, 70]) {
      const older = produce(life, (d) => {
        d.currentYear = d.birthYear + age;
        d.character.age = age;
      });
      expect(isLifeActionAvailable(older, 'return_to_school', {}, content)).toBe(true);
      const back = year(act(older, 'return_to_school'));
      expect(back.education.current).toMatchObject({ program: 'college', tier: 'state', majorId: 'education', year: 2 });
      expect(back.history.some((e) => e.tags.includes('returned'))).toBe(true);
      const fresh = year(act(graduate(`fresh-${age}`, 3, (d) => {
        d.currentYear = d.birthYear + age;
        d.character.age = age;
      }), 'apply_school', { program: 'trade', tradeId: 'plumber' }, always));
      expect(fresh.education.current).toMatchObject({ program: 'trade', tradeId: 'plumber', year: 1 });
    }
  });

  it('keep your school when you move to another city', () => {
    const student = produce(graduate('move', 3), (d) => enrolled(d, { program: 'college', tier: 'state', majorId: 'nursing', year: 2 }));
    const other = student.character.cityId === 'nyc' ? 'houston' : 'nyc';
    const moved = act(produce(student, (d) => void (d.finances.savings = 50_000)), 'relocate', { cityId: other });
    expect(moved.education.current).toEqual(student.education.current);
    expect(getSchoolView(moved, content).current!.schoolName).toBe(content.cities[other]!.schools.state);
  });
});

describe('conditions', () => {
  it('read your school, credentials and places', () => {
    const life = produce(lifeAtAge('cond', 19), (d) => {
      d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear - 1, gpa: 3 });
      enrolled(d, { program: 'college', tier: 'state', majorId: 'nursing', year: 4, gpa: 3.4 });
    });
    const yes = (c: Parameters<typeof evaluate>[0]) => evaluate(c, life);
    expect(yes({ education: { program: ['college'] } })).toBe(true);
    expect(yes({ education: { program: ['none'] } })).toBe(false);
    expect(yes({ education: { tier: ['state'], major: ['nursing'] } })).toBe(true);
    expect(yes({ education: { final: true, gpa: { gte: 3.4 } } })).toBe(true);
    expect(yes({ education: { year: { lt: 4 } } })).toBe(false);
    expect(yes({ education: { credential: ['hs_diploma'] } })).toBe(true);
    expect(yes({ education: { credential: ['bachelor'] } })).toBe(false);
    expect(yes({ education: { left: false, admission: false } })).toBe(true);
    expect(evaluate({ education: { program: ['none'] } }, lifeAtAge('none', 30))).toBe(true);
  });
});

describe('invariants', () => {
  it('catch school that doesn’t fit your age or credentials', () => {
    const wrongGrade = produce(lifeAtAge('inv', 8), (d) => enrolled(d, { program: 'elementary', year: 1, lengthYears: 6 }));
    expect(checkInvariants(wrongGrade, content).join()).toMatch(/elementary school year 1 at age 8/);
    const noBachelor = produce(lifeAtAge('inv2', 25), (d) => {
      d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear - 7 });
      enrolled(d, { program: 'grad', gradProgramId: 'law' });
    });
    expect(checkInvariants(noBachelor, content).join()).toMatch(/grad school without a bachelor/);
    const collegeNoHs = produce(lifeAtAge('inv3', 20), (d) => enrolled(d, { program: 'college', tier: 'state', majorId: 'nursing' }));
    expect(checkInvariants(collegeNoHs, content).join()).toMatch(/without finishing high school/);
  });
});

describe('the school view', () => {
  it('lists every option with its cost, odds and whether you can apply', () => {
    const senior = produce(lifeAtAge('view', 17), (d) => {
      enrolled(d, { program: 'high', year: 4, gpa: 3.3 });
      d.character.familyWealth = 'working';
    });
    const view = getSchoolView(senior, content);
    expect(view.current).toMatchObject({ program: 'high', gradeLevel: 12, final: true, letter: 'B+' });
    expect(view.canApply).toBe(true);
    const options = getApplicationOptions(senior, content);
    expect(options.college.map((o) => o.tier)).toEqual(['community', 'state', 'elite']);
    expect(options.college.every((o) => o.block === null)).toBe(true);
    expect(options.grad.every((o) => o.block === 'bachelor')).toBe(true);
    expect(options.trade).toHaveLength(Object.keys(content.trades).length);
    expect(options.majors.length).toBeGreaterThanOrEqual(10);
    for (const o of options.college) expect(o.chance).toBe(modelChance(senior, edu.admission.college[o.tier!], 3.3, content));
  });
});
