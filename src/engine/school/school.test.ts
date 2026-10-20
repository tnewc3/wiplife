import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ExamId, SchoolPath } from '../../content/schemas';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { admissionChance, applyBlock, expectedGrade, meetsRequirements, placeForAge, schoolAges } from '../education';
import { checkInvariants as allInvariants } from '../invariants';
import { performInteraction, closeInteraction } from '../interactions/perform';
import { isInteractionAvailable } from '../interactions/availability';
import { isRomanceCandidate, canChangeKind } from '../relationships';
import { playYear } from '../autoplay';
import { createLife } from '../life';
import { replayLife } from '../replay';
import { lifeAtAge } from '../testFixtures';
import { countryOfCity } from '../country';
import { advanceAge } from '../systems/aging';
import { runEducation } from '../systems/education';
import { runRelationships } from '../systems/relationships';
import type { Enrollment, LifeState } from '../types';
import { choiceBlock, settleChoice } from './choice';
import { examExpected, runExams, sitExam } from './exams';
import { curriculumFor, schoolChoice } from './query';
import { reportCard, weakestSubject } from './report';
import { schoolActionBlock, tutorCost } from './rules';
import { startSchoolYear } from './step';

const b = content.balance.school;

/** The invariants, without the one about living abroad: these fixtures move a life to another country's city. */
const checkInvariants = (life: LifeState, bundle: typeof content): string[] => allInvariants(life, bundle).filter((f) => !f.startsWith('migration:'));

/** A life moved to a city (and its country), at an age, in a given program and year. */
function inCity(cityId: string, age: number, program: Enrollment['program'], year: number, setup: (d: LifeState) => void = () => {}): LifeState {
  const countryId = content.cities[cityId]!.countryId;
  return produce(lifeAtAge(`school-${cityId}-${age}`, age), (d) => {
    d.character.cityId = cityId;
    d.housing.cityId = cityId;
    d.character.familyWealth = 'middle';
    Object.assign(d.character.stats, { smarts: 60, stress: 20 });
    d.character.personality.discipline = 60;
    const length = content.countries[countryId]!.school[program as 'elementary' | 'middle' | 'high'] ?? 4;
    d.education.current = { program, year, lengthYears: length, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - year + 1 };
    setup(d);
  });
}

/** One year for the school step only (aging, then education), as the education tests do. */
function year(life: LifeState): LifeState {
  return produce(life, (d) => {
    d.inputLog.push({ year: d.currentYear, kind: 'ageUp', payload: {} });
    d.lifetime.years += 1;
    advanceAge(d, content);
    runEducation(d, content);
    d.scheduled = [];
    d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: { ...d.character.stats } };
  });
}

const act = (life: LifeState, id: string, params?: unknown) => performAction(life, id, params, content);
const countryOf = (life: LifeState) => countryOfCity(life.character.cityId, content);

