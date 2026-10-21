/**
 * The people of your school (Batch 3): a class of classmates and your
 * teachers and staff. A class is made when you start a stage (or a new
 * school) and kept while you share the school; each school year a few
 * classmates have moved on and new ones take their places, and the homeroom
 * teacher may change. The yearly pruning keeps your current class and
 * teachers (../systems/relationships.ts); once you leave they fade like
 * anyone else.
 *
 * Nobody here is romantic: teachers are adults, never a possible partner
 * (../relationships.ts), and classmates under 18 are minors (the romance rules
 * need two adults). Numbers: balance/school.yaml (classes, teachers).
 */
import type { CastSpec, ContentBundle } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { clampInt, rollScore } from '../random';
import { chance } from '../rng';
import type { Enrollment, Id, LifeState, Person } from '../types';
import { schoolLine } from './events';
import { type SchoolStage } from './query';
import { educationCountry } from '../travel/travel';

type StaffRole = 'homeroom' | 'head' | 'support';

/** The school you are at now: its stage, city and (for a post-secondary program) which enrollment, so that a new program is a new class. */
export function schoolKeyOf(state: LifeState, cur: Enrollment): string {
  const place = cur.program === 'college' || cur.program === 'trade' || cur.program === 'grad' ? `:${cur.since}` : cur.venue ? `:${cur.venue}` : '';
  return `${state.character.cityId}:${cur.program}${place}`;
}

/** The age range classmates are drawn from for you now. */
function classmateAges(state: LifeState, content: ContentBundle): { min: number; max: number } {
  const c = content.balance.school.classes;
  const adult = content.balance.relationships.adultAge;
  const age = state.character.age;
  if (age < adult) return { min: Math.max(3, age - c.minorSpread), max: Math.min(adult - 1, age + c.minorSpread) };
  return { min: Math.max(adult, age - c.adultSpread.below), max: age + c.adultSpread.above };
}

function addClassmate(state: LifeState, content: ContentBundle): Id | null {
  const range = classmateAges(state, content);
  if (range.min > range.max) return null;
  const spec: CastSpec = { kind: 'classmate', presence: 'city', age: range };
  const id = createPerson(state, spec, state.rng, content);
  if (id === null) return null;
  state.relationships[id]!.affection = clampInt(rollScore(state.rng, content.balance.school.classes.affection), 0, 100);
  state.people[id]!.tags = [...state.people[id]!.tags, 'school'];
  return id;
}

function addTeacher(state: LifeState, role: StaffRole, content: ContentBundle): Id | null {
  const age = content.balance.school.teachers.age[role];
  const id = createPerson(state, { kind: 'teacher', presence: 'city', age: { min: age.min, max: age.max } }, state.rng, content);
  if (id === null) return null;
  const person = state.people[id] as Person;
  // A teacher's work is teaching: not the random job a stranger would get.
  delete person.occupation;
  person.wealthLevel = 'middle';
  person.tags = [...person.tags, 'school', role];
  state.relationships[id]!.affection = clampInt(rollScore(state.rng, content.balance.school.teachers.affection), 0, 100);
  return id;
}

const stageOf = (cur: Enrollment): SchoolStage => cur.program;

/** Your class and staff stay in the list only while they are alive and in your life. */
function livingClass(state: LifeState): Id[] {
  return state.education.school.classmates.filter((id) => state.people[id]?.alive === true && state.relationships[id]?.status !== 'ended');
}

/** A new school: a whole new class and the staff its stage has. */
function startSchool(state: LifeState, cur: Enrollment, key: string, content: ContentBundle): void {
  const sc = state.education.school;
  const stage = stageOf(cur);
  sc.key = key;
  sc.classmates = [];
  sc.staff = {};
  for (let i = 0; i < content.balance.school.classes.size[stage]; i++) {
    const id = addClassmate(state, content);
    if (id !== null) sc.classmates.push(id);
  }
  for (const role of content.balance.school.teachers.roles[stage]) {
    const id = addTeacher(state, role, content);
    if (id !== null) sc.staff[role] = id;
  }
}

/** The same school, a year on: classmates who moved on are replaced, the homeroom teacher may change, a staff member who is gone is replaced. */
function nextYearAtSchool(state: LifeState, cur: Enrollment, content: ContentBundle): void {
  const sc = state.education.school;
  const stage = stageOf(cur);
  const b = content.balance.school;
  const kept = livingClass(state).filter(() => !chance(state.rng, b.classes.churn));
  const want = b.classes.size[stage];
  while (kept.length < want) {
    const id = addClassmate(state, content);
    if (id === null) break;
    kept.push(id);
  }
  sc.classmates = kept;
  for (const role of b.teachers.roles[stage]) {
    const current = sc.staff[role];
    const gone = current === undefined || state.people[current]?.alive !== true || state.relationships[current]?.status === 'ended';
    if (gone || (role === 'homeroom' && chance(state.rng, b.teachers.homeroomChange[stage]))) {
      const id = addTeacher(state, role, content);
      if (id !== null) sc.staff[role] = id;
    }
  }
}

/** Called as a school year begins, once your enrollment is settled: makes or refreshes the class and staff, or lets go of them when you are out of school. */
export function syncSchoolPeople(state: LifeState, content: ContentBundle): void {
  const sc = state.education.school;
  const cur = state.education.current;
  if (!cur) {
    sc.key = null;
    sc.classmates = [];
    sc.staff = {};
    return;
  }
  const key = schoolKeyOf(state, cur);
  if (key !== sc.key) {
    startSchool(state, cur, key, content);
    if (cur.program !== 'elementary') {
      const city = content.cities[state.character.cityId];
      const school = cur.program === 'college' ? (city?.schools[cur.tier ?? 'state'] ?? '') : cur.program === 'trade' ? (city?.schools.trade ?? '') : cur.program === 'grad' ? (city?.schools.grad ?? '') : cur.venue === 'college' ? (city?.schools.community ?? '') : (city?.schools.high ?? '');
      schoolLine(state, 'newClass', { school }, content);
    }
  } else {
    nextYearAtSchool(state, cur, content);
  }
}

/** The staff of your school with their roles, in a fixed order (homeroom, head, support). */
export function staffList(state: LifeState): { role: StaffRole; id: Id }[] {
  const staff = state.education.school.staff;
  return (['homeroom', 'head', 'support'] as const).flatMap((role) => (staff[role] !== undefined ? [{ role, id: staff[role]! }] : []));
}

/** The words for a staff role in the country you study in ("form tutor", "headteacher"). */
export function staffWord(state: LifeState, role: StaffRole, content: ContentBundle): string {
  const w = educationCountry(state, content).words;
  return role === 'homeroom' ? w.homeroom : role === 'head' ? w.principal : w.support;
}

