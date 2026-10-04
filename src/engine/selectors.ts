/** Read-only helpers the UI uses to show a life. */
import {
  LIFESTYLES,
  TIERS,
  type ApplyProgram,
  type ChoiceDef,
  type ContentBundle,
  type CredentialType,
  type DebtKind,
  type JobCategory,
  type Lifestyle,
  type Outcome,
  type Program,
  type RomanceStatus,
  type Tier,
  type Tone,
  type ConditionKind,
} from '../content/schemas';
import { availableActions, isLifeActionAvailable, type AvailableAction } from './actions';
import { evaluate } from './conditions';
import {
  admissionChance,
  applyBlock,
  billFor,
  canLeaveSchool,
  canReturn,
  canTakeGed,
  finishedHighSchool,
  inPostSecondary,
  isPostSecondary,
  letterGrade,
  majorChangeAddsYear,
  programLength,
  schoolName,
  scholarshipShare,
  studentLoansPaused,
  type ApplyBlock,
  type ApplyTarget,
} from './education';
import { canStartDebtPlan, isIndependent, netWorth, totalDebt, wholeDollars } from './finance';
import {
  livingCost,
  moveInCost,
  mortgageBalance,
  purchaseQuote,
  rentChangeAmount,
  rentIn,
  saleProceeds,
  supportingParent,
  type PurchaseQuote,
} from './housing';
import { costToYou, familyHelp, rentMonthsAmount } from './costs';
import { availableInteractions } from './interactions/availability';
import { moodView, type MoodView } from './interactions/mood';
export { getInteractionMenu, getInteractionOutcome } from './interactions/views';
export {
  canPlanEstate,
  getDeathView,
  getFamilyLineView,
  getPreviously,
  getWillView,
  groupArchiveByLine,
  type ArchiveFamilyLine,
  type DeathView,
  type EstateLineView,
  type FamilyLineView,
  type HeirOptionView,
  type WillRowView,
  type WillView,
} from './estate/views';
export { getChildView, getFamilyView, type ChildView, type FamilyOptionView, type FamilyView, type PregnancyView } from './family/views';
import { getChildView, type ChildView } from './family/views';
export type { InteractionMenuGroup, InteractionMenuItem, InteractionOutcomeView } from './interactions/views';
export type { MoodBand, MoodView } from './interactions/mood';
import { consistencyProblems, whereabouts } from './presence';
import { benefitFromRecord } from './retirement';
import {
  activeJob,
  canRetire,
  currentBoss,
  hireChance,
  jobApplyBlock,
  levelPay,
  levelTitle,
  meetsJobRequirements,
  searchBlock,
  startLevel,
  type JobApplyBlock,
  type SearchBlock,
} from './career';
import { canGig, expectedGigPay } from './systems/career';
import { textContext } from './events/text';
import { CONTINUE_CHOICE } from './life';
import { currentPartner, FAMILY_KINDS, isCurrentPartner, romanceStatus, ROMANTIC_KINDS, WORK_KINDS } from './relationships';
import { renderText } from './text';
import { doctorQuote } from './health';
import type {
  GenderCategory,
  HistoryEntry,
  Identity,
  Personality,
  RecordOutcome,
  HousingKind,
  Id,
  JobEnd,
  Ledger,
  LifeStage,
  LifeState,
  MoneyChange,
  Person,
  Relationship,
  RelationshipKind,
  SchoolBill,
  SchoolPlace,
  StatKey,
} from './types';

export { netWorth } from './finance';

export interface FamilyMember {
  person: Person;
  relationship: Relationship;
  /** Age this year, or at death. */
  age: number;
}

export function personAge(person: Person, currentYear: number): number {
  return (person.deathYear ?? currentYear) - person.birthYear;
}

const FAMILY_ORDER: Partial<Record<Relationship['kind'], number>> = {
  parent: 0,
  stepparent: 1,
  grandparent: 2,
  relative: 3,
  sibling: 4,
  child: 5,
  stepchild: 6,
};

/** Your spouses, current and late (not exes), longest married first. */
export function getSpouses(state: LifeState): FamilyMember[] {
  return Object.values(state.relationships)
    .filter((r) => r.kind === 'spouse')
    .flatMap((relationship) => {
      const person = state.people[relationship.personId];
      return person ? [{ person, relationship, age: personAge(person, state.currentYear) }] : [];
    })
    .sort((a, b) => (a.relationship.kindSince ?? 0) - (b.relationship.kindSince ?? 0));
}

/** Parents first, then siblings; oldest first within each group. */
export function getFamily(state: LifeState): FamilyMember[] {
  return Object.values(state.relationships)
    .filter((r) => r.kind in FAMILY_ORDER)
    .flatMap((relationship) => {
      const person = state.people[relationship.personId];
      return person ? [{ person, relationship, age: personAge(person, state.currentYear) }] : [];
    })
    .sort(
      (a, b) =>
        FAMILY_ORDER[a.relationship.kind]! - FAMILY_ORDER[b.relationship.kind]! || a.person.birthYear - b.person.birthYear,
    );
}

export interface CharacterSummary {
  fullName: string;
  age: number;
  lifeStage: LifeStage;
  cityName: string;
  /** e.g. "she/her" or "xe/xem". */
  pronounLabel: string;
  housing: HousingKind;
  savings: number;
  debt: number;
  /** Single, dating, engaged or married, and to whom. */
  romance: { status: RomanceStatus; partnerName: string | null };
  /** Where you're at school now, if you are. */
  school: SchoolLine | null;
  /** Your job now, if you have one: your title and employer. */
  job: { title: string; employer: string } | null;
  retired: boolean;
  /** E2b: who a minor heir lives with, and whether that is foster care. */
  guardian: { name: string; relation: Relationship['kind']; foster: boolean } | null;
}

/** Your school now, for one-line summaries. */
export interface SchoolLine {
  program: Program;
  /** Kindergarten to 12th grade (0 is kindergarten); null after high school. */
  gradeLevel: number | null;
  schoolName: string;
  /** Your major, trade or grad program (null in automatic school). */
  studying: string | null;
}

