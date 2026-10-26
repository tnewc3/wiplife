/** Player-facing words for engine values. UI copy only; no game rules here. */
import type {
  ActionId,
  ConditionKind,
  DebtKind,
  GiftTier,
  HousingKind,
  InteractionGroup,
  JobCategory,
  Lifestyle,
  MentalCareId,
  OutcomeTier,
  Program,
  RomanceStatus,
  SchoolWords,
  Tier,
  TieKindId,
  TieStatusId,
} from '../content/schemas';
import type { PastimeCategory, PastimeQuality, PastimeRoute, PastimeStake, PetPersonalityId, TeenFocusId } from '../content/schemas';
import type { EditRefusal, RefusalCode } from '../engine/godmode';
import type { PastimeBlock } from '../engine/pastimes/query';
import type { PastimeReceipt } from '../engine/types';
import type { ActivityBlock } from '../engine/teen/activities';
import type { JoinBlock } from '../engine/teen/cliques';
import type { FocusBlock } from '../engine/teen/focus';
import type { JobBlock } from '../engine/teen/jobs';
import type { LicenseBlock } from '../engine/teen/license';
import type { NegotiateBlock } from '../engine/teen/rules';
import type { JobApplyBlock, SearchBlock } from '../engine/career';
import type { PetBlock } from '../engine/possessions/pets';
import type { RenovationBlock, VacationBlock } from '../engine/possessions/homes';
import type { LoanBlock, VehicleBlock } from '../engine/possessions/vehicles';
import type { ApplyBlock } from '../engine/education';
import type { PersonLifeView, TroubleView } from '../engine/lives/views';
import type {
  ConnectionView,
  CredentialView,
  DoctorBlock,
  FamilyMember,
  HeardView,
  LegalStatus,
  MoodBand,
  MoodView,
  PeopleGroupId,
  PersonRow,
  RecordRow,
  SchoolLine,
} from '../engine/selectors';
import type { StyleLevel } from '../engine/family/parenting';
import type { CareOption, FamilyWealth, GenderCategory, HospiceChoice, JobEnd, LifeStage, Personality, Reaction, RecordOutcome, RelationshipKind, ServiceStyle, Stats } from '../engine/types';
import { formatMoney } from '../engine/country';
import { getMoneyDisplay } from '../store/moneyDisplay';

export const STAT_LABELS: Record<keyof Stats, string> = {
  health: 'Health',
  happiness: 'Happiness',
  smarts: 'Smarts',
  looks: 'Looks',
  fitness: 'Fitness',
  stress: 'Stress',
};

export const TRAIT_LABELS: Record<keyof Personality, string> = {
  ambition: 'Ambition',
  confidence: 'Confidence',
  kindness: 'Kindness',
  riskTaking: 'Risk-taking',
  discipline: 'Discipline',
  sociability: 'Sociability',
};

export const WEALTH_LABELS: Record<FamilyWealth, string> = {
  poor: 'Poor',
  working: 'Working class',
  middle: 'Middle class',
  affluent: 'Affluent',
  rich: 'Rich',
};

export const ATTRACTION_LABELS: Record<GenderCategory, string> = {
  man: 'Men',
  woman: 'Women',
  nonbinary: 'Nonbinary people',
};

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  early: 'Early childhood',
  child: 'Childhood',
  teen: 'Teen years',
  youngAdult: 'Young adult',
  adult: 'Adult',
  senior: 'Senior',
};

const same = (word: string): Record<GenderCategory, string> => ({ woman: word, man: word, nonbinary: word });

const RELATIONSHIP_LABELS: Record<RelationshipKind, Record<GenderCategory, string>> = {
  parent: { woman: 'Mother', man: 'Father', nonbinary: 'Parent' },
  stepparent: { woman: 'Stepmother', man: 'Stepfather', nonbinary: 'Stepparent' },
  grandparent: { woman: 'Grandmother', man: 'Grandfather', nonbinary: 'Grandparent' },
  relative: { woman: 'Aunt', man: 'Uncle', nonbinary: 'Relative' },
  sibling: { woman: 'Sister', man: 'Brother', nonbinary: 'Sibling' },
  child: { woman: 'Daughter', man: 'Son', nonbinary: 'Child' },
  stepchild: { woman: 'Stepdaughter', man: 'Stepson', nonbinary: 'Stepchild' },
  grandchild: { woman: 'Granddaughter', man: 'Grandson', nonbinary: 'Grandchild' },
  partner: { woman: 'Girlfriend', man: 'Boyfriend', nonbinary: 'Partner' },
  fiance: { woman: 'Fiancée', man: 'Fiancé', nonbinary: 'Fiancé' },
  spouse: { woman: 'Wife', man: 'Husband', nonbinary: 'Spouse' },
  ex: same('Ex'),
  friend: same('Friend'),
  coworker: same('Coworker'),
  boss: same('Boss'),
  classmate: same('Classmate'),
  teacher: same('Teacher'),
  acquaintance: same('Acquaintance'),
};

/** "Mother", "Wife", "Friend"... An ex you were married to is an "Ex-spouse". */
export function relationshipLabel(kind: RelationshipKind, category: GenderCategory, wasSpouse = false): string {
  if (kind === 'ex' && wasSpouse) return 'Ex-spouse';
  return RELATIONSHIP_LABELS[kind][category];
}

export function relativeLabel(member: FamilyMember): string {
  return relationshipLabel(member.relationship.kind, member.person.identity.genderCategory);
}

/** A person's line on the People screen: "Wife · 34 years old", "Friend · Died at 70 · Estranged". */
export function personLine(row: PersonRow): string {
  const parts = [relationshipLabel(row.kind, row.genderCategory, row.wasSpouse), row.alive ? ageLabel(row.age) : `Died at ${row.age}`];
  if (row.status === 'estranged') parts.push('Estranged');
  if (row.status === 'ended') parts.push('Lost touch');
  return parts.join(' · ');
}

export const PEOPLE_GROUP_LABELS: Record<PeopleGroupId, string> = {
  family: 'Family',
  children: 'Children',
  grandchildren: 'Grandchildren',
  romance: 'Love',
  friends: 'Friends',
  school: 'School',
  work: 'Work',
};

/** Shown when a group has nobody in it. */
export const PEOPLE_GROUP_EMPTY: Record<PeopleGroupId, string> = {
  family: 'No family.',
  children: 'No children.',
  grandchildren: 'No grandchildren.',
  romance: 'No one right now.',
  friends: 'No friends yet.',
  school: 'No one from school.',
  work: 'No one from work yet.',
};

export const BOND_LABELS = { affection: 'Affection', trust: 'Trust' } as const;

/** The Home screen's romance line, or null when single. */
export function romanceLine(status: RomanceStatus, partnerName: string | null): string | null {
  if (!partnerName || status === 'single') return null;
  return { dating: `Dating ${partnerName}`, engaged: `Engaged to ${partnerName}`, married: `Married to ${partnerName}` }[status];
}

export const ACTION_LABELS: Record<ActionId, string> = {
  ask_out: 'Ask out',
  propose: 'Propose',
  move_in: 'Move in together',
  marry: 'Get married',
  break_up: 'Break up',
  divorce: 'Divorce',
  cut_contact: 'Cut contact',
  reconcile: 'Try to reconcile',
  try_for_baby: 'Try for a baby',
};

/** Copy for the confirmation sheet of an action that can't be undone. */
export function actionConfirmation(actionId: ActionId, firstName: string): { title: string; body: string; confirm: string } {
  switch (actionId) {
    case 'break_up':
      return { title: `Break up with ${firstName}?`, body: 'You’ll be exes. This can’t be undone.', confirm: 'Break up' };
    case 'divorce':
      return { title: `Divorce ${firstName}?`, body: 'Your marriage will end. This can’t be undone.', confirm: 'Divorce' };
    case 'cut_contact':
      return {
        title: `Cut ${firstName} out of your life?`,
        body: 'You’ll stop speaking. You can try to reconcile later, but it may not work.',
        confirm: 'Cut contact',
      };
    default:
      return { title: `${ACTION_LABELS[actionId]}?`, body: '', confirm: ACTION_LABELS[actionId] };
  }
}

export function ageLabel(age: number): string {
  if (age <= 0) return 'Newborn';
  return age === 1 ? '1 year old' : `${age} years old`;
}

/** A relative's age line: their age, or the age they died at. */
export function memberAgeLabel(member: FamilyMember): string {
  return member.person.alive ? ageLabel(member.age) : `Died at ${member.age}`;
}

/** "Age 34" for timelines; "Birth" at 0. */
export function timelineAgeLabel(age: number): string {
  return age <= 0 ? 'Birth' : `Age ${age}`;
}

/** A stat change in words, never as a number (docs/design.md, section K). */
export function statChangeLabel(change: number): string {
  const size = Math.abs(change);
  const amount = size <= 2 ? ' a little' : size >= 10 ? ' a lot' : '';
  return `${change > 0 ? 'went up' : 'went down'}${amount}`;
}

/** "1990–2072" */
export function lifespanLabel(birthYear: number, endYear: number): string {
  return `${birthYear}–${endYear}`;
}

/** An amount in the base currency as the player reads it, in the currency of the country they live in: "$12,300", "−£500" (W4a). */
export function money(amount: number): string {
  return formatMoney(amount, getMoneyDisplay());
}

/** A change in money: "+$1,200" or "−$500". */
export function moneyChange(amount: number): string {
  return amount > 0 ? `+${money(amount)}` : money(amount);
}

/**
 * What a choice will do to your money, on its button (C1): "Costs $500",
 * "Pays $200", "Costs $9,000 after $3,000 from family", "$6,000 on credit",
 * "Rent +$1,100 a year".
 */
export function choiceMoneyLabel(m: { money?: number; familyHelp?: number; credit?: number; rent?: number }): string {
  const parts: string[] = [];
  if (m.money !== undefined) {
    const main = m.money < 0 ? `Costs ${money(-m.money)}` : `Pays ${money(m.money)}`;
    parts.push(m.familyHelp ? `${main} after ${money(m.familyHelp)} from family` : main);
  } else if (m.familyHelp) parts.push(`Family covers ${money(m.familyHelp)}`);
  if (m.credit) parts.push(`${money(m.credit)} on credit`);
  if (m.rent !== undefined) parts.push(`Rent ${moneyChange(m.rent)} a year`);
  return parts.join(' · ');
}

/** An outcome's money change with the new balance (C1): "−$500 · Savings now $1,200". */
export function outcomeMoneyLabel(change: number, balance: number): string {
  return `${moneyChange(change)} · Savings now ${money(balance)}`;
}

/** Debt an outcome took on or paid off (C1): "+$3,000 debt" or "−$3,000 debt". */
export function outcomeDebtLabel(change: number): string {
  return `${moneyChange(change)} debt`;
}

/** What your family paid toward a cost (C1). */
export function familyHelpLabel(amount: number): string {
  return `Your family chipped in ${money(amount)}`;
}

/** A change to your yearly housing cost (C1): "Housing +$1,100 a year · now $14,900". */
export function housingChangeLabel(change: number, annual: number): string {
  return `Housing ${moneyChange(change)} a year · now ${money(annual)}`;
}

