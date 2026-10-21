/**
 * Content checks for school and work life (Batch 3): each country's exams,
 * choice and curriculum agree with its school years (and so does every city
 * that changes them); the balance and the content agree; the events the school
 * step queues exist and tell the band they require; and the rules that never
 * bend: a teacher is never romance (no interaction that is romance lists them,
 * no event that casts one is a romance event or uses romantic wording), and
 * an event that casts a teacher needs you to be in school.
 */
import type { CollectionKey, Condition, ContentBundle, Effect, EventDef } from '../../src/content/schemas';
import { SCHOOL_TRIGGERS } from '../../src/content/schemas';
import { countryOfCity } from '../../src/engine/country';
import { isRomanceEvent, isRomanticKind } from '../../src/engine/relationships';
import type { ContentError } from './compile';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/school.yaml';
const REGISTRY = 'registries/school.yaml';

const EXAM_TRIGGERS = ['gcse', 'alevels', 'sat', 'provincial', 'mx_placement', 'mx_entrance'] as const;

function outcomesOf(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

function textsOf(def: EventDef): string[] {
  const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label)];
  for (const o of outcomesOf(def)) {
    if (o.text) texts.push(o.text);
    for (const e of o.effects as Effect[]) if (e.type === 'history') texts.push(e.text);
  }
  return texts;
}

/** True when every way of meeting the condition mentions a flag with this name (so the text can rely on it). */
function requiresFlag(c: Condition | undefined, flag: string): boolean {
  if (!c) return false;
  if ('all' in c) return c.all.some((x) => requiresFlag(x, flag));
  if ('any' in c) return c.any.length > 0 && c.any.every((x) => requiresFlag(x, flag));
  return 'flag' in c && c.flag === flag;
}

/** True when the requirements need you to be in school. */
function requiresSchool(c: Condition | undefined): boolean {
  if (!c) return false;
  if ('all' in c) return c.all.some(requiresSchool);
  if ('any' in c) return c.any.length > 0 && c.any.every(requiresSchool);
  return 'education' in c && c.education.program !== undefined && !c.education.program.includes('none');
}