describe('each country runs its own stages, names and exams', () => {
  it.each([
    ['us', 'chicago', ['elementary school', 'middle school', 'high school'], 'Freshman year', 14, [['sat', 'high', 3]]],
    ['ca', 'toronto', ['elementary school', 'middle school', 'high school'], 'Grade 9', 14, [['provincial', 'high', 4]]],
    ['uk', 'london', ['primary school', 'secondary school', 'secondary school'], 'Year 10', 14, [['gcse', 'high', 2], ['alevels', 'high', 4]]],
    ['mx', 'mexico_city', ['primary school', 'secundaria', 'preparatoria'], 'Preparatoria, year 1', 15, [['mx_placement', 'middle', 3], ['mx_entrance', 'high', 2]]],
  ] as const)('%s: stage words, the first high school year and its exams', (_id, cityId, words, firstHigh, highStartAge, exams) => {
    const life = inCity(cityId, 12, 'middle', 1);
    const school = content.countries[content.cities[cityId]!.countryId]!;
    expect([school.words.elementary, school.words.middle, school.words.high]).toEqual(words);
    expect(placeForAge(highStartAge, life, content)).toMatchObject({ program: 'high', year: 1 });
    const level = school.school.elementary + school.school.middle;
    expect(school.words.gradeLabels[level]).toBe(firstHigh);
    expect(school.school.exams.map((e) => [e.id, e.program, e.year])).toEqual(exams);
  });

  it('the US names its high school years freshman to senior', () => {
    expect(content.countries.us!.words.gradeLabels.slice(-4)).toEqual(['Freshman year', 'Sophomore year', 'Junior year', 'Senior year']);
  });

  it('every country has 4 to 6 subjects at every stage, and the UK has its own for the sixth form', () => {
    for (const country of Object.values(content.countries)) {
      for (const stage of ['elementary', 'middle', 'high'] as const) {
        const subjects = country.school.curriculum[stage];
        expect(subjects.length, `${country.id} ${stage}`).toBeGreaterThanOrEqual(4);
        expect(subjects.length, `${country.id} ${stage}`).toBeLessThanOrEqual(6);
      }
      expect(country.school.curriculum.upper !== undefined, country.id).toBe(country.school.choice !== undefined);
    }
    const uk = inCity('london', 16, 'high', 3);
    expect(curriculumFor(uk, 'high', 3, content).map((s) => s.id)).toEqual(content.countries.uk!.school.curriculum.upper!.map((s) => s.id));
    expect(curriculumFor(uk, 'high', 2, content).map((s) => s.id)).toEqual(content.countries.uk!.school.curriculum.high.map((s) => s.id));
  });

  it("Montreal's schools end a year early and a CEGEP comes before university", () => {
    const life = inCity('montreal', 14, 'high', 1);
    const s = schoolAges(life, content);
    expect(s.highEnd).toBe(17);
    expect(placeForAge(16, life, content)).toMatchObject({ program: 'high', year: 3 });
    expect(placeForAge(17, life, content)).toBeNull();
    const country = content.countries.ca!;
    const montreal = countryOf(life);
    expect(montreal.words.tiers.community).toBe('CEGEP');
    expect(country.words.tiers.community).toBe('College');
    expect(montreal.words.gradeLabels).toHaveLength(12);
    expect(montreal.collegeYears.state).toBe(3);
    expect(montreal.school.exams.map((e) => e.id)).toEqual(['provincial']);
    // The rest of Canada is untouched.
    expect(countryOf(inCity('toronto', 14, 'high', 1)).school.high).toBe(4);
  });
});

describe('exams', () => {
  const sat = (score: number): LifeState =>
    produce(inCity('chicago', 17, 'high', 3), (d) => {
      d.education.school.exams = [{ id: 'sat', year: d.currentYear - 1, score, band: score >= b.exams.sat.top ? 'top' : score >= b.exams.sat.pass ? 'pass' : 'fail' }];
    });

  it('are sat as the year finishes, stored with their band, flagged and told by an event', () => {
    const life = inCity('chicago', 16, 'high', 3);
    const after = year(life);
    // (The age step moved on a year; the SAT is sat in the third year as it finishes.)
    const sat = after.education.school.exams.find((e) => e.id === 'sat');
    expect(sat).toBeDefined();
    expect(sat!.score).toBeGreaterThanOrEqual(0);
    expect(sat!.score).toBeLessThanOrEqual(100);
    expect(after.flags.exam_sat).toBe(sat!.band);
    expect(after.history.some((h) => h.tags.includes('examTop') || h.tags.includes('examPass') || h.tags.includes('examFail'))).toBe(true);
    expect(checkInvariants(after, content)).toEqual([]);
  });

  it('the score follows the grades and what you did that year', () => {
    const strong = produce(inCity('chicago', 17, 'high', 3), (d) => void (d.education.current!.gpa = 3.9));
    const weak = produce(inCity('chicago', 17, 'high', 3), (d) => void (d.education.current!.gpa = 1.2));
    expect(examExpected(strong, 'sat', content)).toBeGreaterThan(examExpected(weak, 'sat', content));
    const studied = produce(strong, (d) => void (d.education.school.year = { year: d.currentYear - 1, effort: 'study', tutor: 0, cheated: 0, skipped: 0, caught: false }));
    const slacked = produce(strong, (d) => void (d.education.school.year = { year: d.currentYear - 1, effort: 'slack', tutor: 0, cheated: 0, skipped: 0, caught: false }));
    expect(examExpected(studied, 'sat', content)).toBeGreaterThan(examExpected(slacked, 'sat', content));
  });

  it('an entrance exam feeds admission: a top result helps, a fail hurts', () => {
    const major = Object.keys(content.majors).sort()[0]!;
    const target = { program: 'college', tier: 'state', majorId: major } as const;
    const top = admissionChance(sat(95), target, content);
    const none = admissionChance(produce(sat(95), (d) => void (d.education.school.exams = [])), target, content);
    const fail = admissionChance(sat(5), target, content);
    expect(top).toBeGreaterThan(none);
    expect(fail).toBeLessThan(none);
  });

  it("the UK's A-levels confirm a place: missed, it is withdrawn", () => {
    const base = inCity('london', 17, 'high', 4, (d) => {
      d.finances.savings = 5000;
    });
    const major = Object.keys(content.majors).sort()[0]!;
    // Apply for university with the A-levels still to come: the place waits on them.
    const applied = act(produce(base, (d) => void (d.education.current!.year = 4)), 'apply_school', { program: 'college', tier: 'state', majorId: major });
    if (applied.education.admission === null) return; // (the school said no; the other cases below cover the rule)
    expect(applied.education.admission.conditional).toMatchObject({ exam: 'alevels' });
    const missed = produce(applied, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      d.education.admission!.conditional = { exam: 'alevels', min: 101 };
      sitExam(d, 'alevels', content);
    });
    expect(missed.education.admission).toBeNull();
    expect(missed.flags.missed_offer).toBe(true);
  });

  it("Mexico's placement exam shifts how well you do at the preparatoria", () => {
    const low = produce(inCity('mexico_city', 15, 'high', 1), (d) => void (d.education.school.shift = -0.2));
    const high = produce(inCity('mexico_city', 15, 'high', 1), (d) => void (d.education.school.shift = 0.2));
    const place = { program: 'high' } as const;
    expect(expectedGrade(high, place, content)).toBeGreaterThan(expectedGrade(low, place, content));
    const middle = produce(inCity('mexico_city', 14, 'middle', 3), (d) => {
      d.education.current!.gpa = 3.8;
    });
    const done = produce(middle, (d) => void runExams(d, content));
    expect(done.education.school.exams.map((e) => e.id)).toEqual(['mx_placement']);
    expect(done.education.school.shift).toBeCloseTo((done.education.school.exams[0]!.score - 50) * b.placement, 6);
  });

  it("Canada's provincial exam counts toward the year's grade", () => {
    const life = produce(inCity('toronto', 17, 'high', 4), (d) => void (d.education.current!.boost = 0));
    const done = produce(life, (d) => void runExams(d, content));
    const exam = done.education.school.exams[0]!;
    expect(done.education.current!.boost).toBeCloseTo((exam.score - 50) * b.leaving, 6);
  });
});