/** An interest rate: 0.065 → "6.5%". */
export function rateLabel(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

export const HOUSING_LABELS: Record<HousingKind, string> = {
  with_parents: 'Living with family',
  renting: 'Renting',
  owned: 'Homeowner',
  homeless: 'Without a home',
  incarcerated: 'In prison',
};

/** "Renting in Chicago", "Living with family in Houston". */
export function housingLine(kind: HousingKind, cityName: string): string {
  return `${HOUSING_LABELS[kind]} in ${cityName}`;
}

export const DEBT_LABELS: Record<DebtKind, string> = {
  student: 'Student loan',
  personal: 'Personal loan',
  mortgage: 'Mortgage',
  medical: 'Medical bills',
  collections: 'In collections',
  business: 'Business loan',
  auto: 'Car loan',
  bank: 'Bank loan',
  payday: 'Payday loan',
  shark: 'Loan from a shark',
};

/** How a debt is going: on track, paused while you study, missed payments, or in collections. */
export function debtStatus(kind: DebtKind, missed: number, paused = false): string {
  if (paused) return 'Payments paused while you’re in school';
  if (missed === 0) return kind === 'collections' ? 'With a collections agency' : 'On track';
  const missedText = missed === 1 ? '1 missed payment' : `${missed} missed payments in a row`;
  return kind === 'collections' ? `With a collections agency · ${missedText}` : missedText;
}

export const LIFESTYLE_LABELS: Record<Lifestyle, string> = {
  frugal: 'Frugal',
  comfortable: 'Comfortable',
  lavish: 'Lavish',
};

export const LIFESTYLE_BLURBS: Record<Lifestyle, string> = {
  frugal: 'Less stress about money, but life feels smaller',
  comfortable: 'A normal life',
  lavish: 'Costly, and a lot of fun',
};

/** The ledger's lines, in order, for the Money tab. */
export const LEDGER_LABELS = {
  gross: 'Income',
  retirement: 'Retirement benefit',
  tax: 'Taxes',
  housing: 'Housing',
  living: 'Living costs',
  children: 'Your children',
  care: 'Care for a relative',
  upkeep: 'Upkeep: pets, vehicles, vacation homes',
  insurance: 'Insurance',
  giving: 'Dues and donations to your groups',
  remittances: 'Money sent to relatives abroad',
  business: 'Put into your businesses to cover a loss',
  supportPaid: 'Child support you paid',
  supportReceived: 'Child support you received',
  debtPayments: 'Debt payments',
  interest: 'Interest earned',
  net: 'Left over',
  borrowed: 'Borrowed to cover costs',
  support: 'Your family covered',
  debtInterest: 'Interest added to debts',
} as const;

/** The year recap's money line. */
export function recapMoneyLine(m: { net: number; borrowed: number; savings: number; debt: number }): string {
  const parts = [`Money: ${moneyChange(m.net)} this year`, `savings ${money(m.savings)}`];
  if (m.debt > 0) parts.push(`debt ${money(m.debt)}`);
  if (m.borrowed > 0) parts.push(`borrowed ${money(m.borrowed)}`);
  return `${parts.join(' · ')}.`;
}

/** Copy for the confirmation sheet of a move or home purchase. */
export function homeConfirmation(
  action: 'rent_home' | 'move_home' | 'relocate' | 'buy_home' | 'sell_home',
  details: { city?: string; cost?: number; name?: string; price?: number; down?: number; payment?: number; proceeds?: number },
): { title: string; body: string; confirm: string } {
  switch (action) {
    case 'rent_home':
      return {
        title: `Rent a place in ${details.city}?`,
        body: `Moving and a deposit cost ${money(details.cost ?? 0)} now. Rent is paid each year from then on.`,
        confirm: 'Rent a place',
      };
    case 'move_home':
      return {
        title: `Move in with ${details.name}?`,
        body: `You’ll live with your family in ${details.city}. They’ll help cover your costs.`,
        confirm: 'Move back home',
      };
    case 'relocate':
      return {
        title: `Move to ${details.city}?`,
        body: `Moving and a deposit cost ${money(details.cost ?? 0)} now. You’ll rent there, and your costs change from next year.`,
        confirm: `Move to ${details.city}`,
      };
    case 'buy_home':
      return {
        title: `Buy a home in ${details.city}?`,
        body:
          `The price is ${money(details.price ?? 0)}. You’ll put down ${money(details.down ?? 0)} plus closing costs` +
          ((details.payment ?? 0) > 0 ? `, and pay ${money(details.payment ?? 0)} a year on the mortgage.` : ', and own it outright.'),
        confirm: 'Buy it',
      };
    case 'sell_home':
      return {
        title: 'Sell your home?',
        body: `After selling costs it brings in about ${money(details.proceeds ?? 0)}, which pays off the mortgage first. You’ll rent in ${details.city}.`,
        confirm: 'Sell',
      };
  }
}

/** Why you can't buy a home yet. */
export const PURCHASE_BLOCK_LABELS = {
  savings: 'You need more saved for the down payment and closing costs.',
  income: 'A bank won’t lend you that much on your income.',
  status: 'A bank won’t lend to someone without papers.',
  bankruptcy: 'No bank will give you a mortgage so soon after a bankruptcy.',
} as const;

/** A college tier, as your country calls it (W4a: "Community college", "Further education college"). */
export function tierLabel(tier: Tier, words: SchoolWords): string {
  return words.tiers[tier];
}

/** A program, as your country calls it. */
export function programLabel(program: Program, words: SchoolWords): string {
  switch (program) {
    case 'elementary':
      return capitalized(words.elementary);
    case 'middle':
      return capitalized(words.middle);
    case 'high':
      return capitalized(words.high);
    case 'college':
      return capitalized(words.college);
    case 'trade':
      return 'Trade school';
    case 'grad':
      return 'Grad school';
  }
}

/** The name of a school year of the automatic school: "3rd grade", "Year 4", "Primary, year 2". */
export function gradeLevelLabel(level: number, words: SchoolWords): string {
  return words.gradeLabels[Math.max(0, level)] ?? `Year ${level + 1}`;
}

/** "Year 2 of 4". */
export function programYearLabel(year: number, lengthYears: number): string {
  return `Year ${year} of ${lengthYears}`;
}

/** Where you are in school, for the Life tab: "In 10th grade", "Studying Nursing at Prairie State University". */
export function schoolStatusLine(school: SchoolLine): string {
  // A one-word stage ("Kindergarten", "Reception", "Senior year") reads in lower case inside the sentence; "Year 4" and "10th grade" stay.
  if (school.gradeLevel !== null) return school.gradeLabel !== null ? `In ${/^[A-Z][a-z]+( year)?$/.test(school.gradeLabel) ? school.gradeLabel.toLowerCase() : school.gradeLabel}` : 'In school';
  if (school.program === 'trade') return `Training as ${articled(school.studying ?? 'a tradesperson')} at ${school.schoolName}`;
  if (school.program === 'grad') return `In ${(school.studying ?? 'grad school').toLowerCase()} at ${school.schoolName}`;
  return `Studying ${school.studying ?? ''} at ${school.schoolName}`;
}

function articled(noun: string): string {
  return `${/^[AEIOU]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** Sentence text as a label: "a law degree" → "Law degree". */
function asLabel(text: string): string {
  const bare = text.replace(/^(a|an) /i, '');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** "Bachelor’s degree in nursing", "Electrician's license", "Law degree" (W4a: in the words of your country). */
export function credentialLabel(c: CredentialView, words: SchoolWords): string {
  if ((c.type === 'associate' || c.type === 'bachelor') && c.field) return `${words.credentials[c.type]} in ${c.field}`;
  if ((c.type === 'trade_license' || c.type === 'grad') && c.field) return asLabel(c.field);
  return words.credentials[c.type];
}

/** Your odds of getting in, in words (never an exact percentage). */
export function oddsLabel(chance: number): string {
  if (chance >= 0.9) return 'Almost certain';
  if (chance >= 0.65) return 'Likely';
  if (chance >= 0.4) return 'A fair chance';
  if (chance >= 0.15) return 'A long shot';
  return 'A reach';
}

/** Why you can't apply somewhere now. */
export function applyBlockLabel(block: ApplyBlock, words: SchoolWords): string {
  switch (block) {
    case 'age':
      return `You can apply in your last year of ${words.high}.`;
    case 'enrolled':
      return 'You can apply when you’re in your last year, or out of school.';
    case 'highSchool':
      return `Needs your ${words.credentials.hs_diploma} or ${words.credentials.ged}.`;
    case 'preUniversity':
      return `Needs your ${words.credentials.associate} first.`;
    case 'bachelor':
      return `Needs a ${words.credentials.bachelor.toLowerCase()}.`;
    case 'major':
      return `Needs a ${words.credentials.bachelor.toLowerCase()} in a related major.`;
    case 'tried':
      return 'You already applied this year.';
    case 'holding':
      return 'You already have a place here.';
    case 'unknown':
      return 'Not available.';
  }
}

/** How hard a major, trade or grad program is (1–5). */
export function difficultyLabel(difficulty: number): string {
  return ['Easygoing', 'Manageable', 'Challenging', 'Demanding', 'Grueling'][Math.min(4, Math.max(0, difficulty - 1))]!;
}

/** Sentence text as a label: "junior developer" → "Junior developer". */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Job categories in job search. */
export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  professional: 'Professional',
  trade: 'Trades',
  gig: 'Service jobs',
};

/** How a job ended, for career history. */
export const JOB_END_LABELS: Record<JobEnd, string> = {
  quit: 'You quit',
  fired: 'Fired',
  laid_off: 'Laid off',
  retired: 'Retired',
  moved: 'Moved away',
  jailed: 'Went to prison',
};

/** Why you can't look for work now. */
export const SEARCH_BLOCK_LABELS: Record<SearchBlock, string> = {
  age: 'You’re too young for a full-time job.',
  school: 'You can line up a job in your last year of school. Until then, gig work fits around classes.',
  away: 'You can’t work while you’re in prison.',
  status: 'Without papers you can’t take a regular job. Informal work is still possible.',
};

/** Why you can't apply for an opening now. */
export const JOB_APPLY_BLOCK_LABELS: Record<JobApplyBlock, string> = {
  ...SEARCH_BLOCK_LABELS,
  unknown: 'Not available.',
  closed: 'Not hiring this year.',
  current: 'That’s your job.',
  requirements: 'You don’t meet the requirements.',
  vehicle: 'You’d need a car to get to this job.',
  tried: 'You applied this year.',
  limit: 'No applications left this year.',
};

/** How your work is going, in words (never a number). */
export function performanceLabel(performance: number): string {
  if (performance >= 80) return 'Outstanding';
  if (performance >= 65) return 'Doing well';
  if (performance >= 45) return 'Steady';
  if (performance >= 30) return 'Slipping';
  return 'On thin ice';
}

/** "Junior developer at Brightline Systems". */
export function jobLine(title: string, employer: string): string {
  return `${capitalized(title)} at ${employer}`;
}

/** "3 years", "1 year", "New". */
export function yearsLabel(years: number): string {
  if (years <= 0) return 'Just started';
  return years === 1 ? '1 year' : `${years} years`;
}

/** Copy for the confirmation sheet of a work action that can't be undone. */
export function workConfirmation(action: 'quit_job' | 'retire', details: { employer?: string; retirementAge: number; age: number }): {
  title: string;
  body: string;
  confirm: string;
} {
  if (action === 'quit_job') {
    return {
      title: `Quit your job at ${details.employer}?`,
      body: 'You’ll stop getting paid from next year. You can look for another job, or do gig work.',
      confirm: 'Quit',
    };
  }
  const early = details.age < details.retirementAge;
  return {
    title: 'Retire?',
    body:
      (details.employer ? `You’ll leave ${details.employer} and stop working. ` : 'You’ll stop working. ') +
      (early ? `Your retirement benefit starts at ${details.retirementAge}, so until then you’ll live on your savings.` : 'Your retirement benefit keeps paying every year.') +
      ' You can always go back to work.',
    confirm: 'Retire',
  };
}

/** How bad a condition is, in words (Stage 9). */
export function severityLabel(severity: number): string {
  if (severity < 34) return 'Mild';
  if (severity < 67) return 'Moderate';
  return 'Severe';
}

export const CONDITION_KIND_LABELS: Record<ConditionKind, string> = {
  illness: 'Illness',
  chronic: 'Chronic condition',
  injury: 'Injury',
  mental: 'Mental health',
  neuro: 'Neurodivergence',
  addiction: 'Addiction',
};

/** A condition's treatment status (Stage 9). */
export function treatmentLabel(treated: boolean, treatable: boolean): string {
  if (treated) return 'Being treated';
  return treatable ? 'Not treated' : 'No cure; a doctor can ease it';
}

/** M1: the ways of caring for a mental health condition, with what each one asks of you. */
export const MENTAL_CARE_LABELS: Record<MentalCareId, { name: string; tradeoff: string }> = {
  therapy: { name: 'Therapy', tradeoff: 'Costs money every year and time out of your week.' },
  medication: { name: 'Medication', tradeoff: 'Costs money every year, and can bring side effects.' },
  support: { name: 'Leaning on people', tradeoff: 'Costs no money. It depends on who you have, and it can wear on them.' },
};

/** M1: why a way of caring isn't available. */
export const MENTAL_CARE_BLOCK_LABELS = {
  unsuitable: 'Not for this one.',
  alone: 'There is nobody you trust enough to lean on yet.',
} as const;

/** M1: how someone who noticed you struggling took it. */
export const REACTION_LABELS: Record<Reaction, string> = {
  supportive: 'Was there for you',
  neutral: 'Wasn’t sure what to say',
  dismissive: 'Brushed it off',
};

/** M1: why you can't see a therapist now. */
export const THERAPIST_BLOCK_LABELS = {
  visited: 'You saw a therapist this year. You can go again next year.',
  young: 'A parent or guardian arranges this at your age.',
  prison: 'In prison, the prison’s own counselors are the only ones you can see.',
  busy: 'Finish what’s in front of you first.',
} as const;

export const DOCTOR_BLOCK_LABELS: Record<DoctorBlock, string> = {
  visited: 'You saw a doctor this year. You can go again next year.',
  prison: 'In prison, the prison doctor is the only one you can see.',
  busy: 'Finish what’s in front of you first.',
};

export const RECORD_OUTCOME_LABELS: Record<RecordOutcome, string> = {
  warning: 'Warning',
  fine: 'Fine',
  probation: 'Probation',
  jail: 'Prison',
};

/** One line of the criminal record ("Shoplifting · Fine of $400 · 2041, age 15"). */
export function recordLine(row: RecordRow): string {
  const what =
    row.outcome === 'fine' && row.amount !== undefined
      ? `Fine of ${money(row.amount)}`
      : (row.outcome === 'probation' || row.outcome === 'jail') && row.years !== undefined
        ? `${RECORD_OUTCOME_LABELS[row.outcome]}, ${yearsLabel(row.years)}`
        : RECORD_OUTCOME_LABELS[row.outcome];
  return `${capitalized(row.offense)} · ${what} · ${row.year}, age ${row.age}`;
}

/** The status banner for prison or probation (Stage 9). */
export function legalBanner(status: LegalStatus): { title: string; body: string } {
  if (status.kind === 'prison') {
    return {
      title: 'In prison',
      body:
        status.yearsLeft <= 1
          ? 'You’re released next year. Until then, only a few things are up to you.'
          : `You’re released in ${status.yearsLeft} years. Until then, only a few things are up to you.`,
    };
  }
  return {
    title: 'On probation',
    body: status.yearsLeft <= 1 ? 'Through this year. Stay out of trouble, and you can’t move away.' : `Through ${status.lastYear}. Stay out of trouble, and you can’t move away.`,
  };
}

/** Interaction groups on the Interact sheet (E1). */
export const INTERACTION_GROUP_LABELS: Record<InteractionGroup, string> = {
  everyday: 'Everyday',
  conflict: 'Conflict',
  romance: 'Romance',
  practical: 'Practical',
  parenting: 'Parenting',
  grandparenting: 'Grandparenting',
};

export const GIFT_TIER_LABELS: Record<GiftTier, string> = {
  small: 'Small gift',
  medium: 'Medium gift',
  big: 'Big gift',
};

/** A close person's mood as a phrase after their name (E1): "in a great mood", "annoyed with you". */
export const MOOD_LABELS: Record<MoodBand, string> = {
  great: 'in a great mood',
  good: 'in good spirits',
  okay: 'doing okay',
  low: 'stressed',
  bad: 'having a rough time',
};

export function moodPhrase(mood: MoodView): string {
  return mood.annoyed ? 'annoyed with you' : MOOD_LABELS[mood.band];
}

/** How an outcome moved them, in words (E1): never numbers. Empty lines are left out. */
export function interactionChangeLines(name: string, changes: { affection: number; trust: number; mood: number }): string[] {
  const lines: string[] = [];
  if (changes.affection >= 6) lines.push(`${name} feels much closer to you.`);
  else if (changes.affection >= 1) lines.push(`${name} feels closer to you.`);
  else if (changes.affection <= -6) lines.push(`${name} is much less fond of you.`);
  else if (changes.affection <= -1) lines.push(`${name} is less fond of you.`);
  if (changes.trust >= 1) lines.push(`${name} trusts you more.`);
  else if (changes.trust <= -1) lines.push(`${name} trusts you less.`);
  if (changes.mood >= 1) lines.push(`${name}'s mood lifted.`);
  else if (changes.mood <= -1) lines.push(`${name}'s mood dropped.`);
  return lines;
}

/** The stripe color of an outcome card by how it went (the event tones' tokens). */
export const OUTCOME_TIER_TONE: Record<OutcomeTier, 'light' | 'neutral' | 'serious' | 'dark'> = {
  great: 'light',
  good: 'light',
  neutral: 'neutral',
  bad: 'serious',
  backfire: 'dark',
};

export const OUTCOME_TIER_LABELS: Record<OutcomeTier, string> = {
  great: 'It went great',
  good: 'It went well',
  neutral: 'It was fine',
  bad: 'It went badly',
  backfire: 'It backfired',
};

// E2a: children and parenting.

/** Where a child lives, in words. */
export const CUSTODY_LABELS: Record<'you' | 'shared' | 'other', string> = {
  you: 'Lives with you',
  shared: 'Shared custody',
  other: 'Lives with their other parent',
};

export const ORIGIN_LABELS: Record<'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step' | 'grandchild', string> = {
  birth: 'Your child',
  adopted: 'Adopted',
  ivf: 'Your child, through IVF',
  surrogacy: 'Your child, through surrogacy',
  step: 'Stepchild',
  grandchild: 'Your grandchild, whom you are raising',
};

/**
 * Your parenting style with a child in words: "You've been warm but strict,
 * and involved." Lines in between say nothing; an even style says so.
 */
export function parentingStyleLine(style: { warmth: StyleLevel; strictness: StyleLevel; involvement: StyleLevel }): string {
  const warm = style.warmth === 'high' ? 'warm' : style.warmth === 'low' ? 'cold' : null;
  const strict = style.strictness === 'high' ? 'strict' : style.strictness === 'low' ? 'relaxed' : null;
  const involved = style.involvement === 'high' ? 'involved' : style.involvement === 'low' ? 'hands-off' : null;
  const first = [warm, strict].filter((w): w is string => w !== null);
  if (first.length === 0 && involved === null) return 'You’ve been an even-handed parent so far.';
  const lead = first.length === 2 ? `${first[0]} but ${first[1]}` : (first[0] ?? null);
  const tail = involved === null ? '' : lead === null ? involved : `, and ${involved}`;
  return `You’ve been ${lead ?? ''}${tail}.`;
}

/** A child's grades in words. */
export function gradesPhrase(gpa: number): string {
  if (gpa >= 3.5) return 'Top of the class';
  if (gpa >= 3) return 'Doing well in school';
  if (gpa >= 2.3) return 'Getting by in school';
  if (gpa >= 1.5) return 'Struggling at school';
  return 'Failing at school';
}

/** A 0–100 value as a short word. */
export function levelWord(value: number, words: [string, string, string, string]): string {
  return value >= 75 ? words[0] : value >= 50 ? words[1] : value >= 30 ? words[2] : words[3];
}

export const PROCESS_LABELS: Record<'adoption' | 'ivf' | 'surrogacy', { name: string; blurb: string; confirm: string }> = {
  adoption: { name: 'Adopt a child', blurb: 'Apply through an agency. There is a home visit and a wait.', confirm: 'Apply to adopt' },
  ivf: { name: 'IVF', blurb: 'A clinic helps with a pregnancy. Each cycle can work, or not.', confirm: 'Start a cycle' },
  surrogacy: { name: 'Surrogacy', blurb: 'Someone carries a baby for you. It costs a lot and takes time.', confirm: 'Begin surrogacy' },
};

/** Why you can't start a process now, in words. */
export const PROCESS_BLOCK_LABELS: Record<'busy' | 'prison' | 'age' | 'record' | 'money' | 'housing' | 'carrier', string> = {
  busy: 'A pregnancy or another process is already under way.',
  prison: 'Not from prison.',
  age: 'Your age (or your partner’s) doesn’t fit what this allows.',
  record: 'A recent conviction rules this out for now.',
  money: 'You don’t have enough saved.',
  housing: 'You need a stable home first.',
  carrier: 'Neither of you can carry a pregnancy.',
};

/** The odds of something working, in words (never a number). */
export function oddsWords(chance: number): string {
  if (chance >= 0.65) return 'good odds';
  if (chance >= 0.4) return 'about even odds';
  if (chance >= 0.2) return 'long odds';
  return 'very long odds';
}

/** How long a wait is, in words. */
export function waitWords(wait: { min: number; max: number }): string {
  const years = (n: number) => (n === 1 ? '1 year' : `${n} years`);
  return wait.min === wait.max ? `about ${years(wait.min)}` : `${wait.min} to ${wait.max} years`;
}

/** The Home screen's line about a pregnancy. */
export function pregnancyLine(p: { carrier: 'you' | 'surrogate' | { name: string }; plan: 'keep' | 'adoption' | 'pending'; dueYear: number }, year: number): string {
  const when = p.dueYear <= year ? 'any day now' : 'due next year';
  const who = p.carrier === 'you' ? 'You’re expecting' : p.carrier === 'surrogate' ? 'Your surrogate is expecting your baby' : `${p.carrier.name} is expecting`;
  const plan = p.plan === 'adoption' ? ', and the baby will be placed for adoption' : '';
  return `${who}${plan}: ${when}.`;
}

// ── E2b: wills, estates, heirs and family lines ────────────────────────────

/** How you were related to someone named in an estate (no gender: the estate lists only what's kept). */
export const ESTATE_RELATION_LABELS: Record<RelationshipKind | 'cause', string> = {
  parent: 'Parent',
  stepparent: 'Stepparent',
  grandparent: 'Grandparent',
  relative: 'Aunt or uncle',
  sibling: 'Sibling',
  child: 'Child',
  stepchild: 'Stepchild',
  grandchild: 'Grandchild',
  partner: 'Partner',
  fiance: 'Fiancé(e)',
  spouse: 'Spouse',
  ex: 'Ex',
  friend: 'Friend',
  coworker: 'Coworker',
  boss: 'Boss',
  classmate: 'Classmate',
  teacher: 'Teacher',
  acquaintance: 'Acquaintance',
  cause: 'Cause',
};

/** A family's reputation (0–100, 50 unremarkable) in words. */
export function reputationWords(reputation: number): string {
  if (reputation >= 80) return 'Honored';
  if (reputation >= 62) return 'Well regarded';
  if (reputation > 38) return 'Unremarkable';
  if (reputation > 20) return 'Poorly regarded';
  return 'Notorious';
}

/** Where a minor heir lives (the Home screen's line). */
export function guardianHousingLine(guardian: { name: string; foster: boolean }, cityName: string): string {
  return guardian.foster ? `In foster care with ${guardian.name} in ${cityName}` : `Living with ${guardian.name} in ${cityName}`;
}

/** The estate's home line on the Death screen. */
export function estateHomeLine(home: 'none' | 'passes' | 'sold' | 'surrendered', value: number, mortgagePaid: number): string | null {
  switch (home) {
    case 'none':
      return null;
    case 'passes':
      return `The home, worth ${money(value)}, passes to one person with what is still owed on it.`;
    case 'sold':
      return `The home was sold for ${money(value)}; ${money(mortgagePaid)} went to the lender.`;
    case 'surrendered':
      return 'The home was worth less than its mortgage, so the lender took it. No one inherits the difference.';
  }
}

// E3: the lives of the people you know.

/** The rows of the "Their life" card on a person's page. */
export function lifeRows(view: PersonLifeView): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'Work', value: view.job ? capitalizeFirst(view.job) : view.retired ? 'Retired' : 'No job right now' });
  rows.push({ label: 'Where', value: view.city.withYou ? `${view.city.name}, with you` : view.city.yours ? `${view.city.name}, in your city` : view.city.name });
  if (view.partner) {
    const years = view.partner.years;
    const since = years >= 1 ? ` · ${years} ${years === 1 ? 'year' : 'years'}` : '';
    rows.push({ label: 'Partner', value: `${PARTNER_STATUS_LABELS[view.partner.status]} ${view.partner.name}${since}` });
  } else if (view.ended) {
    rows.push({ label: 'Partner', value: `${ENDED_LABELS[view.ended.how]} (${view.ended.year})` });
  }
  rows.push({
    label: 'Children',
    value: view.children.length === 0 ? 'None' : view.children.map((c) => `${c.name} (${c.age})`).join(', '),
  });
  if (view.care) rows.push({ label: 'Care', value: CARE_LABELS[view.care] });
  return rows;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const PARTNER_STATUS_LABELS = { dating: 'Dating', engaged: 'Engaged to', married: 'Married to' } as const;