export function checkSchool(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.school;

  // Balance.
  for (const [id, e] of Object.entries(b.exams)) if (e.top <= e.pass) err(BALANCE, `exams.${id}: top (${e.top}) must be above pass (${e.pass})`);
  const biggestClass = Math.max(...Object.values(b.classes.size));
  const staff = Math.max(...Object.values(b.teachers.roles).map((r) => r.length));
  const sizes = Object.values(bundle.balance.careers.workplace.sizes);
  const room = bundle.balance.relationships.prune.maxPeople;
  if (biggestClass + staff + Math.max(...sizes.map((s) => s.max)) > room - 10) {
    err(BALANCE, `a class (${biggestClass}), its staff (${staff}) and the biggest workplace's coworkers leave less than 10 places on the People list (${room})`);
  }
  for (const w of Object.values(bundle.balance.careers.workplace.sizes)) if (w.coworkers > w.max) err('balance/careers.yaml', 'workplace.sizes: a size starts with more coworkers than its most');

  // Each country, and each city that changes the school rules.
  const places: { label: string; file: string; country: ReturnType<typeof countryOfCity> }[] = [];
  for (const [id, country] of Object.entries(bundle.countries)) places.push({ label: id, file: `countries/${id}.yaml`, country });
  for (const [id, city] of Object.entries(bundle.cities)) if (city.education) places.push({ label: `city ${id}`, file: fileOf('cities', id), country: countryOfCity(id, bundle) });
  for (const { label, file, country } of places) {
    const s = country.school;
    const e = (message: string) => err(file, `${label}: ${message}`);
    const years = { elementary: s.elementary, middle: s.middle, high: s.high };
    if (country.words.gradeLabels.length !== years.elementary + years.middle + years.high) e(`words.gradeLabels has ${country.words.gradeLabels.length} names but school runs ${years.elementary + years.middle + years.high} years`);
    for (const slot of s.exams) {
      if (slot.year > years[slot.program]) e(`school.exams: ${slot.id} is in year ${slot.year} of ${slot.program}, which has ${years[slot.program]}`);
      if (country.words.examNames[slot.id] === undefined) e(`words.examNames: no name for the exam ${slot.id}`);
      const kind = b.exams[slot.id].kind;
      if (kind === 'confirm' && !(slot.program === 'high' && slot.year === years.high)) e(`school.exams: ${slot.id} confirms a place, so it must be in the last year of high school`);
    }
    if (new Set(s.exams.map((x) => x.id)).size !== s.exams.length) e('school.exams: an exam is listed twice');
    if (s.choice) {
      const gate = s.exams.find((x) => x.id === s.choice!.exam);
      if (!gate || gate.program !== 'high' || gate.year !== s.choice.year) e(`school.choice: its exam (${s.choice.exam}) must be sat in the same year of high school (${s.choice.year})`);
      if (s.choice.year >= years.high) e('school.choice: the choice must come before the last year of high school');
      if (!country.words.choices) e('words.choices: the choice has no names');
      if (s.choice.options.includes('apprenticeship') && Object.keys(country.tuition.trade).length === 0) e('school.choice: an apprenticeship needs trades with prices (tuition.trade)');
      if (!s.curriculum.upper) e('school.curriculum.upper: the years after the choice need their own subjects');
    } else if (s.curriculum.upper) {
      e('school.curriculum.upper: only a country with a choice has years after it');
    }
    if (s.preUniversity && country.collegeYears.community < 1) e('collegeYears.community: the college that comes first needs at least a year');
  }

  // Interactions and events: a teacher is never romance.
  for (const [id, def] of Object.entries(bundle.interactions)) {
    if (def.retired) continue;
    if ((def.romance === true || def.group === 'romance') && def.availability.kinds.includes('teacher')) err(fileOf('interactions', id), `${id}: a romance interaction can't list teachers`);
  }

  if (partialEvents) return errors;

  // The events the school step queues.
  for (const trigger of SCHOOL_TRIGGERS) {
    for (const id of bundle.registries.school.triggers[trigger].events) {
      const def = bundle.events[id];
      if (!def) {
        err(REGISTRY, `${trigger}: unknown event "${id}"`);
        continue;
      }
      const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
      if ((EXAM_TRIGGERS as readonly string[]).includes(trigger)) {
        if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly (the school step queues it)`);
        if (!requiresFlag(def.requires, `exam_${trigger}`)) e(`answers ${trigger}, so it must require the flag exam_${trigger}`);
      } else if (trigger === 'caught_cheating' || trigger === 'skipped') {
        if (trigger === 'caught_cheating' && !def.followUpOnly) e('answers caught_cheating, so it must be followUpOnly');
        // (The step passes the teacher in; an older event that doesn't name one, like the truancy letter, simply ignores it.)
        if (def.cast?.['teacher'] && def.cast['teacher'].kind !== 'teacher') e(`answers ${trigger}, so a role named "teacher" must be cast as a teacher`);
        if (textsOf(def).join('\n').includes('{teacher') && !def.cast?.['teacher']) e(`uses {teacher...} without casting a teacher`);
      } else if (trigger === 'report') {
        if (!def.followUpOnly) e('answers report, so it must be followUpOnly');
        if (!requiresFlag(def.requires, 'report_failing') && !requiresFlag(def.requires, 'report_shining')) e('answers report, so it must require the flag report_failing or report_shining');
      }
    }
  }

  // Events that cast a teacher.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const castsTeacher = Object.values(def.cast ?? {}).some((spec) => spec.kind === 'teacher');
    if (!castsTeacher) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    if (!requiresSchool(def.requires) && def.category !== 'school') e('casts a teacher, so it needs you to be in school (education: program)');
    if (isRomanceEvent(def, bundle)) e('a teacher is never in a romance event');
    for (const [role, spec] of Object.entries(def.cast ?? {})) if (spec.kind === 'teacher' && (spec.romantic || spec.admirer)) e(`cast.${role}: a teacher is never a romantic role`);
    const teacherRoles = Object.entries(def.cast ?? {}).filter(([, spec]) => spec.kind === 'teacher').map(([role]) => role);
    for (const o of outcomesOf(def)) {
      for (const eff of o.effects as Effect[]) {
        if (eff.type === 'relationship' && teacherRoles.includes(eff.role) && eff.kind !== undefined && isRomanticKind(eff.kind)) e(`a teacher can't become a ${eff.kind}`);
      }
    }
    const hit = textsOf(def).join('\n').match(ROMANCE_WORDS);
    if (hit) e(`casts a teacher and uses romantic or sexual wording ("${hit[0]}")`);
  }
  return errors;
}