describe("the UK's choice at 16", () => {
  const atChoice = (setup: (d: LifeState) => void = () => {}) => inCity('london', 15, 'high', 2, setup);
  const passed = (d: LifeState) => void (d.education.school.exams = [{ id: 'gcse', year: d.currentYear, score: 80, band: 'top' }]);
  const failed = (d: LifeState) => void (d.education.school.exams = [{ id: 'gcse', year: d.currentYear, score: 10, band: 'fail' }]);
  /** The choice is settled as the next year begins, once the exam is in. */
  const settle = (life: LifeState, result: (d: LifeState) => void) =>
    produce(life, (d) => {
      result(d);
      d.education.current!.year += 1;
      settleChoice(d, content);
    });

  it('is open in the second year of high school only, and only for countries that have one', () => {
    expect(schoolChoice(atChoice(), content)).toMatchObject({ year: 2, exam: 'gcse' });
    expect(choiceBlock(atChoice(), content)).toBeNull();
    expect(choiceBlock(inCity('london', 14, 'high', 1), content)).toBe('age');
    expect(choiceBlock(inCity('chicago', 15, 'high', 2), content)).toBe('none');
    expect(isLifeActionAvailable(atChoice(), 'choose_path', { path: 'college' }, content)).toBe(true);
    expect(isLifeActionAvailable(inCity('chicago', 15, 'high', 2), 'choose_path', { path: 'college' }, content)).toBe(false);
  });

  it('validates the path, and an apprenticeship needs a trade the country prices', () => {
    const life = atChoice();
    expect(() => act(life, 'choose_path', { path: 'nonsense' })).toThrow(InvalidInputError);
    expect(isLifeActionAvailable(life, 'choose_path', { path: 'apprenticeship' }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'choose_path', { path: 'apprenticeship', tradeId: 'plumber' }, content)).toBe(true);
    expect(isLifeActionAvailable(life, 'choose_path', { path: 'apprenticeship', tradeId: 'astronaut' }, content)).toBe(false);
    const chosen = act(life, 'choose_path', { path: 'college' });
    expect(chosen.education.school.choice).toMatchObject({ path: 'college', year: 2 });
    expect(chosen.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'choose_path' } });
  });

  it('staying on keeps you in the sixth form; a miss falls back to the college', () => {
    const stay = settle(act(atChoice(), 'choose_path', { path: 'stay' }), passed);
    expect(stay.education.current).toMatchObject({ program: 'high', year: 3 });
    expect(stay.education.current!.venue).toBeUndefined();
    expect(stay.flags.school_path).toBe('stay');
    const missed = settle(act(atChoice(), 'choose_path', { path: 'stay' }), failed);
    expect(missed.education.current!.venue).toBe('college');
    expect(missed.history.some((h) => h.tags.includes('fellBack'))).toBe(true);
    expect(checkInvariants(missed, content)).toEqual([]);
  });

  it('with no choice made you stay on, if you can', () => {
    expect(settle(atChoice(), passed).education.current!.venue).toBeUndefined();
    expect(settle(atChoice(), failed).education.current!.venue).toBe('college');
  });

  it('a further education college is another school: a new class and new teachers', () => {
    const withClass = produce(atChoice(), (d) => void startSchoolYear(d, content));
    const oldClass = withClass.education.school.classmates;
    expect(oldClass.length).toBeGreaterThan(0);
    const settled = settle(act(withClass, 'choose_path', { path: 'college' }), passed);
    expect(settled.education.current!.venue).toBe('college');
    const moved = produce(settled, (d) => void startSchoolYear(d, content));
    expect(moved.education.school.key).toContain('college');
    expect(moved.education.school.classmates.some((id) => oldClass.includes(id))).toBe(false);
  });

  it('an apprenticeship starts the trade without a diploma, paid by the employer', () => {
    const life = act(atChoice(), 'choose_path', { path: 'apprenticeship', tradeId: 'plumber' });
    // A decent result and an employer who takes you on (the odds are balance numbers; this seed is forced through them).
    const sure = produce(life, (d) => {
      passed(d);
      d.education.current!.year += 1;
      d.rng = { ...d.rng };
    });
    let started: LifeState | undefined;
    for (let i = 0; i < 40 && !started; i++) {
      const tried = produce(sure, (d) => {
        d.character.stats.smarts = 90;
        d.character.personality.discipline = 90;
        d.rng.a = (d.rng.a ^ Math.imul(i + 1, 2654435761)) >>> 0;
        settleChoice(d, content);
      });
      if (tried.education.current?.program === 'trade') started = tried;
    }
    expect(started).toBeDefined();
    expect(started!.education.current).toMatchObject({ program: 'trade', tradeId: 'plumber', scholarship: 1, apprentice: true });
    expect(started!.flags.school_path).toBe('apprenticeship');
    expect(checkInvariants(started!, content)).toEqual([]);
  });

  it('going to work leaves school with the place kept, so you can go back', () => {
    const left = settle(act(atChoice(), 'choose_path', { path: 'work' }), passed);
    expect(left.education.current).toBeNull();
    expect(left.education.left).toMatchObject({ program: 'high' });
    expect(left.flags.school_path).toBe('work');
  });
});