export function getCharacterSummary(state: LifeState, content: ContentBundle): CharacterSummary {
  const c = state.character;
  const partner = currentPartner(state);
  const person = partner ? state.people[partner.personId] : undefined;
  return {
    fullName: `${c.name.first} ${c.name.last}`,
    age: c.age,
    lifeStage: c.lifeStage,
    cityName: content.cities[c.cityId]?.name ?? c.cityId,
    pronounLabel: `${c.identity.pronouns.subject}/${c.identity.pronouns.object}`,
    housing: state.housing.kind,
    savings: state.finances.savings,
    debt: totalDebt(state),
    romance: { status: romanceStatus(state), partnerName: person ? `${person.name.first} ${person.name.last}` : null },
    school: state.education.current ? schoolLine(state, state.education.current, content) : null,
    job: state.career.job ? { title: levelTitle(content.jobs[state.career.job.jobId], state.career.job.level), employer: state.career.job.employer } : null,
    retired: state.career.retired,
    guardian:
      state.housing.guardianId !== undefined && state.people[state.housing.guardianId]
        ? {
            name: `${state.people[state.housing.guardianId]!.name.first} ${state.people[state.housing.guardianId]!.name.last}`,
            relation: state.relationships[state.housing.guardianId]?.kind ?? 'relative',
            foster: state.housing.foster === true,
          }
        : null,
  };
}

/** Kindergarten (0) to 12th grade for a year of automatic school; null otherwise. */
export function gradeLevel(program: Program, year: number, content: ContentBundle): number | null {
  const s = content.balance.education.school;
  if (program === 'elementary') return year - 1;
  if (program === 'middle') return s.elementary + year - 1;
  if (program === 'high') return s.elementary + s.middle + year - 1;
  return null;
}

/** The name of what you study in a program: a major, trade or grad program (null in automatic school). */
export function studyingName(place: SchoolPlace, content: ContentBundle): string | null {
  if (place.program === 'college') return content.majors[place.majorId ?? '']?.name ?? null;
  if (place.program === 'trade') return content.trades[place.tradeId ?? '']?.name ?? null;
  if (place.program === 'grad') return content.gradPrograms[place.gradProgramId ?? '']?.name ?? null;
  return null;
}

function schoolLine(state: LifeState, place: SchoolPlace & { year?: number }, content: ContentBundle): SchoolLine {
  return {
    program: place.program,
    gradeLevel: place.year === undefined ? null : gradeLevel(place.program, place.year, content),
    schoolName: schoolName(state, place, content),
    studying: studyingName(place, content),
  };
}

export interface CredentialView {
  type: CredentialType;
  /** The major, trade license or grad degree it is for (null for a diploma or GED). */
  field: string | null;
  year: number;
  /** Final grades as a letter, where there was a GPA. */
  letter: string | null;
  tier: Tier | null;
}

export interface EnrollmentView extends SchoolLine {
  tier: Tier | null;
  year: number;
  lengthYears: number;
  /** Your GPA as a letter grade. */
  letter: string;
  final: boolean;
  /** Years you were held back. */
  repeats: number;
  canDropOut: boolean;
  /** College: you can change your major now (not yet changed this year). */
  canChangeMajor: boolean;
  majorId: string | null;
  /** Changing major now adds a year. */
  changeAddsYear: boolean;
  /** This school year's tuition and who paid it (college, trade school and grad school). */
  bill: SchoolBill | null;
}

export interface SchoolView {
  between: boolean;
  age: number;
  /** School starts at this age. */
  startAge: number;
  /** High school can be left from this age. */
  dropoutAge: number;
  current: EnrollmentView | null;
  /** A place you start at when the next year begins. */
  admission: (SchoolLine & { tier: Tier | null; returning: boolean; scholarship: number }) | null;
  /** The program you left, and whether you can go back to it now. */
  left: (SchoolLine & { tier: Tier | null; canReturn: boolean }) | null;
  credentials: CredentialView[];
  /** You're at a point where you could apply somewhere (not in school, or in your last year). */
  canApply: boolean;
  /** The GED, if you haven't finished high school: can you take it now, its fee, and this year's result. */
  ged: { available: boolean; fee: number; result: boolean | null } | null;
  /** This year's applications: the option, the school and the answer. */
  decisions: { option: string; name: string; accepted: boolean }[];
  /** Scholarship money won in events, waiting to pay tuition. */
  fund: number;
}

/** The school part of the Work/School tab. */
export function getSchoolView(state: LifeState, content: ContentBundle): SchoolView {
  const edu = state.education;
  // School actions happen between years, and never from prison (Stage 9).
  const between = state.phase === 'yearStart' && state.housing.kind !== 'incarcerated';
  const cur = edu.current;
  const school = content.balance.education.school;
  const current: EnrollmentView | null = cur
    ? {
        ...schoolLine(state, cur, content),
        tier: cur.tier ?? null,
        year: cur.year,
        lengthYears: cur.lengthYears,
        letter: letterGrade(cur.gpa, content),
        final: cur.year >= cur.lengthYears,
        repeats: cur.repeats,
        canDropOut: between && canLeaveSchool(state, content),
        canChangeMajor: between && cur.program === 'college' && !edu.applied.some((a) => a.option === 'major'),
        majorId: cur.majorId ?? null,
        changeAddsYear: majorChangeAddsYear(state, content),
        bill: isPostSecondary(cur.program) && edu.lastBill?.year === state.currentYear ? edu.lastBill : null,
      }
    : null;
  const credentials: CredentialView[] = edu.credentials.map((c) => ({
    type: c.type,
    field:
      c.type === 'associate' || c.type === 'bachelor'
        ? (content.majors[c.refId ?? '']?.subject ?? null)
        : c.type === 'trade_license'
          ? (content.trades[c.refId ?? '']?.license ?? null)
          : c.type === 'grad'
            ? (content.gradPrograms[c.refId ?? '']?.degree ?? null)
            : null,
    year: c.year,
    letter: c.gpa === undefined ? null : letterGrade(c.gpa, content),
    tier: c.tier ?? null,
  }));
  const gedTry = edu.applied.find((a) => a.option === 'ged');
  const options = getApplicationOptions(state, content);
  return {
    between,
    age: state.character.age,
    startAge: school.startAge,
    dropoutAge: school.dropoutAge,
    current,
    admission: edu.admission
      ? { ...schoolLine(state, edu.admission, content), tier: edu.admission.tier ?? null, returning: edu.admission.resume !== undefined, scholarship: edu.admission.scholarship }
      : null,
    left: edu.left ? { ...schoolLine(state, edu.left, content), tier: edu.left.tier ?? null, canReturn: between && canReturn(state, content) } : null,
    credentials,
    canApply:
      state.housing.kind !== 'incarcerated' &&
      state.character.age >= school.applyAge &&
      (!cur || (cur.year >= cur.lengthYears && cur.program !== 'elementary' && cur.program !== 'middle')) &&
      [...options.college, ...options.trade, ...options.grad].some((o) => o.block === null || o.block === 'tried' || o.block === 'holding'),
    ged: finishedHighSchool(state)
      ? null
      : { available: between && canTakeGed(state, content), fee: content.balance.education.ged.fee, result: gedTry ? gedTry.accepted : null },
    decisions: edu.applied
      .filter((a) => a.option.includes(':'))
      .map((a) => ({ option: a.option, name: optionName(state, a.option, content), accepted: a.accepted })),
    fund: edu.fund,
  };
}