export const ENDED_LABELS = { broke_up: 'Single after a breakup', divorced: 'Divorced', widowed: 'Widowed' } as const;
export const CARE_LABELS = {
  needed: 'Needs looking after',
  home: 'Lives with you, and you look after them',
  paid: 'You pay for their care',
  sibling: 'The family looks after them',
} as const;
export const NEWS_TITLE = 'News from your people';

/** One current trouble, as a line. */
export function troubleLine(t: TroubleView): string {
  if (t.kind === 'crime') {
    switch (t.stage) {
      case 'held':
        return `Arrested: ${t.name}, in custody awaiting trial`;
      case 'bailed':
        return `Arrested: ${t.name}, out awaiting trial`;
      case 'probation':
        return `On probation (${t.name})${t.until !== null ? `, until ${t.until}` : ''}`;
      case 'jail':
        return `In prison (${t.name})${t.until !== null ? `, until ${t.until}` : ''}`;
    }
  }
  if (t.kind === 'addiction') return `${t.name}${t.treated ? ', in recovery' : ''}`;
  return `${t.name}${t.treated ? ', being treated' : ''}${t.serious && !t.treated ? ', serious' : ''}`;
}

// E4: the social web.

/** Words for what ties two people (interface words for built-in values). */
export const TIE_KIND_LABELS: Record<TieKindId, string> = {
  married: 'Married',
  dating: 'Dating',
  siblings: 'Siblings',
  parentChild: 'Parent and child',
  inLaw: 'In-laws',
  friends: 'Friends',
};

/** How a tie reads. */
export const TIE_STATUS_LABELS: Record<TieStatusId, string> = {
  close: 'Close',
  normal: 'Getting along',
  strained: 'Strained',
  feuding: 'Feuding',
};

export const CONNECTIONS_TITLE = 'Connections';
export const HEARD_TITLE = "What they've heard";

/** One connection, as a line: who they are, what they are to you, and how it stands. */
export function connectionLine(c: ConnectionView): { who: string; how: string } {
  const feud = c.status === 'feuding' ? (c.sided ? ' (you took a side)' : c.neutral ? ' (you are staying out of it)' : '') : '';
  return { who: `${c.fullName}, your ${c.relation}`, how: `${TIE_KIND_LABELS[c.kind]} · ${TIE_STATUS_LABELS[c.status]}${feud}` };
}