describe("Quebec's CEGEP", () => {
  const graduateOf = (extra: (d: LifeState) => void = () => {}) =>
    produce(inCity('montreal', 17, 'high', 3), (d) => {
      d.education.current = null;
      d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear, gpa: 3.4 });
      d.finances.savings = 2000;
      extra(d);
    });
  const major = Object.keys(content.majors).sort()[0]!;

  it('has to come before university: the CEGEP is open, a university is not', () => {
    const life = graduateOf();
    expect(applyBlock(life, { program: 'college', tier: 'community', majorId: major }, content)).toBeNull();
    expect(applyBlock(life, { program: 'college', tier: 'state', majorId: major }, content)).toBe('preUniversity');
    expect(applyBlock(life, { program: 'college', tier: 'elite', majorId: major }, content)).toBe('preUniversity');
    const withDiploma = produce(life, (d) => void d.education.credentials.push({ type: 'associate', refId: major, year: d.currentYear, gpa: 3, tier: 'community' }));
    expect(applyBlock(withDiploma, { program: 'college', tier: 'state', majorId: major }, content)).toBeNull();
    expect(meetsRequirements(withDiploma, { program: 'college', tier: 'state', majorId: major }, content)).toBe(true);
  });

  it('is not a thing elsewhere in Canada', () => {
    const toronto = produce(graduateOf(), (d) => {
      d.character.cityId = 'toronto';
    });
    expect(applyBlock(toronto, { program: 'college', tier: 'state', majorId: major }, content)).toBeNull();
  });

  it('a university degree after the CEGEP starts in its first year (the CEGEP is not credit toward it)', () => {
    const life = graduateOf((d) => {
      d.education.credentials.push({ type: 'associate', refId: major, year: d.currentYear, gpa: 3, tier: 'community' });
      d.education.admission = { program: 'college', tier: 'state', majorId: major, scholarship: 0, decided: d.currentYear };
    });
    const started = year(life);
    expect(started.education.current).toMatchObject({ program: 'college', tier: 'state', year: 1, lengthYears: 3 });
  });
});