/** A readable name for an application option: the school, or the trade or grad program. */
function optionName(state: LifeState, option: string, content: ContentBundle): string {
  const [program, id] = option.split(':') as [string, string];
  if (program === 'college') return schoolName(state, { program: 'college', tier: id as Tier }, content);
  if (program === 'trade') return content.trades[id]?.name ?? id;
  return content.gradPrograms[id]?.name ?? id;
}

export interface ApplyOptionView {
  /** 'college:state', 'trade:welder', 'grad:law'. */
  key: string;
  program: ApplyProgram;
  /** College tier. */
  tier: Tier | null;
  /** Trade or grad program id. */
  id: string | null;
  /** The school (college), or the trade or grad program. */
  name: string;
  schoolName: string;
  blurb: string | null;
  careers: string | null;
  years: number;
  /** A first year's bill if you were accepted now (as you'd be next year, when it starts): tuition, and who would pay it. */
  bill: Omit<SchoolBill, 'year'>;
  /** Your chance of getting in (0–1); the UI shows it in words. */
  chance: number;
  /** Why you can't apply now (null: you can). */
  block: ApplyBlock | null;
  /** This year's answer, if you applied. */
  result: boolean | null;
}

export interface MajorOption {
  id: string;
  name: string;
  blurb: string;
  careers: string;
  difficulty: number;
}

export interface ApplicationOptions {
  /** One per college tier; the major is picked when applying. */
  college: ApplyOptionView[];
  trade: ApplyOptionView[];
  grad: ApplyOptionView[];
  majors: MajorOption[];
  /** Each application costs this. */
  fee: number;
}

const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Majors you can study, by name. */
export function getMajorOptions(content: ContentBundle): MajorOption[] {
  return Object.values(content.majors)
    .filter((m) => !m.retired)
    .map((m) => ({ id: m.id, name: m.name, blurb: m.blurb, careers: m.careers, difficulty: m.difficulty }))
    .sort(byName);
}

/** Everywhere you could apply, with what it would cost, your odds and whether you can apply now. */
export function getApplicationOptions(state: LifeState, content: ContentBundle): ApplicationOptions {
  const majors = getMajorOptions(content);
  const between = state.phase === 'yearStart';
  const view = (target: ApplyTarget, name: string, blurb: string | null, careers: string | null): ApplyOptionView => {
    const key = target.program === 'college' ? `college:${target.tier}` : target.program === 'trade' ? `trade:${target.tradeId}` : `grad:${target.gradProgramId}`;
    const decision = state.education.applied.find((a) => a.option === key);
    const block = applyBlock(state, target, content);
    return {
      key,
      program: target.program,
      tier: target.program === 'college' ? target.tier : null,
      id: target.program === 'trade' ? target.tradeId : target.program === 'grad' ? target.gradProgramId : null,
      name,
      schoolName: schoolName(state, target, content),
      blurb,
      careers,
      years: programLength(target, content),
      bill: billFor(state, target, scholarshipShare(state, target.program, content), content, true),
      chance: admissionChance(state, target, content),
      block: !between && block === null ? 'enrolled' : block,
      result: decision ? decision.accepted : null,
    };
  };
  const firstMajor = majors[0]?.id ?? '';
  return {
    college: TIERS.map((tier) => view({ program: 'college', tier, majorId: firstMajor }, schoolName(state, { program: 'college', tier }, content), null, null)),
    trade: Object.values(content.trades)
      .filter((t) => !t.retired)
      .sort(byName)
      .map((t) => view({ program: 'trade', tradeId: t.id }, t.name, t.blurb, t.careers)),
    grad: Object.values(content.gradPrograms)
      .filter((g) => !g.retired && content.balance.education.admission.grad[g.id])
      .sort(byName)
      .map((g) => view({ program: 'grad', gradProgramId: g.id }, g.name, g.blurb, g.careers)),
    majors,
    fee: content.balance.education.admission.fee,
  };
}


/** Groups on the People screen (docs/design.md, section L). */
export type PeopleGroupId = 'family' | 'children' | 'romance' | 'friends' | 'work';
export const PEOPLE_GROUPS: readonly PeopleGroupId[] = ['family', 'children', 'romance', 'friends', 'work'];

export interface PersonRow {
  id: Id;
  fullName: string;
  kind: RelationshipKind;
  genderCategory: GenderCategory;
  /** Age this year, or at death. */
  age: number;
  alive: boolean;
  status: Relationship['status'];
  affection: number;
  trust: number;
  /** Your current partner, fiancé or spouse. */
  current: boolean;
  /** Has been your spouse (an ex-spouse, once divorced). */
  wasSpouse: boolean;
  /** E1: how they're feeling, for people close to you only (family, your partner, close friends); null otherwise. */
  mood: MoodView | null;
}

function groupOf(kind: RelationshipKind): PeopleGroupId {
  if (kind === 'child' || kind === 'stepchild') return 'children';
  if (FAMILY_KINDS.includes(kind)) return 'family';
  if (ROMANTIC_KINDS.includes(kind)) return 'romance';
  if (WORK_KINDS.includes(kind)) return 'work';
  return 'friends';
}