/** One thing they have heard, as a sentence, with where it came from and whether it is the whole story. */
export function heardLine(name: string, h: HeardView): { text: string; note: string } {
  const how = h.learned === 'you' ? 'You told them' : h.learned === 'saw' ? 'They saw it for themselves' : 'They heard it from someone else';
  return { text: `${name} has heard ${h.text}.`, note: h.distorted ? `${how}, and it isn't how it was.` : `${how}.` };
}


// ── E5: pets, vehicles and homes ───────────────────────────────────────────


export const PET_PERSONALITY_LABELS: Record<PetPersonalityId, string> = {
  playful: 'Playful',
  anxious: 'Anxious',
  stubborn: 'Stubborn',
  lazy: 'Lazy',
};

/** A pet's health, in words (never a number). */
export function petHealthWords(health: number, ill: boolean): string {
  if (ill) return 'Ill';
  if (health >= 80) return 'Thriving';
  if (health >= 60) return 'Healthy';
  if (health >= 40) return 'Getting by';
  if (health >= 20) return 'Frail';
  return 'Failing';
}

/** How close a pet is to you, in words. */
export function bondWords(bond: number): string {
  if (bond >= 85) return 'Inseparable';
  if (bond >= 65) return 'Devoted';
  if (bond >= 45) return 'Fond of you';
  if (bond >= 25) return 'Getting used to you';
  return 'Wary';
}

/** A vehicle's or a home's condition, in words. */
export function conditionWords(condition: number): string {
  if (condition >= 85) return 'Like new';
  if (condition >= 65) return 'Good';
  if (condition >= 45) return 'Fair';
  if (condition >= 25) return 'Rough';
  return 'Falling apart';
}

export function yearsOld(age: number): string {
  return age <= 0 ? 'Under a year old' : age === 1 ? '1 year old' : `${age} years old`;
}

export const PET_BLOCK_LABELS: Record<PetBlock, string> = {
  age: 'You’re too young to take a pet in yourself.',
  limit: 'You have as many pets as you can look after.',
  savings: 'You can’t afford that yet.',
  unknown: 'Not available.',
};

export const VEHICLE_BLOCK_LABELS: Record<VehicleBlock | LoanBlock, string> = {
  age: 'You’re too young to drive.',
  limit: 'You own as many vehicles as you can keep.',
  savings: 'You don’t have enough saved.',
  unknown: 'Not available.',
  used: 'This one isn’t sold used.',
  license: 'You need your driver’s license first (More → Teen years).',
  independent: 'You have to be old enough to borrow.',
  bankruptcy: 'Lenders won’t say yes so soon after a bankruptcy.',
  income: 'The payments would be more than a lender will allow for your income.',
  status: 'Lenders won’t lend to someone without papers.',
};

export const VACATION_BLOCK_LABELS: Record<VacationBlock, string> = {
  age: 'You have to be old enough to own a home.',
  limit: 'You own as many vacation homes as you can keep.',
  savings: 'You don’t have enough saved for the down payment and closing costs.',
  bankruptcy: 'Lenders won’t say yes so soon after a bankruptcy.',
  income: 'Your payments on both homes would be more than a lender will allow for your income.',
  prison: 'Not while you are in prison.',
  unknown: 'Not available.',
  status: 'Lenders won’t lend to someone without papers.',
};

export const RENOVATION_BLOCK_LABELS: Record<RenovationBlock, string> = {
  nowhere: 'No home to do it in.',
  savings: 'You don’t have enough saved.',
  cooldown: 'You did this not long ago.',
  limit: 'Your home has all the work it can take at once.',
  prison: 'Not while you are in prison.',
  unknown: 'Not available.',
};

export const INSURANCE_WORDS = {
  on: 'Insured',
  off: 'Not insured',
} as const;

// ── T1: the teen years ─────────────────────────────────────────────────────

/** The four places a year's energy can go. */
export const FOCUS_LABELS: Record<TeenFocusId, { label: string; blurb: string }> = {
  school: { label: 'School', blurb: 'Better grades; less time for friends and work.' },
  friends: { label: 'Friends', blurb: 'Closer friendships; grades slip a little.' },
  work: { label: 'Work', blurb: 'More money from your job or odd jobs; grades and friends slip.' },
  passion: { label: 'A passion', blurb: 'Time for the thing you love; it may bring a talent to light.' },
};

export const JOIN_BLOCK_LABELS: Record<JoinBlock, string> = {
  age: 'Crowds are for the teen years.',
  school: 'You’re not in school.',
  unknown: 'Not available.',
  member: 'You’re already in this crowd.',
  turnedAway: 'They turned you away (or you left), and it’s too soon to try again.',
  away: 'You’re away.',
};

export const JOB_BLOCK_LABELS: Record<JobBlock, string> = {
  age: 'You’re too young for this job.',
  unknown: 'Not available.',
  have: 'You already have a job.',
  needs: 'It needs more than you have right now.',
  license: 'It needs your driver’s license.',
  away: 'You’re away.',
  adult: 'Teen jobs are for teenagers.',
};

export const ACTIVITY_BLOCK_LABELS: Record<ActivityBlock, string> = {
  age: 'Too young for this.',
  unknown: 'Not available.',
  member: 'You’re already in it.',
  limit: 'You’re in as many as you can handle.',
  turnedAway: 'You were cut, and it’s too soon to try again.',
  away: 'You’re away.',
  sport: 'Try out from your Sports card.',
};

export const LICENSE_BLOCK_LABELS: Record<LicenseBlock, string> = {
  age: 'You’re too young.',
  have: 'You already have this.',
  permit: 'You need a learner’s permit first.',
  lessons: 'You need a few more lessons first.',
  wait: 'You sat the test this year; try again next year.',
  away: 'You’re away.',
  max: 'You’ve had all the lessons they offer.',
};

export const NEGOTIATE_BLOCK_LABELS: Record<NegotiateBlock, string> = {
  none: 'There’s no such rule.',
  relaxed: 'It’s already as relaxed as it gets.',
  asked: 'You already asked this year.',
  limit: 'You’ve asked about enough rules this year.',
  away: 'You’re away.',
  age: 'Rules at home are for the teen years.',
};

export const FOCUS_BLOCK_LABELS: Record<FocusBlock, string> = {
  age: 'Choosing a focus is for the teen years.',
  away: 'You’re away.',
  school: 'You’re not in school.',
};

/** A chance from 0 to 1, in words. */
export function chanceWords(chance: number): string {
  if (chance >= 0.8) return 'Very likely';
  if (chance >= 0.6) return 'Likely';
  if (chance >= 0.4) return 'About even';
  if (chance >= 0.2) return 'Unlikely';
  return 'A long shot';
}

/** How much a crowd (or you) counts at school, in words. */
export function standingWords(standing: number): string {
  if (standing >= 75) return 'Everyone knows them';
  if (standing >= 55) return 'Well known';
  if (standing >= 35) return 'Known by some';
  return 'Mostly under the radar';
}

/** How close you are to a crowd, in words. */
export function rankWords(rank: number): string {
  if (rank >= 80) return 'One of the core';
  if (rank >= 60) return 'Part of the group';
  if (rank >= 40) return 'Getting there';
  return 'Still on the edge';
}

export const LICENSE_STAGE_LABELS = { none: 'No permit yet', permit: 'Learner’s permit', licensed: 'Licensed driver' } as const;

/** How tight a house rule is, in words. */
export const RULE_LEVEL_LABELS = ['Relaxed', 'The usual', 'Strict'] as const;

// ── E6a: crime careers ───────────────────────────────────────────────────────

/** Police attention as words (the engine gives a band, 0 up; balance/crime.yaml heat.bands). */
export const HEAT_WORDS = ['Unnoticed', 'Noticed', 'Watched', 'Hot', 'Burning'] as const;
export const HEAT_BLURBS = [
  'The police have no reason to know your name.',
  'A few people at the station have heard it.',
  'You are on someone’s list, and the list is getting read.',
  'Detectives are asking about you, and every job makes it worse.',
  'You are the thing the police are working on. Lying low is the only thing that helps.',
] as const;

/** Standing in the crew as words (balance/crime.yaml standing.bands). */
export const STANDING_WORDS = ['Disrespected', 'Unproven', 'Solid', 'Trusted', 'Revered'] as const;

/** How hot things are with the rival crew (balance/crime.yaml rivalry.bands). */
export const RIVALRY_WORDS = ['Quiet', 'Tense', 'Brewing', 'At war'] as const;

/** What the crew you moved away from suspects of you (balance/crime.yaml away.suspicion.bands). */
export const SUSPICION_WORDS = ['Missed', 'Wondering', 'Doubtful', 'Sure you ran'] as const;

/** How risky a deposit is (balance/crime.yaml dirty.laundering.riskBands). */
export const LAUNDER_RISK_WORDS = ['Low risk', 'Some risk', 'High risk'] as const;

/** How a crew ended, for someone who is out. */
export const CRIME_HOW_LABELS: Record<'left' | 'pushed' | 'drifted' | 'deal' | 'moved', string> = {
  left: 'You walked away',
  pushed: 'You were pushed out',
  drifted: 'You drifted out',
  moved: 'You moved on to a crew in a new city',
  deal: 'You made a deal with the police',
};

/** Dirty money an outcome gave or took, with the new balance: "+$2,400 dirty · Dirty money now $3,100". */
export function outcomeDirtyLabel(change: number, balance: number): string {
  return `${moneyChange(change)} dirty · Dirty money now ${money(balance)}`;
}

/** Why dirty money can't be used now. */
export function dirtyBlockLabel(block: 'age' | 'away' | 'none' | 'amount' | 'front' | null): string {
  switch (block) {
    case 'age':
      return 'Not at your age.';
    case 'away':
      return 'Not from prison.';
    case 'none':
      return 'You have no dirty money.';
    case 'amount':
      return 'Enter a whole number of dollars you have, at least the minimum.';
    case 'front':
      return 'That business is not open to you.';
    default:
      return '';
  }
}

// ── E6b: fame in arts and media ──────────────────────────────────────────────

/** Fame as words (the engine gives a band, 0 up; the screen's bars never show a number). */
export const FAME_WORDS = ['Unknown', 'Local', 'Rising', 'Famous', 'Legendary'] as const;
/** How the public sees you. */
export const IMAGE_WORDS = ['Ruined', 'Tarnished', 'Mixed', 'Well liked', 'Beloved'] as const;
/** How your fans feel: below 30 they have turned, above 60 they are devoted. */
export const FAN_MOOD_WORDS = ['Turned on you', 'Restless', 'Devoted'] as const;
export const BURNOUT_WORDS = ['Fresh', 'Tired', 'Worn down', 'On the edge'] as const;

export const COMMITMENT_LABELS = { back: 'Holding back', steady: 'Steady', all: 'All in' } as const;
export const COMMITMENT_BLURBS = {
  back: 'A slower climb, and your life stays yours: time for people, rest and health.',
  steady: 'A fair pace. Some strain on the people close to you, but nothing you can’t carry.',
  all: 'Faster, with more tours and press. Your people, your health and your nerves pay for it, and burnout gets close.',
} as const;
export const COMMITMENT_BLOCK_LABELS = { contract: 'Your contract asks for more than this.', young: 'Too young to go all in.' } as const;

export const SCENE_LABELS = { low: 'Low-key', social: 'Social', entourage: 'Entourage', lavish: 'Lavish' } as const;
export const SCENE_BLURBS = {
  low: 'Quiet nights and a small circle. Cheap, and out of the papers.',
  social: 'Dinners, openings and a decent table. A fair price for being seen.',
  entourage: 'People to carry things, answer things and say yes. It adds up, and so do the stories.',
  lavish: 'The best of everything, loudly. It costs a great deal and the tabloids notice.',
} as const;

export const STYLE_LABELS = { commercial: 'Commercial', artistic: 'Artistic' } as const;
export const STYLE_BLURBS = {
  commercial: 'Aim for the crowd. Fans tend to love it, and critics tend to shrug.',
  artistic: 'Aim for the work itself. Critics tend to love it, and fans tend to wait and see.',
} as const;
export const RISK_LABELS = { safe: 'Safe', bold: 'Bold' } as const;
export const RISK_BLURBS = {
  safe: 'A steady result. Rarely a disaster, rarely a triumph.',
  bold: 'A wide range: it could be the best thing you do, or a flop.',
} as const;

/** How a release was received (the project's band). */
export const RECEPTION_LABELS = {
  flop: 'It landed badly',
  solid: 'A fair reception',
  hit: 'A hit',
  acclaimed: 'Acclaimed',
  cult: 'Critics’ darling',
  crowd: 'Fans’ favorite',
} as const;

export const STALKER_STAGE_LABELS = {
  watching: 'Following you',
  reported: 'Reported to the police',
  ordered: 'A restraining order is in place',
  charged: 'Charged in court',
} as const;

export const COMPANY_KIND_LABELS = { label: 'label', studio: 'studio', platform: 'platform', publisher: 'publisher', gallery: 'gallery', brand: 'brand' } as const;
export const CONTRACT_TERMS_LABELS = { standard: 'Standard terms', tough: 'Tough terms', generous: 'Generous terms' } as const;

/** Why you can't start a career this way. */
export const FAME_ENTER_BLOCK_LABELS = {
  unknown: 'Not open to you.',
  active: 'You already have a career.',
  age: 'You are not the right age for this yet.',
  prison: 'Not from prison.',
  parent: 'A parent has to sign for you, and there is none.',
} as const;