describe('school actions', () => {
  const school = (age = 15, program: Enrollment['program'] = 'high', y = 2) => inCity('chicago', age, program, y);

  it('study harder lifts the year and costs stress; slack off is the other way', () => {
    const base = school();
    const studied = act(base, 'study_harder');
    expect(studied.education.current!.boost).toBeCloseTo(b.actions.study.grades, 6);
    expect(studied.character.stats.stress).toBe(base.character.stats.stress + b.actions.study.stress);
    const slacked = act(base, 'slack_off');
    expect(slacked.education.current!.boost).toBeCloseTo(b.actions.slack.grades, 6);
    expect(slacked.character.stats.stress).toBe(base.character.stats.stress + b.actions.slack.stress);
    expect(slacked.character.stats.happiness).toBeGreaterThan(base.character.stats.happiness);
  });

  it('you settle on one stance a year; the next year starts fresh', () => {
    const studied = act(school(), 'study_harder');
    expect(schoolActionBlock(studied, 'slack', content)).toBe('stance');
    expect(schoolActionBlock(studied, 'study', content)).toBe('done');
    expect(() => act(studied, 'slack_off')).toThrow(InvalidInputError);
    const later = year(studied);
    expect(schoolActionBlock(later, 'slack', content)).toBeNull();
  });

  it('studying a subject lifts that subject most, and names only subjects you take', () => {
    const base = produce(school(), (d) => void startSchoolYear(d, content));
    const subject = weakestSubject(base, content)!;
    const studied = act(base, 'study_harder', { subject: subject.id });
    expect(reportCard(studied, content).find((s) => s.id === subject.id)!.gpa).toBeGreaterThanOrEqual(subject.gpa);
    expect(studied.education.school.spread[subject.id]!).toBeGreaterThan(base.education.school.spread[subject.id]!);
    expect(studied.education.current!.boost).toBeLessThan(b.actions.study.grades);
    expect(() => act(base, 'study_harder', { subject: 'basket_weaving' })).toThrow(InvalidInputError);
  });

  it('a tutor is paid through finance (a minor’s family covers it), once a year', () => {
    const adult = produce(inCity('chicago', 19, 'college', 1), (d) => {
      Object.assign(d.education.current!, { tier: 'state', majorId: Object.keys(content.majors).sort()[0], lengthYears: 4 });
      d.finances.savings = 5000;
    });
    const cost = tutorCost(adult, content);
    const tutored = act(adult, 'get_tutor');
    expect(adult.finances.savings - tutored.finances.savings).toBe(cost);
    expect(tutored.education.current!.boost).toBeCloseTo(b.actions.tutor.grades, 6);
    expect(tutored.education.school.year.tutor).toBe(cost);
    expect(schoolActionBlock(tutored, 'tutor', content)).toBe('done');
    const poor = produce(adult, (d) => void (d.finances.savings = 1));
    expect(schoolActionBlock(poor, 'tutor', content)).toBe('money');
    const child = school(14, 'high', 1);
    const kid = act(child, 'get_tutor');
    expect(kid.finances.savings).toBe(child.finances.savings);
    expect(kid.education.school.year.tutor).toBeGreaterThan(0);
  });

  it('cheating raises the year but can be caught: a flag the admissions read, a teacher who cools, an event', () => {
    const base = produce(school(), (d) => void startSchoolYear(d, content));
    const teacher = base.education.school.staff.homeroom!;
    let caught: LifeState | undefined;
    let clean: LifeState | undefined;
    for (let i = 0; i < 60 && (!caught || !clean); i++) {
      const tried = produce(base, (d) => void (d.rng.a = (d.rng.a ^ Math.imul(i + 1, 2654435761)) >>> 0));
      const after = act(tried, 'cheat_on_test');
      if (after.education.school.year.caught) caught ??= after;
      else clean ??= after;
    }
    expect(caught).toBeDefined();
    expect(clean).toBeDefined();
    expect(clean!.education.current!.boost).toBeCloseTo(b.actions.cheat.grades, 6);
    expect(caught!.education.current!.boost).toBeCloseTo(b.actions.cheat.grades + b.actions.cheat.caught.grades, 6);
    expect(caught!.flags.caught_cheating).toBe(true);
    expect(caught!.relationships[teacher]!.affection).toBeLessThan(base.relationships[teacher]!.affection);
    expect(caught!.character.stats.stress).toBeGreaterThan(clean!.character.stats.stress);
    expect(caught!.scheduled.some((s) => s.eventId === 'cheating_caught_meeting')).toBe(true);
    // Once caught, no more this year.
    expect(schoolActionBlock(caught!, 'cheat', content)).toBe('limit');
    expect(schoolActionBlock(school(9, 'elementary', 4), 'cheat', content)).toBe('age');
  });

  it('skipping class costs the year, eases stress, and the school may notice (the truancy letter follows)', () => {
    const base = produce(school(), (d) => {
      startSchoolYear(d, content);
      d.character.personality.discipline = 20;
    });
    const after = act(base, 'skip_class');
    expect(after.education.current!.boost).toBeCloseTo(b.actions.skip.grades, 6);
    expect(after.character.stats.stress).toBe(base.character.stats.stress + b.actions.skip.stress);
    let noticed: LifeState | undefined;
    for (let i = 0; i < 80 && !noticed; i++) {
      const tried = act(produce(base, (d) => void (d.rng.a = (d.rng.a ^ Math.imul(i + 1, 2654435761)) >>> 0)), 'skip_class');
      if (tried.education.school.year.caught) noticed = tried;
    }
    expect(noticed).toBeDefined();
    expect(noticed!.scheduled.some((s) => ['skipped_class_noticed', 'truancy_letter'].includes(s.eventId))).toBe(true);
  });

  it('replays exactly from the input log', () => {
    let life = createLife({ mode: 'random', seed: 'school-replay', birthYear: 2000, countryId: 'us' }, content);
    for (let i = 0; i < 14; i++) life = playYear(life, content);
    expect(life.education.current?.program).toBe('high');
    life = act(life, 'study_harder');
    life = act(life, 'get_tutor');
    const rebuilt = replayLife(life.inputLog, content);
    expect(life.inputLog.filter((r) => r.kind === 'action').map((r) => (r.payload as { actionId: string }).actionId)).toEqual(['study_harder', 'get_tutor']);
    expect(rebuilt.education).toEqual(life.education);
    expect(rebuilt.finances.savings).toBe(life.finances.savings);
});
});