function personRow(state: LifeState, person: Person, rel: Relationship, content: ContentBundle): PersonRow {
  return {
    id: person.id,
    fullName: `${person.name.first} ${person.name.last}`,
    kind: rel.kind,
    genderCategory: person.identity.genderCategory,
    age: personAge(person, state.currentYear),
    alive: person.alive,
    status: rel.status,
    affection: rel.affection,
    trust: rel.trust,
    current: isCurrentPartner(state, rel),
    wasSpouse: rel.wasSpouse === true,
    mood: moodView(state, person.id, content),
  };
}

const KIND_ORDER: RelationshipKind[] = [
  'parent',
  'stepparent',
  'grandparent',
  'relative',
  'sibling',
  'child',
  'stepchild',
  'spouse',
  'fiance',
  'partner',
  'ex',
  'friend',
  'classmate',
  'acquaintance',
  'boss',
  'coworker',
];

/**
 * Everyone in your life, grouped into family, romance, friends and work.
 * Family is always listed; anyone else who has faded out of your life
 * (status 'ended') is left out. Within a group: the living first, then by
 * kind, then (family) oldest first or (others) closest first.
 */
export function getPeople(state: LifeState, content: ContentBundle): Record<PeopleGroupId, PersonRow[]> {
  const groups: Record<PeopleGroupId, PersonRow[]> = { family: [], children: [], romance: [], friends: [], work: [] };
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person) continue;
    const group = groupOf(rel.kind);
    if (group !== 'family' && rel.status === 'ended') continue;
    groups[group].push(personRow(state, person, rel, content));
  }
  const birthYear = (row: PersonRow) => state.people[row.id]!.birthYear;
  for (const group of PEOPLE_GROUPS) {
    groups[group].sort(
      (a, b) =>
        Number(b.alive) - Number(a.alive) ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (group === 'family' || group === 'children' ? birthYear(a) - birthYear(b) : b.affection - a.affection),
    );
  }
  return groups;
}

export interface MemoryView {
  year: number;
  age: number;
  text: string;
}

export interface PersonDetail {
  row: PersonRow;
  /** e.g. "she/her". */
  pronounLabel: string;
  /** Shared memories as readable lines, newest first. */
  memories: MemoryView[];
  /** Management actions available now (none for the dead). */
  actions: AvailableAction[];
  /** E1: you can interact with them now (the Interact button shows). */
  canInteract: boolean;
  /** E2a: set for your children and stepchildren. */
  child: ChildView | null;
}

/** A memory's readable text for this person (registries/memories.yaml). */
export function memoryText(tag: string, person: Person, content: ContentBundle): string {
  const template = content.registries.memories.tags[tag];
  if (template === undefined) return tag;
  return renderText(template, { roles: { npc: { name: person.name, pronouns: person.identity.pronouns } } });
}

/** One person's page: who they are to you, your shared memories and what you can do. Null for someone you don't know. */
export function getPersonDetail(state: LifeState, personId: Id, content: ContentBundle): PersonDetail | null {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person || !rel) return null;
  const memories = rel.memories
    .map((m) => ({ year: m.year, age: m.year - state.birthYear, text: memoryText(m.tag, person, content) }))
    .reverse();
  return {
    row: personRow(state, person, rel, content),
    pronounLabel: `${person.identity.pronouns.subject}/${person.identity.pronouns.object}`,
    memories,
    actions: availableActions(state, personId, content),
    canInteract: availableInteractions(state, personId, content).length > 0,
    child: getChildView(state, personId, content),
  };
}