export const FAME_CROSS_BLOCK_LABELS = {
  unknown: 'Not open to you.',
  inactive: 'You have no career.',
  same: 'You are already there.',
  second: 'You already have a second path.',
  rung: 'You are not high enough on the ladder yet.',
  fame: 'You are not famous enough yet.',
  age: 'You are not the right age for this yet.',
  contract: 'Your contract keeps you from other work.',
  prison: 'Not from prison.',
} as const;

export const FAME_AGENT_BLOCK_LABELS = {
  unknown: 'Not open to you.',
  inactive: 'You have no career.',
  have: 'You have an agent as good or better.',
  rung: 'You are not high enough on the ladder yet.',
  image: 'Your public image is not good enough for them.',
  prison: 'Not from prison.',
} as const;

/** A fan count, short ("3,400", "1.2 million"). */
export function fansLabel(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 100_000) / 10).toString()} million`;
  return n.toLocaleString('en-US');
}

/** The tabloid card's title in the news feed. */
export const TABLOID_TITLE = 'In the tabloids';

/** What critics or fans made of a work, as words (0–100 in bands of 20). */
export const REACTION_WORDS = ['Hated it', 'Panned it', 'Mixed', 'Liked it', 'Loved it'] as const;
export function reactionWord(score: number): string {
  return REACTION_WORDS[Math.min(4, Math.max(0, Math.floor(score / 20)))]!;
}

// ── Batch 4: bands, shows, tours, practice ─────────────────────────────────

export const SHOW_OUTCOME_LABELS = { great: 'A great night', good: 'A good night', rough: 'A rough night' } as const;
export const SHOW_BLOCK_LABELS = {
  inactive: 'You have no career.',
  prison: 'Not from prison.',
  path: 'No shows in this line of work.',
  limit: 'That is all the shows you can fit in this year.',
  parent: 'A parent has to say yes first.',
} as const;
export const TOUR_BLOCK_LABELS = {
  inactive: 'You have no career.',
  prison: 'Not from prison.',
  path: 'No tours in this line of work.',
  rung: 'You are not high enough on the ladder to tour yet.',
  booked: 'One tour a year, and this year’s is booked.',
  parent: 'A parent has to say yes first.',
} as const;
export const PRACTICE_BLOCK_LABELS = {
  inactive: 'You have no career.',
  prison: 'Not from prison.',
  path: 'Nothing to practise here.',
  skill: 'Not a skill of this path.',
  instrument: 'Choose your instrument first.',
  budget: 'No practice time left this year.',
  maxed: 'As good as practice alone can make it.',
} as const;
export const BAND_BLOCK_LABELS = {
  inactive: 'You have no career.',
  prison: 'Not from prison.',
  path: 'No bands in this line of work.',
  have: 'You are already in a band.',
  none: 'You are not in a band.',
  parent: 'A parent has to say yes first.',
  leader: 'Only the band’s leader can do that.',
  member: 'They are not in the band.',
  full: 'The band is full.',
  part: 'That part is taken.',
  same: 'That is already its name.',
  offer: 'That offer has gone.',
} as const;
export const PAST_BAND_LABELS = { left: 'you left', solo: 'you went solo', split: 'it broke up' } as const;
/** How well a band plays together, by chemistry (bands of 30, 50, 70). */
export const CHEMISTRY_WORDS = ['Falling apart', 'Uneasy', 'Tight', 'Like one person'] as const;
/** How good a bandmate (or a skill) is, in words. */
export function skillWord(score: number): string {
  return score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Decent' : score >= 20 ? 'Rough' : 'Beginner';
}
/** A title or band name that can't be used: what to fix. */
export const TITLE_ERROR = 'Use letters, numbers, spaces and simple punctuation, up to 60 characters.';

// ── E6c: sports ──────────────────────────────────────────────────────────────

export const SPORT_LEVEL_LABELS = { youth: 'Youth team', school: 'School team', college: 'College or academy', pro: 'Pro' } as const;
/** How a season was received (the band of the season on the shared fame record). */
export const SEASON_BAND_LABELS = {
  flop: 'A rough year',
  solid: 'A steady year',
  hit: 'A strong year',
  acclaimed: 'A special year',
  cult: 'The analysts’ pick',
  crowd: 'The fans’ favorite',
} as const;
export const RATING_WORDS = ['Poor', 'Fair', 'Good', 'Great', 'Outstanding'] as const;
export const TEAM_QUALITY_WORDS = ['A weak side', 'An average side', 'A good side', 'A contender'] as const;
export const FIT_WORDS = ['A poor fit', 'A fair fit', 'A good fit', 'A natural fit'] as const;
export const INJURY_SEVERITY_WORDS = ['Minor', 'Moderate', 'Serious', 'Severe'] as const;
export const PLAYOFF_RESULT_LABELS = { missed: 'Missed the playoffs', out: 'Lost in the playoffs', final: 'Lost the final', champion: 'Won it all' } as const;
/** B1: the ways to look for a date (the "Find a date" card on the People tab). */
export const FIND_DATE_LABELS = {
  app: { label: 'Use a dating app', blurb: 'Swipe, message, see who is out there.' },
  friend: { label: 'Ask a friend to set you up', blurb: 'A friend who knows someone.' },
  night_out: { label: 'Go out for the night', blurb: 'Dress up and see who you meet.' },
} as const;
export const SPORT_FOCUS_LABELS = { skills: 'Skills', conditioning: 'Conditioning', film: 'Film study' } as const;
export const SPORT_FOCUS_BLURBS = {
  skills: 'Drills and repetition. The craft grows fastest.',
  conditioning: 'Gym, track and recovery. Fitness grows and you are sharper for it. (Training never causes or prevents injuries; games do.)',
  film: 'Hours with the tape. A smart player reads the game earlier.',
} as const;
/** Batch 5: tryouts, training, scholarships and your place on a team. */
export const TRYOUT_BLOCK_LABELS = {
  unknown: 'Not open to you.',
  busy: 'You are in another career.',
  prison: 'You are away.',
  age: 'Not for your age.',
  parent: 'A parent has to sign for you.',
  member: 'You are already on this team.',
  cut: 'They cut you recently. Too soon to ask again.',
  year: 'You have tried out as often as you can this year.',
  pending: 'A tryout is already lined up.',
  level: 'Not open at your level.',
  country: 'Not offered where you live.',
  gone: 'No longer on the list.',
} as const;
export const ODDS_WORDS = ['A long shot', 'Unlikely', 'Even odds', 'Likely', 'Almost certain'] as const;
export const TRAINING_MODE_LABELS = { team: 'With your team', gym: 'At a gym', coach: 'With a private coach' } as const;
export const TRAINING_MODE_BLURBS = {
  team: 'Its coaches and facilities, at no charge. A stronger team teaches more.',
  gym: 'Works without a team, for less gain. The membership is paid once a year.',
  coach: 'Works without a team, with a better gain than a gym. You pay for each session.',
} as const;
export const TRAIN_BLOCK_LABELS = {
  inactive: 'You are not playing.',
  prison: 'You are away.',
  path: 'Not your sport.',
  skill: 'Not a skill of your sport.',
  instrument: 'Not available.',
  budget: 'No sessions left this year.',
  maxed: 'As far as practice alone takes you.',
  team: 'You have no team to train with.',
  money: 'You cannot afford it.',
} as const;
export const SKILL_WORDS = ['Raw', 'Learning', 'Solid', 'Sharp', 'Elite'] as const;
export const ROLE_LABELS = { starter: 'Starter', rotation: 'In the rotation', reserve: 'Reserve' } as const;
export const SCHOLARSHIP_SYSTEM_LABELS = { college: 'College teams recruit.', university: 'University teams recruit, and club academies take young players.' } as const;
export const OFFER_BLOCK_LABELS = { none: 'The offer is gone.', held: 'You already hold one.', school: 'You are in a program that does not allow it.', prison: 'You are away.', between: 'Choices wait until the year is over.' } as const;

export const CONTRACT_KIND_LABELS = { minimum: 'A minimum deal', rookie: 'A rookie deal', standard: 'A standard deal', star: 'A star deal' } as const;
export const CONTRACT_OPTION_LABELS = { none: 'no option', team: 'a team option on the last year', player: 'a player option on the last year' } as const;
export const SPORT_EXIT_LABELS = {
  coaching: { label: 'Become a coach', blurb: 'Stay in the game with a whistle and a clipboard. A job in coaching.' },
  broadcast: { label: 'Go into broadcasting', blurb: 'Take a seat in the booth. Your fame carries over into a career in media.' },
  normal: { label: 'Start a normal life', blurb: 'Hang it up and find a job somewhere else. Your fame turns into royalties that fade.' },
} as const;
export const SPORT_EXIT_BLOCK_LABELS = { fame: 'You are not famous enough yet.', job: 'No such job is open.' } as const;
export const SPORT_RETIRED_LABELS = {
  coaching: 'You left the game to become a coach.',
  broadcast: 'You left the game for the broadcast booth.',
  normal: 'You left the game for a normal life.',
} as const;

/** Money as it reads in a salary line ("$1,200,000 a year"). */
export function salaryLabel(n: number): string {
  return `${money(n)} a year`;
}

/** "1st", "2nd", "3rd", "11th": a place in the standings. */
export function placeLabel(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

// ── W1: the funeral ─────────────────────────────────────────────────────────
// The words around the eulogy. What the speaker says, and why people stayed
// away, is content (src/content/text/eulogy.yaml).

export const FUNERAL_LABELS = {
  screen: 'The funeral',
  eulogy: 'The eulogy',
  noSpeaker: 'No one was close enough to speak for you.',
  absent: 'Who didn’t come',
  everyoneCame: 'Everyone who was expected came.',
  unable: 'Couldn’t be there',
  unableNote: 'They would have come if they could.',
  noFuneral: 'No funeral was recorded for this life: it ended before eulogies were written.',
  // L1.
  lastDays: 'Your last days',
  bedside: 'At your bedside',
  review: 'Looking back',
  regrets: 'Regrets',
  proud: 'Proud moments',
  reviewNone: 'Nothing in this life stood out as a regret or a proud moment.',
} as const;

/** "Spoken by Ana Ruiz, your wife". */
export const spokenBy = (name: string, relation: string): string => `Spoken by ${name}, your ${relation}`;

/** "And 3 more." for the people left off a full list. */
export const andMore = (n: number): string => `And ${n} more.`;

// ── L1: later life ─────────────────────────────────────────────────────────

/** Where you spend your last months (final wishes). */
export const HOSPICE_LABELS: Record<HospiceChoice, { name: string; blurb: string }> = {
  hospice: { name: 'Hospice care', blurb: 'Comfort over cures, with a team around you.' },
  home: { name: 'At home', blurb: 'Your own bed, with help coming to you.' },
  hospital: { name: 'In the hospital', blurb: 'Keep trying everything, close to the doctors.' },
};

/** The service you ask for (final wishes). */
export const SERVICE_LABELS: Record<ServiceStyle, { name: string; blurb: string }> = {
  traditional: { name: 'Traditional', blurb: 'A formal service, as most people expect.' },
  simple: { name: 'Simple', blurb: 'Small and quiet, and it costs less.' },
  celebration: { name: 'A celebration', blurb: 'Stories and music, and more people come.' },
  private: { name: 'Private', blurb: 'Only those closest to you, and fewer come.' },
};

/** How care near the end is provided. */
export const OWN_CARE_LABELS: Record<CareOption, { name: string; blurb: string }> = {
  family: { name: 'Family', blurb: 'A relative looks after you, and moves close.' },
  paid: { name: 'A paid carer', blurb: 'Someone comes to your home. It costs every year.' },
  assisted: { name: 'Assisted living', blurb: 'You move into a place with help on hand. It replaces your home’s costs.' },
};

export const LATER_TITLES = {
  grandchildren: 'Grandchildren',
  raising: 'Grandchildren you are raising',
  care: 'Care',
  wishes: 'Final wishes',
} as const;

/** "Marked down": the people you can ask in your final wishes, with what they are to you. */
export function laterPersonLine(p: { kind: RelationshipKind; genderCategory: GenderCategory; age: number; estranged: boolean }): string {
  return [relationshipLabel(p.kind, p.genderCategory), ageLabel(p.age), ...(p.estranged ? ['Estranged'] : [])].join(' · ');
}

// W2: belonging. Interface words for groups, faith and values; what a group is like comes from content.
export const GROUP_TYPE_LABELS = { club: 'Clubs and hobbies', faith: 'Faith communities', service: 'Volunteering and causes', civic: 'Neighborhood and civic groups' } as const;
export const GROUP_TYPE_SINGULAR = { club: 'Club', faith: 'Faith community', service: 'Cause', civic: 'Civic group' } as const;
export const VALUE_LABELS: Record<string, { name: string; blurb: string }> = {
  community: { name: 'Community', blurb: 'Belonging to something larger than yourself' },
  compassion: { name: 'Compassion', blurb: 'Caring for people who are struggling' },
  tradition: { name: 'Tradition', blurb: 'Honoring the old ways' },
  independence: { name: 'Independence', blurb: 'Thinking and choosing for yourself' },
  civic: { name: 'Civic duty', blurb: 'What you owe the place you live' },
};
export const FAITH_STRENGTH_WORDS = { none: 'No belief to speak of', wavering: 'Wavering', steady: 'Steady', devout: 'Devout' } as const;
export const GROUP_COMMITMENT_LABELS = { casual: 'Casual', committed: 'Committed' } as const;
export const GROUP_COMMITMENT_BLURBS = { casual: 'Drop in when you can', committed: 'Make it part of your week' } as const;
export const GROUP_JOIN_BLOCK_LABELS = {
  unknown: 'Not available',
  member: 'You belong already',
  age: 'Not open at your age',
  away: 'You can’t while you are away',
  city: 'In another city',
  full: 'You belong to as many as you can manage',
  committedAge: 'Too young to commit to this',
} as const;
export const RISE_NEEDS_LABELS = {
  years: 'More years in the group',
  standing: 'Better standing in the group',
  committed: 'Committing to the group',
  age: 'Being older',
} as const;
export const GROUPS_TITLES = {
  screen: 'Groups',
  yours: 'Your groups',
  none: 'You don’t belong to any group yet.',
  available: 'In your city',
  past: 'Groups you left',
  faith: 'Faith',
  values: 'What you value',
  week: 'Hours a week',
  cost: 'Costs this year',
} as const;
export const hoursLine = (h: number): string => (h === 0 ? 'No time' : `${h} hour${h === 1 ? '' : 's'} a week`);
export const roleLine = (role: string, years: number): string => `${role}, ${years === 0 ? 'new this year' : `${years} year${years === 1 ? '' : 's'}`}`;

// W3: businesses. Interface words for the decisions and the funding; what a business is like comes from content.
export const BUSINESS_TITLES = {
  card: 'Business',
  screen: 'Business',
  yours: 'Your businesses',
  none: 'You don’t own a business yet.',
  start: 'Start a business',
  market: 'For sale',
  report: 'Last year',
  staff: 'People who work there',
  locations: 'Locations',
  owners: 'Who owns it',
  decisions: 'This year’s decisions',
  loans: 'Loans',
  past: 'Businesses you had',
} as const;
export const BUSINESS_DECISION_LABELS = {
  prices: 'Prices',
  marketing: 'Marketing',
  qualityInvest: 'Quality',
  pay: 'Pay',
  staffing: 'Staffing',
  training: 'Training',
} as const;
export const BUSINESS_DECISION_HINTS = {
  prices: 'Lower prices bring more customers; higher ones bring more from each.',
  marketing: 'Spend to be noticed. It helps most when little is spent already.',
  qualityInvest: 'Spend on better ingredients, tools and training.',
  pay: 'Fair pay keeps people. Low pay saves money until they leave.',
  staffing: 'A preset that fills every place’s headcount; adjust each role on the Team tab.',
  training: 'Training lifts skill and mood across the crew and the people you know. It takes a share of payroll.',
} as const;
export const BUSINESS_FUNDING_LABELS = {
  savings: { name: 'Your savings', blurb: 'All of it from your own pocket.' },
  loan: { name: 'A business loan', blurb: 'A bank lends part of it. You are personally on the hook.' },
  investors: { name: 'Family and friends', blurb: 'People you know put money in, and own a share.' },
  cofounder: { name: 'A co-founder', blurb: 'A partner puts in money and work, and owns a share.' },
} as const;
export const BUSINESS_ROLE_LABELS = { self: 'Run it yourself', manager: 'Hire a manager' } as const;
export const BUSINESS_ROLE_BLURBS = {
  self: 'You are there every day. Your own skills matter most, and a job on the side suffers.',
  manager: 'A manager keeps it going while you do something else. A good one keeps it steady; a bad one can run it down quietly.',
} as const;
export const BUSINESS_BLOCK_LABELS: Record<string, string> = {
  age: 'You are too young to run a business',
  away: 'You can’t while you are away',
  savings: 'You don’t have enough savings for your share',
  loanDeclined: 'The bank says no for now',
  loanAmount: 'That loan is more than the bank will lend',
  loanOwn: 'The bank wants you to put in more of your own',
  investorsNone: 'Pick at least one person to ask',
  investorUnknown: 'One of them isn’t able or willing to invest',
  investorCapacity: 'One of them can’t put in that much',
  investorMax: 'Too many investors',
  stakeCap: 'Together they would own too much of it',
  cofounderNone: 'Pick a co-founder',
  cofounderUnknown: 'That person isn’t able or willing to be your partner',
  cofounderShare: 'Pick a share',
  name: 'Give it a name (2 to 40 characters, not already used)',
  type: 'Pick a kind of business',
  city: 'Pick a city',
  style: 'Pick a style',
  full: 'You own as many as you can manage',
  license: 'The licensed worker you chose no longer fits',
  role: 'Pick how it is run',
  listing: 'That one is no longer for sale',
  bought: 'Already bought',
  taken: 'Somebody else bought it',
  plan: 'The plan is not complete',
};
// B2: business depth. Fixed interface words; product names, role titles, supplier names and every story line are content.
export const BUSINESS_TABS = { report: 'Report', products: 'Products', team: 'Team', places: 'Places', franchise: 'Franchise' } as const;
export const ORDER_LABELS = { lean: 'Lean', normal: 'Normal', heavy: 'Heavy' } as const;
export const ORDER_HINTS = {
  lean: 'Saves money and runs out more often.',
  normal: 'A little over what you sold.',
  heavy: 'Rarely runs out and throws more away.',
} as const;
export const PRICE_LABELS = { low: 'Below', fair: 'Going rate', high: 'Above' } as const;
export const STOCK_WORDS = { short: 'Ran out', fine: 'About right', surplus: 'A lot left over', new: 'No year yet' } as const;
export const SUPPLIER_MOODS = { up: 'getting dearer', down: 'getting cheaper', steady: 'steady' } as const;
export const SUPPLIER_ARROWS = { up: '▲', down: '▼', steady: '►' } as const;
export const PLACE_STOCK_WORDS = { none: 'Nothing on the shelves', low: 'Shelves nearly bare', ok: 'Shelves stocked', high: 'Shelves full' } as const;
export const RUNNER_WORDS = { you: 'You', manager: 'Its manager', general: 'The general manager', away: 'You, from far away', nobody: 'Nobody' } as const;
export const WILLING_WORDS = { likely: 'Likely to go', unsure: 'Unsure about it', unlikely: 'Unlikely to go' } as const;
export const RISK_WORDS = (risk: number): string => (risk >= 60 ? 'The name is at real risk' : risk >= 40 ? 'Some worry about the name' : risk >= 20 ? 'A little worry' : 'No worry');
export const FRANCHISE_CONDITION_LABELS: Record<string, (need: number) => string> = {
  years: (n) => `Trading ${n} years or more`,
  locations: (n) => `${n} locations or more`,
  quality: (n) => `Quality of ${n} or more`,
  reputation: (n) => `Reputation of ${n} or more`,
  recent: (n) => `No loss in the last ${n} years`,
};
export const FRANCHISE_BLOCK_LABELS: Record<string, string> = {
  years: 'The business is too young',
  locations: 'The business needs more locations',
  quality: 'Quality is not high enough',
  reputation: 'Reputation is not high enough',
  recent: 'A recent loss',
  full: 'As many franchises as you can have',
  city: 'Pick a city',
  person: 'That person cannot run it',
  royalty: 'Pick a royalty',
  style: 'Pick a style',
  away: 'You can’t while you are away',
};
export const TRANSFER_BLOCK_LABELS: Record<string, string> = {
  unknown: 'Not possible',
  same: 'Already there',
  location: 'That place is gone',
  room: 'No room for another named person there',
  savings: 'You don’t have enough savings',
  family: 'Has a family where they are and cannot move',
  unwilling: 'Not willing to move',
  manager: 'Manages another place',
};
export const HEADCOUNT_RANGE = (min: number, max: number): string => `${min} to ${max}`;
export const TRAINING_HINTS = { none: 'No training.', some: 'A little: skills and mood rise slowly.', lots: 'A lot: skills and mood rise faster. It takes a share of payroll.' } as const;
export const LINE_BLOCK_LABELS: Record<string, string> = {
  line: 'Not a line of this business',
  style: 'Not sold in this style',
  limit: 'You are at the limit of lines this shop can carry',
  empty: 'A shop needs at least one line',
  savings: 'You don’t have enough savings for the restock fee',
  core: 'Part of the menu, so it stays',
};
export const ECONOMY_TONES = { boom: 'text-text', steady: 'text-muted', slowdown: 'text-muted', recession: 'text-danger' } as const;

export const BUSINESS_END_LABELS = { sold: 'Sold', closed: 'Closed', failed: 'Failed', passed: 'Passed on' } as const;
export const BUSINESS_HOW_LABELS = { started: 'Started', bought: 'Bought', inherited: 'Inherited' } as const;
export const businessStakeLine = (share: number, role: 'you' | 'investor' | 'cofounder'): string => `${share}%${role === 'investor' ? ' · investor' : role === 'cofounder' ? ' · co-founder' : ''}`;

export const LANGUAGE_LEVEL_LABELS: Record<string, string> = { beginner: 'Beginner', basic: 'Basic', conversational: 'Conversational', fluent: 'Fluent' };

export const LANGUAGE_NATIVE_LABEL = 'Native';

/** W5: fixed interface words for travel choices. */
export const TRIP_BUDGET_LABELS = { budget: 'Budget', comfortable: 'Comfortable', splurge: 'Splurge' } as const;
export const STAY_ROUTE_LABELS = { semester: 'Semester', year: 'Academic year', working_holiday: 'Working holiday', transfer: 'Employer transfer' } as const;
export const STAY_BLOCK_LABELS: Record<string, string> = {
  unavailable: 'Travel is unavailable now. Check your age, legal restrictions and whether you already traveled this year.',
  destination: 'Choose a city in another country.', household: 'Temporary stays need a rental or family home and no dependent children or relatives in your care at home.',
  commitment: 'Your business, crew or public career needs you here.', college: 'An exchange needs current college enrollment and no full-time job.',
  money: 'You need enough saved for the up-front cost.', school: 'Finish or leave your current program before working abroad.',
  holiday: 'This working-holiday route is unavailable for your age or current employment.',
  job: 'An employer transfer needs a current job and its language requirements met at the destination.', route: 'Choose an available route.',
};

/** W6: fixed interface words for emigration and citizenship. */
export const ROUTE_LABELS = {
  work_sponsor: 'Work sponsorship',
  study_work: 'Study, then work',
  family: 'Family or marriage',
  investment: 'Investment',
} as const;
export const ROUTE_BLURBS = {
  work_sponsor: 'An employer there sponsors you. Needs a qualification or experience in a sponsorable job, and enough of the language.',
  study_work: 'Study there at the international rate; a degree can lead to a work permit.',
  family: 'A spouse, partner or parent who is a citizen there sponsors you. You arrive in their city.',
  investment: 'A large sum is held while the application is decided, and returned if you are refused.',
} as const;
export const STATUS_LABELS = { citizen: 'Citizen', permanent: 'Permanent resident', temporary: 'Temporary permit', undocumented: 'Without papers' } as const;
export const PERMIT_LABELS = { student: 'Study permit', temporary_worker: 'Work permit', permanent_resident: 'Permanent residence', undocumented: 'No permit', visitor: 'Visitor' } as const;
export const APPLICATION_KIND_LABELS = { entry: 'Move to', permanent: 'Permanent residence in', naturalization: 'Citizenship of', regularization: 'Legal status in' } as const;
export const APPLICATION_STATUS_LABELS = { pending: 'Waiting', approved: 'Approved', denied: 'Refused' } as const;
export const BASIS_LABELS = { marriage: 'Marriage to a citizen', long_residence: 'Long residence', rule_change: 'A change in the rules' } as const;
export const REMIT_LABELS = { none: 'None', some: 'Some', steady: 'Steady' } as const;
export const approvalLabel = (odds: number): string => (odds < 0.25 ? 'Unlikely' : odds < 0.5 ? 'Uncertain' : odds < 0.75 ? 'Likely' : 'Very likely');
export const ENTRY_BLOCK_LABELS: Record<string, string> = {
  unavailable: 'Not available for this country.', age: 'Your age does not fit this route.', law: 'Not while you are on probation or in prison.',
  pending: 'You already have an application waiting.', stay: 'Finish your temporary stay first.', citizen: 'You are already a citizen there.',
  removed: 'You cannot apply there for now.', here: 'You already live there.', city: 'Choose a city in that country.', denied: 'You were refused this year; try again next year.',
  record: 'A recent prison sentence closes this route.', money: 'You need more saved for the cost.', school: 'Finish or leave your current program first.',
  skills: 'You need a qualification or enough work experience.', language: 'You need more of the language.', job: 'No sponsor can be found for your skills.',
  schooling: 'You need to have finished secondary school.', program: 'Choose a program.', sponsor: 'You need a relative there who is a citizen.',
};
export const STATUS_BLOCK_LABELS: Record<string, string> = {
  age: 'You have to be an adult.', status: 'Not for your situation.', unavailable: 'Not available here.', pending: 'You already have an application waiting.', denied: 'Refused this year; try again next year.',
  student: 'Finish your studies first.', years: 'You have not lived there long enough yet.', job: 'You need a job.', record: 'A recent conviction closes this for now.',
  language: 'You need more of the language.', money: 'You need more saved for the cost.', spouse: 'You need a spouse who is a citizen.', window: 'No window is open now.', law: 'Not while you are in prison.',
};
export const MOVE_BLOCK_LABELS: Record<string, string> = {
  age: 'Too young.', law: 'Not while on probation or in prison.', stay: 'Finish your temporary stay first.', care: 'Not while you need care.',
  commitment: 'Your business, crew or public career needs you here.', money: 'You need more saved to move.',
};

// Batch 2a: activities (More → Activities).

export const PASTIME_CATEGORY_LABELS: Record<PastimeCategory, string> = {
  mind_body: 'Mind & body',
  salon_spa: 'Salon & spa',
  surgery: 'Plastic surgery',
  shopping: 'Shopping',
  movies: 'Movie theater',
  nightlife: 'Nightlife',
  outdoor: 'Outdoor',
  luxury: 'Luxury',
  love: 'Love',
  // Batch 2b: risk and legal.
  crime: 'Crime',
  black_market: 'Black market',
  gambling: 'Gambling',
  lawsuits: 'Lawsuits',
  identity: 'Identity',
  loans: 'Loans',
};

/** A line under a risk category's heading: what to know before you choose. */
export const PASTIME_CATEGORY_NOTES: Partial<Record<PastimeCategory, string>> = {
  crime: 'Being caught is a court, a record and, for the serious ones, prison. Heat stays with you. Teens only get the small ones, and a juvenile record is sealed at 18.',
  black_market: 'Money in one hand and trouble in the other. Pills and drugs can take hold of you.',
  gambling: 'The house always has the edge: over time, you lose. Chasing a loss is how it gets worse.',
  lawsuits: 'A lawyer costs money whether or not you win. What you can prove changes your odds.',
  identity: 'Your legal name changes everywhere, from now on.',
  loans: 'A loan is money now and a bill later. Shorter and faster usually means dearer.',
};

/** Why an activity on offer can't be done right now. */
export const PASTIME_BLOCK_LABELS: Partial<Record<PastimeBlock, string>> = {
  limit: 'You have done enough of this for one year.',
  afford: 'You can’t afford this yet.',
  companion: 'Choose who comes along.',
  quality: 'Choose a price tier.',
  stake: 'Choose a stake.',
  route: 'Choose how it ends.',
  chase: 'You have not lost anything to chase.',
  name: 'Enter a name you can use.',
  consent: 'A parent has to agree.',
};

/** Batch 2b: why a lender said no. */
export const LOAN_BLOCK_LABELS: Record<string, string> = {
  status: 'Lenders will not lend to you without papers.',
  income: 'Your income last year is too low for this lender.',
  record: 'Your record counts against you here.',
  bankruptcy: 'It is too soon after your bankruptcy.',
  debt: 'You owe too much already.',
  open: 'You already have a loan from this kind of lender.',
  contacts: 'You do not know anyone who lends this way.',
};

/** How much you have to go on in a lawsuit, in words. */
export function evidenceWords(n: number): string {
  return n === 0 ? 'You have little to go on.' : n === 1 ? 'You have something to go on.' : 'You have a good deal to go on.';
}

/** What a lender offers: who, how much, the yearly rate, how long, and the fee. */
export function loanOfferWords(lender: string, amount: string, ratePercent: number, termYears: number, fee: string | null): string {
  const who = lender ? lender.charAt(0).toUpperCase() + lender.slice(1) : 'They';
  const term = termYears === 1 ? 'a year' : `${termYears} years`;
  return `${who} would lend you ${amount} at ${ratePercent}% a year, over ${term}${fee ? `, less a ${fee} fee` : ''}.`;
}

export const CHASE_LABEL = (loss: string, on: boolean): string => `Chase your losses: bet back the ${loss} you just lost${on ? ' (on)' : ''}`;

export const PASTIME_STAKE_LABELS: Record<PastimeStake, string> = { low: 'Small stake', medium: 'Medium stake', high: 'High stakes' };
export const PASTIME_STAKE_NOTES: Record<PastimeStake, string> = { low: 'Gentler on the wallet.', medium: 'A fair evening’s money.', high: 'Big swings, and a bigger pull.' };
export const PASTIME_ROUTE_LABELS: Record<PastimeRoute, string> = { settle: 'Settle out of court', trial: 'Go to trial' };
export const PASTIME_ROUTE_NOTES: Record<PastimeRoute, string> = { settle: 'A smaller, likelier payout.', trial: 'All or nothing, and costs if you lose.' };

export const PASTIME_QUALITY_LABELS: Record<PastimeQuality, string> = {
  budget: 'Budget surgeon',
  standard: 'Standard surgeon',
  premier: 'Top surgeon',
};

export const PASTIME_QUALITY_NOTES: Record<PastimeQuality, string> = {
  budget: 'Cheaper, with more that can go wrong.',
  standard: 'A fair price and fair odds.',
  premier: 'Costs more, and fewer things go wrong.',
};

/** Batch 2b: lawyer tiers share the price tiers of surgeons. */
export const LAWYER_QUALITY_LABELS: Record<PastimeQuality, string> = { budget: 'Budget lawyer', standard: 'Standard lawyer', premier: 'Top lawyer' };
export const LAWYER_QUALITY_NOTES: Record<PastimeQuality, string> = {
  budget: 'Cheaper, with weaker odds.',
  standard: 'A fair fee and fair odds.',
  premier: 'Costs more, with the best odds.',
};

/** What an activity did to you, in words (never numbers). */
export function pastimeChangeWords(changes: PastimeReceipt['changes']): string[] {
  const size = (n: number) => (Math.abs(n) >= 6 ? 'a lot ' : Math.abs(n) <= 1 ? 'a little ' : '');
  const words: Record<keyof PastimeReceipt['changes'], [string, string]> = {
    health: ['healthier', 'less healthy'],
    happiness: ['happier', 'less happy'],
    smarts: ['sharper', 'duller'],
    looks: ['better looking', 'not looking your best'],
    fitness: ['fitter', 'less fit'],
    stress: ['more stressed', 'calmer'],
  };
  const out: string[] = [];
  for (const key of Object.keys(words) as (keyof PastimeReceipt['changes'])[]) {
    const n = changes[key];
    if (n === undefined || n === 0) continue;
    const [up, down] = words[key];
    out.push(`You feel ${size(n)}${n > 0 ? up : down}.`);
  }
  return out;
}

/** How an activity moved things with whoever came along. */
export function companionChangeWords(name: string, affection: number): string | null {
  if (affection >= 4) return `You feel a lot closer to ${name}.`;
  if (affection >= 1) return `You feel closer to ${name}.`;
  if (affection <= -3) return `${name} seems more distant.`;
  if (affection <= -1) return `${name} seems a little distant.`;
  return null;
}

/** The kinds of people who can come along, for "Take …". */
export const PASTIME_COMPANION_LABELS: Record<'partner' | 'friend' | 'family', string> = {
  partner: 'your partner',
  friend: 'a friend',
  family: 'family',
};

/** Valuable classes, as the Belongings screen reads them. */
export const VALUABLE_CLASS_LABELS: Record<string, string> = { jewelry: 'Jewelry', designer: 'Designer goods', art: 'Art', boat: 'Boat' };

// ---- Batch 3: school and work life ----

/** A subject's grade in words (balance/school.yaml report.bands holds the cut-offs). */
export const GRADE_BAND_WORDS: Record<'top' | 'strong' | 'solid' | 'fair' | 'weak' | 'failing', string> = {
  top: 'Excellent',
  strong: 'Very good',
  solid: 'Good',
  fair: 'Fair',
  weak: 'Struggling',
  failing: 'Failing',
};

/** An exam result in words. */
export const EXAM_BAND_WORDS: Record<'top' | 'pass' | 'fail', string> = {
  top: 'Did very well',
  pass: 'Passed',
  fail: 'Missed the mark',
};

/** Why you can't do a school action now. */
export const SCHOOL_ACTION_BLOCK_LABELS: Record<'school' | 'away' | 'age' | 'done' | 'stance' | 'money' | 'limit' | 'subject', string> = {
  school: 'You’re not in school.',
  away: 'You’re away.',
  age: 'You’re too young for this.',
  done: 'You’ve done this already this year.',
  stance: 'You’ve already settled on how to spend this year.',
  money: 'You can’t afford it.',
  limit: 'That’s as far as you’ll push it this year.',
  subject: 'That subject isn’t on your timetable.',
};

/** What each path at the end of compulsory school asks of the exam result (in words). */
export const SCHOOL_PATH_HINTS: Record<'stay' | 'college' | 'apprenticeship' | 'work', string> = {
  stay: 'Needs a pass in your exams.',
  college: 'Takes everyone.',
  apprenticeship: 'Needs a decent result and an employer who’ll take you on.',
  work: 'You can go back to school later.',
};

/** Why you can't do a work action now. */
export const WORK_ACTION_BLOCK_LABELS: Record<'job' | 'away' | 'done' | 'stance' | 'people' | 'limit' | 'unknown', string> = {
  job: 'You don’t have a job.',
  away: 'You’re away.',
  done: 'You’ve done this already this year.',
  stance: 'You’ve already settled on how to spend this year.',
  people: 'There’s no one to do it with.',
  limit: 'That’s enough of that this year.',
  unknown: 'Not possible.',
};

/** Batch 6: Settings → Teams, in words. */
export const TEAM_EDITOR_WORDS = {
  intro: 'Rename any team, move it to another city, or add teams of your own. Every new life plays with the teams as you leave them here.',
  lifeNote: 'Your life in progress shows new team names at once. Teams you moved, added or removed reach it from next season.',
  sync: 'Use these changes in my current life',
  pending: 'Changes to teams are waiting for next season in your current life.',
} as const;

/** Batch 6: the Sports screen's world of clubs, in words. */
export const SPORTS_WORLD_WORDS = {
  title: 'Clubs, loans and moves',
  awayCity: (place: string, city: string) => `Your team plays its home games in ${place}. You live in ${city} and make the trip.`,
  awayCountry: (place: string, country: string, city: string) => `Your club is in ${place}${country ? `, ${country}` : ''}. You live in ${city} and commute.`,
  rival: (rival: string) => `Your rival: ${rival}.`,
  academy: (club: string, abroad: boolean) => `You are in the academy at ${club}${abroad ? ', in another country, and you travel to it' : ''}.`,
  onLoan: (host: string, parent: string, until: number) => `On loan at ${host} until ${until}. ${parent} still holds your deal.`,
  loanOffer: (parent: string, host: string) => `${parent} wants to send you on loan to ${host} for a season.`,
  window: 'The transfer window is open',
  terms: (wage: string, years: number, fee: string, clause: string | null) =>
    `${wage} a year for ${years} ${years === 1 ? 'year' : 'years'}. The clubs agree a fee of ${fee}; you are paid a share when you sign.${clause ? ` A release clause of ${clause}.` : ''}`,
  national: (side: string, caps: number, tournaments: number, titles: number) =>
    `${side.charAt(0).toUpperCase() + side.slice(1)}: ${caps} ${caps === 1 ? 'cap' : 'caps'}${tournaments > 0 ? `, ${tournaments} ${tournaments === 1 ? 'tournament' : 'tournaments'}, ${titles} won` : ''}.`,
  totals: (transfers: number, loans: number, fees: string) => `${transfers} ${transfers === 1 ? 'transfer' : 'transfers'} (fees of ${fees} between the clubs), ${loans} ${loans === 1 ? 'loan' : 'loans'}.`,
  blocked: { none: 'Not now.', gone: 'The offer has gone.', loan: 'Not while you are on loan.', prison: 'Not from where you are.', between: 'Choices wait until the year is over.' } as Record<string, string>,
} as const;

// ── Batch 8: social media ────────────────────────────────────────────────────

/** How each platform pays, in words, from the followers it asks for. */
export const SOCIAL_PAY_WORDS: Record<string, (threshold: number) => string> = {
  ad_share: (n) => `Shares its ad money with you once you pass ${n.toLocaleString('en-US')} followers.`,
  subscriptions: (n) => `Pays through subscriptions and donations from ${n.toLocaleString('en-US')} followers.`,
  creator_fund: (n) => `Pays from its creator fund once you pass ${n.toLocaleString('en-US')} followers.`,
  ad_reads: (n) => `Pays for ad reads once you pass ${n.toLocaleString('en-US')} listeners.`,
  premium_share: (n) => `Pays a share to accounts people answer, from ${n.toLocaleString('en-US')} followers.`,
  brand_deals: (n) => `Pays through brand deals from ${n.toLocaleString('en-US')} followers.`,
};

/** The pay models as a line on the Money tab. */
export const SOCIAL_MODEL_LABELS: Record<string, string> = {
  ad_share: 'Ad share',
  subscriptions: 'Subscriptions and donations',
  creator_fund: 'Creator fund',
  ad_reads: 'Ad reads',
  premium_share: 'Premium share',
  brand_deals: 'Brand deals and sponsorships',
};

export const SOCIAL_HANDLE_ISSUES = {
  empty: 'Type a handle.',
  short: 'That is too short.',
  long: 'That is too long.',
  chars: 'Use only letters, numbers, dots and underscores.',
  edges: 'A handle cannot start or end with a dot or an underscore.',
  repeat: 'No two dots or underscores in a row.',
  digits: 'A handle cannot be only numbers.',
  reserved: 'That handle is kept for the platform.',
  blocked: 'That handle is not allowed.',
} as const;

export const SOCIAL_OPEN_BLOCK_LABELS = {
  unknown: 'Not open to you.',
  niche: 'Pick what the account is about.',
  handle: 'Pick a handle that is allowed.',
  have: 'You have an account here.',
  prison: 'Not from prison.',
  parent: 'A parent has to be in your life to set it up with you.',
} as const;

export const socialAgeBlock = (age: number): string => `You can join at ${age}.`;

export const SOCIAL_POST_BLOCK_LABELS = {
  none: 'No account here.',
  prison: 'Not from prison.',
  budget: 'No more this year.',
} as const;

export const SOCIAL_CROSS_BLOCK_LABELS = {
  none: 'You need both accounts.',
  same: 'Pick two different accounts.',
  prison: 'Not from prison.',
  private: 'Both accounts have to be public.',
  small: 'Not enough followers yet.',
  budget: 'No more this year.',
  done: 'Already done this year.',
} as const;

export const SOCIAL_COLLAB_BLOCK_LABELS = {
  none: 'No account here.',
  prison: 'Not from prison.',
  private: 'The account has to be public.',
  person: 'Not someone you can make something with.',
  budget: 'No more this year.',
} as const;

export const SOCIAL_PROMOTE_BLOCK_LABELS = {
  none: 'No account here.',
  prison: 'Not from prison.',
  private: 'The account has to be public.',
  small: 'Not enough followers yet.',
  career: 'You have no career to promote.',
  work: 'Nothing new to promote yet.',
  budget: 'No more this year.',
  done: 'Already done this year.',
} as const;

export const SOCIAL_TONE_LABELS = { safe: 'Play it safe', bold: 'Say the bold thing' } as const;
export const SOCIAL_TONE_NOTES = {
  safe: 'Steady. The usual reach, and few surprises.',
  bold: 'Reaches further and goes viral more often, and is likelier to land with someone it was not meant for.',
} as const;

export const SOCIAL_OUTCOME_LABELS = { flat: 'It sank', steady: 'It did its job', strong: 'It landed', viral: 'It went viral' } as const;

export const SOCIAL_CONTROVERSY_WORDS = {
  brewing: 'A row is brewing about something you posted.',
  cancelled: 'You were cancelled, and are still winning back what you lost.',
} as const;

/** "1 post left this year" / "7 posts left this year". */
export function postsLeftWords(left: number, noun: string, plural: string): string {
  return left === 0 ? `No ${plural} left this year` : `${left} ${left === 1 ? noun : plural} left this year`;
}


// ----- God mode (G1, docs/expansion.md): the switch, the editor and the sentence for every refusal -----

export const GOD_MODE_LABELS = {
  settingsTitle: 'God mode',
  switchLabel: 'God mode',
  switchNote: 'Edit yourself and anyone in your life: stats, looks, relationships, jobs, money and more. Edits can’t be undone, and a life edited this way looks like any other. Nothing else in the game changes.',
  confirmTitle: 'Switch on God mode?',
  confirmBody: 'You’ll be able to edit yourself and the people in your life between years. Edits can’t be undone, and nothing marks a life you’ve edited. The game still refuses changes that break its rules.',
  confirmYes: 'Switch it on',
  editButton: 'Edit (god mode)',
  editBlocked: 'Finish this year’s events first',
  editorTitleSelf: 'Edit you',
  save: 'Save changes',
  saveCount: (n: number) => (n === 0 ? 'Save changes' : `Save changes (${n})`),
  revert: 'Revert',
  saved: 'Saved',
  cantSave: 'Can’t save that',
  cantSaveNote: 'Nothing was changed. Fix these and save again:',
  details: 'Details',
  noChanges: 'Nothing to save yet.',
  back: 'Back',
  moveWarning: 'Moving ends your job.',
  moneyNow: (from: string, to: string) => `${from} → ${to}`,
  ageSelf: 'Your age can’t be edited. It is how many years you have lived, and everything else hangs from it.',
  ageRange: (min: number, max: number) => `Between ${min} and ${max}`,
  age: 'Age',
  none: 'None',
  addCondition: 'Add a condition',
  addTrouble: 'Add an illness or addiction',
  addLanguage: 'Add a language',
  addCitizenship: 'Add a citizenship',
  addDebt: 'Add a debt',
  remove: 'Remove',
  native: 'Native',
  treated: 'Treated',
  named: 'Named (diagnosed)',
  setValue: 'Set',
  hiddenNote: 'Hidden: it hasn’t shown itself yet. Clear it to say nothing waits to surface.',
  stepDown: 'Less',
  stepUp: 'More',
  chooseCity: 'Choose a city',
  chooseJob: 'Choose a job',
  noJob: 'No job',
  level: 'Level',
  freeWord: 'One word of your own',
  forgiveNote: 'A debt you remove is forgiven.',
  lockedDebtNote: 'Debts for a home, a vehicle or a business can only be changed in the game.',
  firstCitizenship: 'The first stays.',
} as const;

/** The groups of the editor (each is a section the refusals point at). */
export const GOD_AREA_LABELS: Record<string, string> = {
  name: 'Name',
  identity: 'Identity',
  latent: 'Hidden identity',
  looks: 'Looks',
  appearance: 'Looks',
  stats: 'Stats',
  personality: 'Personality',
  values: 'Hidden values',
  conditions: 'Health',
  troubles: 'Health',
  neuro: 'Health',
  relationship: 'Relationship',
  work: 'Job and wealth',
  wealth: 'Job and wealth',
  cityId: 'City',
  faith: 'Faith',
  languages: 'Languages',
  citizenships: 'Citizenships',
  money: 'Money',
  birthYear: 'Age',
  target: 'This edit',
};

export const GOD_STAT_LABELS = {
  health: 'Health',
  happiness: 'Happiness',
  smarts: 'Smarts',
  fitness: 'Fitness',
  stress: 'Stress',
  mood: 'Mood',
  moodBase: 'Usual mood',
} as const;

export const GOD_VALUE_LABELS = {
  luck: 'Luck',
  reputation: 'Reputation',
  geneticRisk: 'Gene risk',
  vice: 'Vice',
  innerConflict: 'Inner conflict',
  happinessBaseline: 'Happiness baseline',
} as const;

export const GOD_RELATIONSHIP_KIND_LABELS = {
  friend: 'Friend',
  acquaintance: 'Acquaintance',
  partner: 'Partner',
  fiance: 'Fiancé',
  spouse: 'Spouse',
  ex: 'Ex',
} as const;

export const GOD_STATUS_LABELS = { active: 'In your life', estranged: 'Estranged', ended: 'Faded out' } as const;

/** The same band words the game uses, with the number beside them: "good · 72". */
export function godScoreLine(value: number): string {
  const words = value < 20 ? 'very low' : value < 40 ? 'low' : value < 60 ? 'medium' : value < 80 ? 'high' : 'very high';
  return `${words} · ${value}`;
}

const AGE_FIXED_REASONS: Record<string, (name: string) => string> = {
  self: () => GOD_MODE_LABELS.ageSelf,
  family: (n) => `${n} is family or a teacher, so their age is fixed.`,
  place: (n) => `${n} is part of your work or school, so their age is fixed.`,
  child: (n) => `${n} is a child of yours (or of your child), so their age is fixed.`,
  dead: (n) => `${n} has died.`,
  guardian: (n) => `${n} looks after you, so their age is fixed.`,
  unknown: (n) => `${n}’s age can’t be edited.`,
};

/** Why a person’s age can’t be edited, by the engine’s reason. */
export function ageFixedSentence(reason: string | undefined, name: string): string {
  return (AGE_FIXED_REASONS[reason ?? 'unknown'] ?? AGE_FIXED_REASONS.unknown!)(name);
}

/**
 * The sentence for a refusal (docs/expansion.md, "Validation and refusal reasons"). `nameOf` gives the name of a person by
 * id; a refusal about you carries no person. No pronouns are used for anyone.
 */
export function refusalSentence(r: EditRefusal, nameOf: (personId: string) => string): string {
  const who = r.person !== undefined ? nameOf(r.person) : 'You';
  const f = r.facts;
  const text = (key: string) => String(f[key] ?? '');
  const sentences: Record<RefusalCode, () => string> = {
    not_between_years: () => 'Edits can only be made between years. Finish this year’s events first.',
    card_open: () => 'Close the open card first.',
    life_over: () => 'This life is over.',
    invalid_value: () => `${GOD_AREA_LABELS[r.area] ?? r.area}${r.field ? ` (${r.field})` : ''}: ${text('message')}`,
    too_many_fields: () => `That is more than ${text('max')} changes at once. Save fewer at a time.`,
    too_large: () => 'That edit is too large to save.',
    nothing_changed: () => GOD_MODE_LABELS.noChanges,
    unknown_id: () => 'That choice isn’t part of this game.',
    field_unavailable: () => (r.person !== undefined ? `That can’t be edited for ${who}.` : 'That can’t be edited for you.'),
    minor_romance: () =>
      r.area === 'birthYear'
        ? `That age would make ${who} under ${text('age')} when the romance began.`
        : f.you !== undefined
          ? `You are under ${text('age')}, so romance isn’t possible.`
          : `${who} is under ${text('age')}, so romance isn’t possible.`,
    family_kind: () => `${who} is family (or a teacher), so what they are to you can’t be changed, and nobody becomes family.`,
    place_kind: () => `${who} can’t become a coworker, boss or classmate: those come from your job and school.`,
    second_partner: () => `${who} can’t be a second partner. You can have only one at a time.`,
    no_attraction: () => `${who} and you would both need to be attracted to each other.`,
    taken: () => `${who} already has a partner.`,
    partner_status: () => (f.family !== undefined ? `${who} is family and can’t fade out of your life.` : `A partner can’t be estranged or faded out. ${who} would have to stop being your partner first.`),
    dead_person: () => `${who} has died. Only their name and the words for their gender can change.`,
    age_fixed: () => ageFixedSentence(text('reason'), who),
    age_bounds: () => `${who} can be between ${text('minAge')} and ${text('maxAge')}, given what has happened in their life.`,
    lives_with_you: () => `${who} lives with you. Move yourself, or change the relationship so they no longer do.`,
    works_with_you: () => `${who} is part of your work or school, so they stay in your city. Make them a friend first.`,
    move_other_country: () => 'Moving to another country is emigration, which only the game can do.',
    move_minor: () => 'You are too young to move out on your own.',
    move_owned_home: () => 'You own your home. Sell it first.',
    move_probation: () => 'You are on probation and have to stay where you are.',
    move_prison: () => 'You are in prison.',
    move_abroad: () => 'You are on a temporary stay abroad.',
    job_requirements: () => `${who === 'You' ? 'You don’t' : `${who} doesn’t`} meet the requirements for ${text('job')}.`,
    job_retired: () => `${who === 'You' ? 'You are' : `${who} is`} retired.`,
    job_prison: () => `${who === 'You' ? 'You are' : `${who} is`} in prison.`,
    job_vehicle: () => `${text('job')} needs a vehicle where you live.`,
    job_language: () => `${who} doesn’t speak the language ${text('job')} needs here.`,
    job_school: () => 'You are still in school.',
    job_status: () => 'Regular jobs are closed to you without papers.',
    job_age: () => `Work starts at ${text('age')}.`,
    money_range: () => `Between ${money(Number(f.min ?? 0))} and ${money(Number(f.max ?? 0))}.`,
    debt_locked: () => GOD_MODE_LABELS.lockedDebtNote,
    debt_kind: () => 'That kind of debt can’t be set here.',
    child_debt: () => 'Children don’t have debts.',
    no_native_language: () => 'At least one language has to be native.',
    language_duplicate: () => 'A language is listed twice.',
    citizenship_empty: () => 'At least one citizenship is needed.',
    citizenship_duplicate: () => 'A citizenship is listed twice.',
    citizenship_first: () => `The first citizenship (${text('country')}) stays.`,
    citizenship_dual: () => `${text('country')} doesn’t allow another citizenship beside it.`,
    talent_missing: () => 'A talent can only be found if there is one.',
    condition_duplicate: () => 'That condition is listed twice.',
    condition_age: () => `That can’t be named before age ${text('age')}.`,
    trouble_limit: () => `At most ${text('max')} illnesses or addictions at once.`,
    faith_strength: () => 'A faith needs some belief, and having no faith means none.',
    latent_faith_same: () => 'The hidden pull is toward the faith already held.',
    carrying: () => `${who === 'You' ? 'You are' : `${who} is`} carrying a pregnancy, so can’t be set to not carry.`,
    appearance: () => 'One word per group, and one of your own.',
    child_traits: () => 'A child keeps all six traits.',
    invariant: () => `That would break a rule of the game. ${GOD_MODE_LABELS.details}: ${text('message')}`,
    internal: () => `Something went wrong, and nothing was changed. ${text('message')}`,
  };
  return sentences[r.code]();
}