describe('the report card', () => {
  it('lists the subjects of the stage and grades them from the year’s grade plus a stored spread', () => {
    const life = produce(inCity('london', 12, 'middle', 2), (d) => void startSchoolYear(d, content));
    const card = reportCard(life, content);
    expect(card.map((s) => s.id)).toEqual(content.countries.uk!.school.curriculum.middle.map((s) => s.id));
    for (const s of card) {
      expect(s.gpa).toBeCloseTo(Math.min(4, Math.max(0, life.education.current!.gpa + (life.education.school.spread[s.id] ?? 0))), 1);
      expect(s.grade).toMatch(/%$/);
      expect(['top', 'strong', 'solid', 'fair', 'weak', 'failing']).toContain(s.band);
    }
    expect(Object.values(life.education.school.spread).every((v) => Math.abs(v) <= b.report.spread.max)).toBe(true);
    expect(weakestSubject(life, content)!.gpa).toBe(Math.min(...card.map((s) => s.gpa)));
  });

  it('keeps most of the spread from year to year', () => {
    const first = produce(inCity('chicago', 12, 'middle', 2), (d) => void startSchoolYear(d, content));
    const second = produce(first, (d) => void startSchoolYear(d, content));
    const same = Object.keys(first.education.school.spread).filter((id) => first.education.school.spread[id] === second.education.school.spread[id]);
    expect(same.length).toBeGreaterThanOrEqual(2);
  });

  it('is shown in the country’s grades: letters, percent, ten-point', () => {
    expect(reportCard(produce(inCity('chicago', 12, 'middle', 2), (d) => void startSchoolYear(d, content)), content)[0]!.grade).toMatch(/^[A-F][+-]?$/);
    expect(reportCard(produce(inCity('mexico_city', 12, 'middle', 1), (d) => void startSchoolYear(d, content)), content)[0]!.grade).toMatch(/^\d+\.\d$/);
  });
});