/** Active cities for pickers, sorted by name. */
export function getCityOptions(content: ContentBundle): { id: string; name: string; blurb: string }[] {
  return Object.values(content.cities)
    .filter((c) => !c.retired)
    .map((c) => ({ id: c.id, name: c.name, blurb: c.blurb }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Active pronoun presets for pickers, most commonly used first (by creation weights). */
export function getPronounPresets(content: ContentBundle) {
  const usage = (id: string) =>
    Object.values(content.balance.creation.pronouns).reduce((sum, weights) => sum + (weights[id] ?? 0), 0);
  return Object.values(content.pronouns)
    .filter((p) => !p.retired)
    .sort((a, b) => usage(b.id) - usage(a.id) || (a.id < b.id ? -1 : 1));
}

/** History entries, newest first; `limit` keeps only the most recent. */
export function getHistoryFeed(state: LifeState, limit?: number): HistoryEntry[] {
  const newestFirst = [...state.history].reverse();
  return limit === undefined ? newestFirst : newestFirst.slice(0, limit);
}

/** History grouped by year, oldest first, for the Life history screen. */
export function getTimeline(history: readonly HistoryEntry[]): { year: number; age: number; entries: HistoryEntry[] }[] {
  const groups: { year: number; age: number; entries: HistoryEntry[] }[] = [];
  for (const entry of history) {
    const last = groups[groups.length - 1];
    if (last && last.year === entry.year) last.entries.push(entry);
    else groups.push({ year: entry.year, age: entry.age, entries: [entry] });
  }
  return groups;
}

export interface YearRecapView {
  year: number;
  age: number;
  /** Stats that changed, with their change (never zero). */
  statChanges: { stat: StatKey; change: number }[];
  /** This year's history entries. */
  entries: HistoryEntry[];
  /** Memories made this year, with the person and the memory's readable text. */
  memories: { name: string; text: string }[];
  /** People met this year. */
  newPeople: { name: string; kind: Relationship['kind'] }[];
  /** This year's money, when there was any to speak of. */
  money: { net: number; borrowed: number; savings: number; debt: number } | null;
}

/** The last finished year's recap, or null before the first age-up or mid-year. */
export function getYearRecap(state: LifeState, content: ContentBundle): YearRecapView | null {
  const recap = state.recap;
  if (!recap || !recap.statsAfter) return null;
  const after = recap.statsAfter;
  const statChanges = (Object.keys(after) as StatKey[])
    .map((stat) => ({ stat, change: after[stat] - recap.statsBefore[stat] }))
    .filter((c) => c.change !== 0);
  const memories: YearRecapView['memories'] = [];
  const newPeople: YearRecapView['newPeople'] = [];
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person) continue;
    const name = `${person.name.first} ${person.name.last}`;
    for (const m of rel.memories) {
      if (m.year === recap.year) memories.push({ name, text: memoryText(m.tag, person, content) });
    }
    if (rel.since === recap.year && rel.since !== state.birthYear) newPeople.push({ name, kind: rel.kind });
  }
  return {
    year: recap.year,
    age: recap.age,
    statChanges,
    entries: state.history.filter((e) => e.year === recap.year),
    memories,
    newPeople,
    money: recapMoney(state, recap.year),
  };
}

/** The recap's money line: the year's ledger, left out when nothing happened (early childhood). */
function recapMoney(state: LifeState, year: number): YearRecapView['money'] {
  const ledger = state.finances.lastLedger;
  const debt = totalDebt(state);
  const savings = state.finances.savings;
  if (!ledger || ledger.year !== year) return null;
  if (ledger.net === 0 && ledger.borrowed === 0 && savings === 0 && debt === 0) return null;
  return { net: ledger.net, borrowed: ledger.borrowed, savings, debt };
}

export interface DebtView {
  id: string;
  kind: DebtKind;
  balance: number;
  annualRate: number;
  minPayment: number;
  missed: number;
  /** A student loan whose payments are paused while you're in school. */
  paused: boolean;
  /** What paying it from savings now would pay: all of it, or as much as you have (0: can't pay now). */
  canPay: number;
}

export interface MoneyView {
  savings: number;
  debt: number;
  netWorth: number;
  /** Old enough to choose a lifestyle and manage debt. */
  independent: boolean;
  lifestyle: Lifestyle;
  /** Yearly living costs for each lifestyle, where you live now. */
  lifestyleCosts: Record<Lifestyle, number>;
  /** Last year's ledger, if one has run. */
  ledger: Ledger | null;
  debts: DebtView[];
  /** A debt plan is available now. */
  debtPlan: boolean;
  /** The lifestyle can change now: between years, and not from prison (Stage 9). */
  canChangeLifestyle: boolean;
  /** The retirement benefit: from what age, the years of earnings so far, and what the record pays now. */
  retirement: { age: number; years: number; minYears: number; yearlyBenefit: number; receiving: boolean };
  /** E2b: money an heir under 18 inherited, held until `releaseAge`. */
  trust: { balance: number; releaseAge: number } | null;
}

/** The Money tab: savings, debts, last year's ledger and the lifestyle choice. */
export function getMoneyView(state: LifeState, content: ContentBundle): MoneyView {
  const f = state.finances;
  const between = state.phase === 'yearStart';
  const lifestyleCosts = Object.fromEntries(LIFESTYLES.map((l) => [l, livingCost(state, content, l)])) as Record<Lifestyle, number>;
  return {
    savings: f.savings,
    debt: totalDebt(state),
    netWorth: netWorth(state),
    independent: isIndependent(state, content),
    lifestyle: f.lifestyle,
    lifestyleCosts,
    ledger: f.lastLedger ?? null,
    debts: f.debts.map((d) => ({
      id: d.id,
      kind: d.kind,
      balance: d.balance,
      annualRate: d.annualRate,
      minPayment: Math.min(d.minPayment, d.balance),
      missed: d.missed,
      paused: d.kind === 'student' && studentLoansPaused(state),
      canPay: between && isLifeActionAvailable(state, 'pay_debt', { debtId: d.id }, content) ? Math.min(f.savings, d.balance) : 0,
    })),
    debtPlan: between && canStartDebtPlan(state, content),
    canChangeLifestyle: between && state.housing.kind !== 'incarcerated',
    retirement: {
      age: content.balance.economy.retirement.age,
      years: f.earnings.years,
      minYears: content.balance.economy.retirement.minYears,
      yearlyBenefit: benefitFromRecord(state, content),
      receiving: state.character.age >= content.balance.economy.retirement.age && benefitFromRecord(state, content) > 0,
    },
    trust: f.trust ? { balance: f.trust.balance, releaseAge: f.trust.releaseAge } : null,
  };
}

/** Your job, for the Work tab's job card. */
export interface JobView {
  jobId: Id;
  /** The track's name ("Software engineering"). */
  trackName: string;
  category: JobCategory;
  /** Your title, as in a sentence ("junior developer"). */
  title: string;
  level: number;
  levels: number;
  /** The next title up, or null at the top. */
  nextTitle: string | null;
  employer: string;
  salary: number;
  /** 0–100, shown as a bar. */
  performance: number;
  /** Whole years since you were hired. */
  years: number;
  /** Your boss's full name, or null. */
  bossName: string | null;
  /** True once you've asked for a raise this year. */
  askedRaise: boolean;
  canAskRaise: boolean;
}

export interface WorkView {
  canGig: boolean;
  gigMinAge: number;
  gig: boolean;
  expectedGigPay: number;
  lastIncome: number;
  between: boolean;
  /** Your job, if you have one. */
  job: JobView | null;
  retired: boolean;
  canRetire: boolean;
  retireAge: number;
  /** Why you can't look for work now, or null. */
  searchBlock: SearchBlock | null;
  minAge: number;
  /** Openings you could apply for now. */
  openings: number;
  applicationsLeft: number;
}

export function getWorkView(state: LifeState, content: ContentBundle): WorkView {
  const c = state.career;
  const b = content.balance.careers;
  let job: JobView | null = null;
  if (c.job) {
    const def = content.jobs[c.job.jobId];
    const boss = currentBoss(state);
    const bossPerson = boss ? state.people[boss] : undefined;
    job = {
      jobId: c.job.jobId,
      trackName: def?.name ?? c.job.jobId,
      category: def?.category ?? 'gig',
      title: levelTitle(def, c.job.level),
      level: c.job.level,
      levels: def?.levels.length ?? c.job.level,
      nextTitle: def && c.job.level < def.levels.length ? levelTitle(def, c.job.level + 1) : null,
      employer: c.job.employer,
      salary: c.job.salary,
      performance: c.job.performance,
      years: Math.max(0, state.currentYear - c.job.since),
      bossName: bossPerson ? `${bossPerson.name.first} ${bossPerson.name.last}` : null,
      askedRaise: c.job.raiseYear === state.currentYear,
      canAskRaise: state.phase === 'yearStart' && isLifeActionAvailable(state, 'ask_raise', {}, content),
    };
  }
  return {
    canGig: canGig(state, content),
    gigMinAge: content.balance.economy.gig.minAge,
    gig: c.gig,
    expectedGigPay: wholeDollars(expectedGigPay(state, content) * (inPostSecondary(state) ? content.balance.education.studentGigShare : 1)),
    lastIncome: state.finances.lastLedger?.gross ?? 0,
    between: state.phase === 'yearStart',
    job,
    retired: c.retired,
    canRetire: canRetire(state, content) && state.housing.kind !== 'incarcerated',
    retireAge: b.retireAge,
    searchBlock: searchBlock(state, content),
    minAge: b.minAge,
    openings: getJobSearch(state, content).options.filter((o) => o.block === null).length,
    applicationsLeft: Math.max(0, b.maxApplications - c.applied.length),
  };
}

/** One opening in job search. */
export interface JobOption {
  jobId: Id;
  name: string;
  category: JobCategory;
  blurb: string;
  /** The title you'd start with, and its pay in your city. */
  title: string;
  level: number;
  levels: number;
  salary: number;
  /** Top level's pay in your city (where the track can lead). */
  topSalary: number;
  /** Your chance of being hired (0–1), shown in words. */
  chance: number;
  /** Why you can't apply now (applied already, no applications left), or null. */
  block: JobApplyBlock | null;
  /** This year's answer, if you applied. */
  result: boolean | null;
}

export interface JobSearch {
  /** Why you can't look for work now, or null. */
  block: SearchBlock | null;
  /** Openings in your city that you qualify for (never one you couldn't get), best pay first. */
  options: JobOption[];
  applicationsLeft: number;
  cityName: string;
}

/** Job search: the openings in your city this year that you qualify for. */
export function getJobSearch(state: LifeState, content: ContentBundle): JobSearch {
  const c = state.career;
  const block = searchBlock(state, content);
  const options: JobOption[] =
    block !== null
      ? []
      : c.openings.flatMap((jobId) => {
          const def = activeJob(content, jobId);
          if (!def || c.job?.jobId === jobId || !meetsJobRequirements(state, def, content)) return [];
          const level = startLevel(state, def);
          const applied = c.applied.find((a) => a.jobId === jobId);
          return [
            {
              jobId,
              name: def.name,
              category: def.category,
              blurb: def.blurb,
              title: levelTitle(def, level),
              level,
              levels: def.levels.length,
              salary: levelPay(state, def, level, content),
              topSalary: levelPay(state, def, def.levels.length, content),
              chance: hireChance(state, def, content),
              block: jobApplyBlock(state, jobId, content),
              result: applied ? applied.hired : null,
            },
          ];
        });
  options.sort((a, b) => b.salary - a.salary || (a.name < b.name ? -1 : 1));
  return {
    block,
    options,
    applicationsLeft: Math.max(0, content.balance.careers.maxApplications - c.applied.length),
    cityName: content.cities[state.character.cityId]?.name ?? state.character.cityId,
  };
}

/** One job in your career history (your current job first). */
export interface CareerRow {
  trackName: string;
  /** Your title when it ended (or now). */
  title: string;
  employer: string;
  fromYear: number;
  /** Null for your current job. */
  toYear: number | null;
  endedBy: JobEnd | null;
  salary: number;
}

/** Your career history, newest first, starting with the job you have now. */
export function getCareerHistory(state: LifeState, content: ContentBundle): CareerRow[] {
  const rows: CareerRow[] = state.career.history.map((h) => ({
    trackName: content.jobs[h.jobId]?.name ?? h.jobId,
    title: levelTitle(content.jobs[h.jobId], h.level),
    employer: h.employer,
    fromYear: h.fromYear,
    toYear: h.toYear,
    endedBy: h.endedBy,
    salary: h.salary,
  }));
  const job = state.career.job;
  if (job) {
    rows.push({
      trackName: content.jobs[job.jobId]?.name ?? job.jobId,
      title: levelTitle(content.jobs[job.jobId], job.level),
      employer: job.employer,
      fromYear: job.since,
      toYear: null,
      endedBy: null,
      salary: job.salary,
    });
  }
  return rows.reverse();
}

export interface CityMove {
  cityId: string;
  name: string;
  blurb: string;
  /** A year's rent there. */
  rent: number;
  /** Comfortable living costs there. */
  living: number;
  /** Moving there and the deposit. */
  moveInCost: number;
  /** You can afford the move now. */
  affordable: boolean;
}

export interface HomeView {
  kind: HousingKind;
  cityName: string;
  /** This year's cost of your home. */
  annualCost: number;
  roommate: boolean;
  /** The partner or spouse who lives with you, if any. */
  partnerName: string | null;
  homeValue: number | null;
  mortgage: number;
  independent: boolean;
  /** Renting where you live now: the up-front cost and whether you can afford it. Null when not an option. */
  rent: { rent: number; moveInCost: number; affordable: boolean } | null;
  /** The parent who would take you in, if moving home is an option. */
  moveHome: { name: string; cityName: string } | null;
  /** 'find' or 'leave' a roommate, when renting. */
  roommateAction: 'find' | 'leave' | null;
  /** Buying a home here. Null when not an option (you own one, or you're a child). */
  buy: (PurchaseQuote & { available: boolean }) | null;
  /** What selling would bring in after costs, before the mortgage. Null when you don't own. */
  sell: number | null;
  /** Other cities you could move to. Empty when relocating isn't an option. */
  cities: CityMove[];
  between: boolean;
}

/** More → Home: where you live, what it costs, and where you could go. */
export function getHomeView(state: LifeState, content: ContentBundle): HomeView {
  const h = state.housing;
  const between = state.phase === 'yearStart';
  const independent = isIndependent(state, content);
  const can = (id: Parameters<typeof isLifeActionAvailable>[1], params = {}) => between && isLifeActionAvailable(state, id, params, content);
  const here = content.cities[state.character.cityId];
  const renter = independent && (h.kind === 'with_parents' || h.kind === 'homeless');
  const parent = supportingParent(state);
  const mover = independent && (h.kind === 'with_parents' || h.kind === 'renting' || h.kind === 'homeless');
  const living = (cityId: string) => livingCost({ ...state, character: { ...state.character, cityId }, housing: { ...h, kind: 'renting' } }, content, 'comfortable');
  const cities: CityMove[] = mover
    ? getCityOptions(content)
        .filter((c) => c.id !== state.character.cityId)
        .map((c) => {
          const cost = moveInCost(state, c.id, content);
          return {
            cityId: c.id,
            name: c.name,
            blurb: c.blurb,
            rent: rentIn(content.cities[c.id]!, false, content),
            living: living(c.id),
            moveInCost: cost,
            affordable: can('relocate', { cityId: c.id }),
          };
        })
    : [];
  return {
    kind: h.kind,
    cityName: here?.name ?? state.character.cityId,
    annualCost: h.annualCost,
    roommate: h.roommate === true,
    partnerName: h.partnerId && state.people[h.partnerId] ? `${state.people[h.partnerId]!.name.first} ${state.people[h.partnerId]!.name.last}` : null,
    homeValue: h.homeValue ?? null,
    mortgage: mortgageBalance(state),
    independent,
    rent:
      renter && here
        ? { rent: rentIn(here, false, content), moveInCost: moveInCost(state, state.character.cityId, content), affordable: can('rent_home') }
        : null,
    moveHome:
      parent && can('move_home')
        ? { name: `${parent.name.first} ${parent.name.last}`, cityName: content.cities[parent.cityId]?.name ?? parent.cityId }
        : null,
    roommateAction: can('find_roommate') ? 'find' : can('live_alone') ? 'leave' : null,
    buy: independent && h.kind !== 'owned' && h.kind !== 'incarcerated' ? { ...purchaseQuote(state, content), available: can('buy_home') } : null,
    sell: h.kind === 'owned' ? saleProceeds(state, content) : null,
    cities,
    between,
  };
}

export interface EventCardView {
  instanceId: string;
  title: string;
  text: string;
  tone: Tone;
  /**
   * Choices the player can see now; an event without choices offers Continue.
   * With money known up front (C1; a fixed outcome, or a check whose outcomes
   * cost the same): money, the change to your savings (negative: a cost);
   * familyHelp, what your family covers of it; credit, the part of a cost
   * your savings can't cover, which becomes debt; rent, the change to your
   * yearly housing cost.
   */
  choices: ({ id: string; label: string } & ChoiceMoney)[];
  resolved: boolean;
  outcomeText: string | null;
  /** What the chosen outcome did to your money, with the new balance (C1). */
  money: MoneyChange | null;
}

export interface ChoiceMoney {
  money?: number;
  familyHelp?: number;
  credit?: number;
  rent?: number;
}

/** What an outcome will do to your money in this state (C1). */
function outcomeMoney(state: LifeState, outcome: Outcome | undefined, content: ContentBundle): Required<Omit<ChoiceMoney, 'credit'>> {
  const out = { money: 0, familyHelp: 0, rent: 0 };
  for (const e of outcome?.effects ?? []) {
    if (e.type === 'money') out.money += e.delta;
    else if (e.type === 'rentMonths') out.money += rentMonthsAmount(state, e.months);
    else if (e.type === 'cost') {
      out.money -= costToYou(state, e.item, content);
      out.familyHelp += familyHelp(state, e.item, content);
    } else if (e.type === 'housing' && e.action === 'rent_change') out.rent += rentChangeAmount(state, e.percent ?? 0, content);
  }
  return out;
}

/** What a choice will do to your money, when that is known before choosing (C1); empty otherwise or when nothing. */
export function knownChoiceMoney(state: LifeState, choice: ChoiceDef, content: ContentBundle): ChoiceMoney {
  let known: Required<Omit<ChoiceMoney, 'credit'>>;
  if (choice.outcome) known = outcomeMoney(state, choice.outcome, content);
  else if (choice.check) {
    known = outcomeMoney(state, choice.check.success, content);
    const failure = outcomeMoney(state, choice.check.failure, content);
    if (known.money !== failure.money || known.familyHelp !== failure.familyHelp || known.rent !== failure.rent) return {};
  } else return {};
  // Past the independence age, what savings can't cover becomes debt (spend); a child's family pays it.
  const credit = isIndependent(state, content) ? Math.max(0, -known.money - state.finances.savings) : 0;
  return {
    ...(known.money !== 0 ? { money: known.money } : {}),
    ...(known.familyHelp !== 0 ? { familyHelp: known.familyHelp } : {}),
    ...(credit > 0 ? { credit } : {}),
    ...(known.rent !== 0 ? { rent: known.rent } : {}),
  };
}

/** One pending event as a card, with its text rendered for the cast. Null past the end. */
export function getEventCard(state: LifeState, index: number, content: ContentBundle): EventCardView | null {
  const instance = state.pending[index];
  if (!instance) return null;
  const def = content.events[instance.eventId];
  const base = {
    instanceId: instance.instanceId,
    resolved: instance.resolvedChoiceId !== undefined,
    outcomeText: instance.outcomeText ?? null,
    money: instance.money ?? null,
  };
  // A definition removed by a content update: a card the player can dismiss.
  if (!def) return { ...base, title: '…', text: '', tone: 'neutral', choices: [{ id: CONTINUE_CHOICE, label: 'Continue' }] };
  const ctx = textContext(state, instance.cast, content, instance.since);
  const choices = def.choices
    ? def.choices
        .filter((c) => evaluate(c.visibleIf, state, { cast: instance.cast, roles: 'strict', content }))
        .map((c) => ({ id: c.id, label: renderText(c.label, ctx), ...knownChoiceMoney(state, c, content) }))
    : [{ id: CONTINUE_CHOICE, label: 'Continue' }];
  return { ...base, title: renderText(def.title, ctx), text: renderText(def.text, ctx), tone: def.tone, choices };
}

/** Index of the first pending event still waiting for the player, or null. */
export function firstUnresolvedEvent(state: LifeState): number | null {
  const i = state.pending.findIndex((p) => p.resolvedChoiceId === undefined);
  return i < 0 ? null : i;
}

/** True when the player can age up right now. */
export function canAgeUp(state: LifeState): boolean {
  return state.phase === 'yearStart';
}

/** One health condition on More → Health (Stage 9). */
export interface ConditionView {
  id: string;
  name: string;
  blurb: string;
  kind: ConditionKind;
  /** 1–100, shown as a bar. */
  severity: number;
  treated: boolean;
  treatable: boolean;
  since: number;
}

/** Why you can't see a doctor now, or null when you can. */
export type DoctorBlock = 'visited' | 'prison' | 'busy';

export interface HealthView {
  conditions: ConditionView[];
  /** A visit now: what it costs (the visit, plus treating what can be treated) and whether you can go. */
  doctor: { visitCost: number; treatmentCost: number; block: DoctorBlock | null };
  /** Your family pays for your visits while you're a child. */
  familyPays: boolean;
  /** Medical debt you owe. */
  medicalDebt: number;
}

/** More → Health: your conditions, worst first, and seeing a doctor. */
export function getHealthView(state: LifeState, content: ContentBundle): HealthView {
  const conditions = state.health.conditions
    .flatMap((c): ConditionView[] => {
      const def = content.conditions[c.conditionId];
      if (!def) return [];
      return [{ id: def.id, name: def.name, blurb: def.blurb, kind: def.kind, severity: c.severity, treated: c.treated, treatable: def.treatable, since: c.since }];
    })
    .sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name));
  const quote = doctorQuote(state, content);
  const block: DoctorBlock | null =
    state.housing.kind === 'incarcerated'
      ? 'prison'
      : state.health.lastVisit === state.currentYear
        ? 'visited'
        : !isLifeActionAvailable(state, 'see_doctor', {}, content)
          ? 'busy'
          : null;
  return {
    conditions,
    doctor: { visitCost: quote.visit, treatmentCost: quote.treatment, block },
    familyPays: !isIndependent(state, content),
    medicalDebt: wholeDollars(state.finances.debts.filter((d) => d.kind === 'medical').reduce((sum, d) => sum + d.balance, 0)),
  };
}