describe('your class and your teachers', () => {
  const entered = (cityId: string, age: number, program: Enrollment['program'], y: number) => produce(inCity(cityId, age, program, y), (d) => void startSchoolYear(d, content));

  it('a class is made when a stage starts: its size and its staff are balance numbers, the teachers are adults', () => {
    for (const [program, age] of [['elementary', 5], ['middle', 11], ['high', 15], ['college', 20]] as const) {
      const life = entered('chicago', age, program, 1);
      const sc = life.education.school;
      expect(sc.classmates, program).toHaveLength(b.classes.size[program]);
      expect(Object.keys(sc.staff).sort(), program).toEqual([...b.teachers.roles[program]].sort());
      for (const id of sc.classmates) expect(life.relationships[id]).toMatchObject({ kind: 'classmate', status: 'active' });
      for (const id of Object.values(sc.staff)) {
        expect(life.relationships[id]).toMatchObject({ kind: 'teacher', status: 'active' });
        expect(life.currentYear - life.people[id]!.birthYear).toBeGreaterThanOrEqual(content.balance.relationships.adultAge);
      }
      if (age < content.balance.relationships.adultAge) {
        for (const id of sc.classmates) expect(life.currentYear - life.people[id]!.birthYear).toBeLessThan(content.balance.relationships.adultAge);
      } else {
        for (const id of sc.classmates) expect(life.currentYear - life.people[id]!.birthYear).toBeGreaterThanOrEqual(content.balance.relationships.adultAge);
      }
      if (program !== 'college') expect(checkInvariants(life, content)).toEqual([]);
    }
  });

  it('is kept while you share the school, with a few moving on each year', () => {
    const first = entered('chicago', 12, 'middle', 1);
    const second = produce(first, (d) => {
      d.education.current!.year = 2;
      startSchoolYear(d, content);
    });
    expect(second.education.school.key).toBe(first.education.school.key);
    expect(second.education.school.classmates).toHaveLength(b.classes.size.middle);
    const kept = second.education.school.classmates.filter((id) => first.education.school.classmates.includes(id));
    expect(kept.length).toBeGreaterThan(0);
    // A new school (a new stage, or a move to another city) is a new class.
    const high = produce(second, (d) => {
      d.education.current = { program: 'high', year: 1, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear };
      startSchoolYear(d, content);
    });
    expect(high.education.school.classmates.some((id) => first.education.school.classmates.includes(id))).toBe(false);
    const moved = produce(second, (d) => {
      d.character.cityId = 'houston';
      startSchoolYear(d, content);
    });
    expect(moved.education.school.classmates.some((id) => first.education.school.classmates.includes(id))).toBe(false);
  });

  it('is let go of when school ends', () => {
    const first = entered('chicago', 15, 'high', 3);
    const out = produce(first, (d) => {
      d.education.current = null;
      startSchoolYear(d, content);
    });
    expect(out.education.school.classmates).toEqual([]);
    expect(out.education.school.staff).toEqual({});
  });

  it('the yearly pruning keeps your current class and teachers, and lets the old ones fade', () => {
    const first = entered('chicago', 12, 'middle', 1);
    const people = [...first.education.school.classmates, ...Object.values(first.education.school.staff)];
    // Years pass with no memories: nobody in the class fades.
    const aged = produce(first, (d) => {
      d.currentYear += 8;
      for (const id of people) d.relationships[id]!.since -= 8;
      runRelationships(d, content);
    });
    for (const id of people) expect(aged.relationships[id]!.status).toBe('active');
    // They leave school: the class is released, and a year later the ones nobody remembers are gone.
    const released = produce(aged, (d) => {
      d.education.school.classmates = [];
      d.education.school.staff = {};
      d.relationships[people[0]!]!.memories.push({ tag: 'helped_with_schoolwork', year: d.currentYear });
    });
    // (The yearly step reads the life as the earlier steps left it, so the release is its own change.)
    const left = produce(released, (d) => void runRelationships(d, content));
    expect(left.relationships[people[0]!]).toBeDefined();
    expect(left.relationships[people[0]!]!.status).toBe('active');
    for (const id of people.slice(1)) {
      expect(left.relationships[id]).toBeUndefined();
      expect(left.people[id]).toBeUndefined();
    }
  });

  it('the People list cap holds with a class, teachers and coworkers counted', () => {
    const cap = content.balance.relationships.prune.maxPeople;
    const biggest = Math.max(...Object.values(b.classes.size)) + Math.max(...Object.values(b.teachers.roles).map((r) => r.length)) + Math.max(...Object.values(content.balance.careers.workplace.sizes).map((s) => s.max));
    expect(biggest).toBeLessThanOrEqual(cap - 10);
  });
});

describe('teachers are never romance', () => {
  const withTeacher = () => {
    const life = produce(inCity('chicago', 30, 'college', 1), (d) => void startSchoolYear(d, content));
    const teacher = life.education.school.staff.homeroom!;
    return { life, teacher };
  };

  it('whatever the content or the player does', () => {
    const { life, teacher } = withTeacher();
    const adult = produce(life, (d) => {
      d.people[teacher]!.identity.attractedTo = ['man', 'woman', 'nonbinary'];
      d.character.identity.attractedTo = ['man', 'woman', 'nonbinary'];
    });
    expect(isRomanceCandidate(adult, adult.people[teacher]!, content)).toBe(false);
    for (const kind of ['partner', 'fiance', 'spouse', 'ex', 'friend', 'acquaintance'] as const) expect(canChangeKind(adult, teacher, kind, content)).toBe(false);
    for (const id of ['flirt', 'go_on_date', 'kiss', 'be_intimate']) {
      const def = content.interactions[id];
      if (def) expect(isInteractionAvailable(adult, def, teacher, content), id).toBe(false);
    }
  });

  it('a teacher in a tie or a romance is an invariant failure', () => {
    const { life, teacher } = withTeacher();
    const other = life.education.school.classmates[0]!;
    const tied = produce(life, (d) => {
      d.web.ties[teacher < other ? `${teacher}|${other}` : `${other}|${teacher}`] = { a: teacher < other ? teacher : other, b: teacher < other ? other : teacher, kind: 'friends', affection: 50, origin: 'context', since: d.currentYear };
    });
    expect(checkInvariants(tied, content).join()).toMatch(/is a teacher and in a tie/);
    const dating = produce(life, (d) => void (d.relationships[teacher]!.kind = 'partner'));
    expect(checkInvariants(dating, content).join()).toMatch(/a teacher in a romance/);
  });

  it('no romance interaction lists teachers, and teacher interactions exist for each thing you can do', () => {
    for (const def of Object.values(content.interactions)) {
      if (def.romance || def.group === 'romance') expect(def.availability.kinds, def.id).not.toContain('teacher');
    }
    for (const id of ['ask_teacher_help', 'suck_up', 'argue_with_teacher', 'report_problem']) {
      expect(content.interactions[id]!.availability.kinds).toEqual(['teacher']);
    }
  });

  it('asking a teacher for help is an interaction that can lift the year’s grade', () => {
    const { life, teacher } = withTeacher();
    const ask = content.interactions.ask_teacher_help!;
    expect(isInteractionAvailable(life, ask, teacher, content)).toBe(true);
    let lifted = false;
    for (let i = 0; i < 40 && !lifted; i++) {
      const tried = produce(life, (d) => void (d.rng.a = (d.rng.a ^ Math.imul(i + 1, 2654435761)) >>> 0));
      const done = closeInteraction(performInteraction(tried, { interactionId: 'ask_teacher_help', personId: teacher }, content), content);
      lifted = done.education.current!.boost > tried.education.current!.boost;
    }
    expect(lifted).toBe(true);
  });
});

describe('clubs and teams for younger ages', () => {
  it('open from the age their definitions allow, to the adult age', async () => {
    const { activityBlock, joinActivity } = await import('../teen/activities');
    const young = inCity('chicago', 9, 'elementary', 5);
    expect(content.activities.art_club!.minAge).toBeLessThan(13);
    expect(activityBlock(young, 'art_club', content)).toBeNull();
    expect(activityBlock(inCity('chicago', 6, 'elementary', 2), 'art_club', content)).toBe('age');
    expect(activityBlock(produce(young, (d) => void (d.education.current = null)), 'art_club', content)).toBe('age');
    const joined = produce(young, (d) => void joinActivity(d, 'art_club', content));
    expect(joined.teen.activities.map((a) => a.id)).toEqual(['art_club']);
    expect(isLifeActionAvailable(young, 'join_activity', { activityId: 'art_club' }, content)).toBe(true);
  });
});

describe('exam ids', () => {
  it('have balance numbers and a name in every country that holds them', () => {
    for (const id of Object.keys(b.exams) as ExamId[]) expect(b.exams[id].top).toBeGreaterThan(b.exams[id].pass);
    for (const country of Object.values(content.countries)) {
      for (const slot of country.school.exams) expect(country.words.examNames[slot.id]).toBeTruthy();
      if (country.school.choice) for (const p of country.school.choice.options as SchoolPath[]) expect(country.words.choices?.[p]).toBeTruthy();
    }
  });
});