/** Prison or probation, for the status banner (Stage 9). Null when neither. */
export type LegalStatus =
  /** Released as the year after `lastYear` begins: `yearsLeft` more age-ups. */
  | { kind: 'prison'; lastYear: number; yearsLeft: number }
  /** On probation through `lastYear`. */
  | { kind: 'probation'; lastYear: number; yearsLeft: number };

export function getLegalStatus(state: LifeState): LegalStatus | null {
  const l = state.legal;
  if (state.housing.kind === 'incarcerated' && l.incarceratedUntil !== undefined) {
    return { kind: 'prison', lastYear: l.incarceratedUntil, yearsLeft: l.incarceratedUntil + 1 - state.currentYear };
  }
  if (l.probationUntil !== undefined && l.probationUntil >= state.currentYear) {
    return { kind: 'probation', lastYear: l.probationUntil, yearsLeft: l.probationUntil + 1 - state.currentYear };
  }
  return null;
}

/** One entry on your criminal record (Stage 9). */
export interface RecordRow {
  offense: string;
  year: number;
  age: number;
  outcome: RecordOutcome;
  amount?: number;
  years?: number;
}

/** The Profile sheet (Stage 9): who you are, your personality, your record, and whether you can edit now. */
export interface ProfileView {
  fullName: string;
  identity: Identity;
  personality: Personality;
  record: RecordRow[];
  /** Edits happen between years. */
  canEdit: boolean;
}

export function getProfileView(state: LifeState, content: ContentBundle): ProfileView {
  const c = state.character;
  return {
    fullName: `${c.name.first} ${c.name.last}`,
    identity: c.identity,
    personality: c.personality,
    record: [...state.legal.record].reverse().map((r) => ({
      offense: content.offenses[r.offenseId]?.name ?? r.offenseId,
      year: r.year,
      age: r.year - state.birthYear,
      outcome: r.outcome,
      ...(r.amount !== undefined ? { amount: r.amount } : {}),
      ...(r.years !== undefined ? { years: r.years } : {}),
    })),
    canEdit: state.phase === 'yearStart',
  };
}

/**
 * A short plain-text report on one event card (C1, development only: the
 * "Report a problem" button): the event, the choice made, who was cast and
 * where they are, and the state the consistency rules depend on.
 */
export function problemReport(state: LifeState, index: number, content: ContentBundle): string {
  const instance = state.pending[index];
  const c = state.character;
  const job = state.career.job;
  const school = state.education.current;
  const lines = [
    `event: ${instance?.eventId ?? 'none'} (${instance?.instanceId ?? '-'})`,
    `choice: ${instance?.resolvedChoiceId ?? 'not chosen yet'}`,
    ...Object.entries(instance?.cast ?? {}).map(([role, id]) => {
      const person = state.people[id];
      const rel = state.relationships[id];
      return `cast ${role}: ${id} ${rel?.kind ?? 'unknown'}, age ${person ? state.currentYear - person.birthYear : '?'}, ${whereabouts(state, id, content)}${person?.alive === false ? ', dead' : ''}`;
    }),
    `life: seed ${state.seed}, year ${state.currentYear}, age ${c.age}, ${c.lifeStage}, phase ${state.phase}`,
    `home: ${state.housing.kind} in ${c.cityId}${state.housing.partnerId ? `, with partner ${state.housing.partnerId}` : ''}`,
    `romance: ${romanceStatus(state)}`,
    `work: ${job ? `${job.jobId} level ${job.level}` : 'no job'}${state.career.retired ? ', retired' : ''}`,
    `school: ${school ? `${school.program} year ${school.year}` : 'not enrolled'}`,
    `money: savings ${state.finances.savings}, debt ${totalDebt(state)}`,
    `content: ${content.contentVersion}`,
  ];
  if (instance && content.events[instance.eventId]) {
    const problems = consistencyProblems(state, content.events[instance.eventId]!, instance.cast, content);
    if (problems.length > 0) lines.push(`consistency: ${problems.join('; ')}`);
  }
  return lines.join('\n');
}
