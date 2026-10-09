/** Player-facing words for engine values. UI copy only; no game rules here. */
import type {
  ActionId,
  ConditionKind,
  CredentialType,
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
  Tier,
  TieKindId,
  TieStatusId,
} from '../content/schemas';
import type { PetPersonalityId, TeenFocusId } from '../content/schemas';
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
import type { FamilyWealth, GenderCategory, JobEnd, LifeStage, Personality, Reaction, RecordOutcome, RelationshipKind, Stats } from '../engine/types';

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
  partner: { woman: 'Girlfriend', man: 'Boyfriend', nonbinary: 'Partner' },
  fiance: { woman: 'Fiancée', man: 'Fiancé', nonbinary: 'Fiancé' },
  spouse: { woman: 'Wife', man: 'Husband', nonbinary: 'Spouse' },
  ex: same('Ex'),
  friend: same('Friend'),
  coworker: same('Coworker'),
  boss: same('Boss'),
  classmate: same('Classmate'),
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
  romance: 'Love',
  friends: 'Friends',
  work: 'Work',
};

/** Shown when a group has nobody in it. */
export const PEOPLE_GROUP_EMPTY: Record<PeopleGroupId, string> = {
  family: 'No family.',
  children: 'No children.',
  romance: 'No one right now.',
  friends: 'No friends yet.',
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

/** Whole dollars as "$12,300" or "−$500". */
export function money(amount: number): string {
  const text = `$${Math.abs(amount).toLocaleString('en-US')}`;
  return amount < 0 ? `−${text}` : text;
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
  auto: 'Car loan',
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
  bankruptcy: 'No bank will give you a mortgage so soon after a bankruptcy.',
} as const;

/** College tiers. */
export const TIER_LABELS: Record<Tier, string> = {
  community: 'Community college',
  state: 'State university',
  elite: 'Elite university',
};

export const PROGRAM_LABELS: Record<Program, string> = {
  elementary: 'Elementary school',
  middle: 'Middle school',
  high: 'High school',
  college: 'College',
  trade: 'Trade school',
  grad: 'Grad school',
};

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** "Kindergarten", "3rd grade", "12th grade". */
export function gradeLevelLabel(level: number): string {
  return level <= 0 ? 'Kindergarten' : `${ordinal(level)} grade`;
}

/** "Year 2 of 4". */
export function programYearLabel(year: number, lengthYears: number): string {
  return `Year ${year} of ${lengthYears}`;
}

/** Where you are in school, for the Life tab: "In 10th grade", "Studying Nursing at Prairie State University". */
export function schoolStatusLine(school: SchoolLine): string {
  if (school.gradeLevel !== null) return school.gradeLevel <= 0 ? 'In kindergarten' : `In ${gradeLevelLabel(school.gradeLevel)}`;
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

const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  hs_diploma: 'High school diploma',
  ged: 'GED',
  associate: 'Associate degree',
  bachelor: 'Bachelor’s degree',
  trade_license: 'Trade license',
  grad: 'Graduate degree',
};

/** "Bachelor’s degree in nursing", "Electrician's license", "Law degree". */
export function credentialLabel(c: CredentialView): string {
  if ((c.type === 'associate' || c.type === 'bachelor') && c.field) return `${CREDENTIAL_LABELS[c.type]} in ${c.field}`;
  if ((c.type === 'trade_license' || c.type === 'grad') && c.field) return asLabel(c.field);
  return CREDENTIAL_LABELS[c.type];
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
export const APPLY_BLOCK_LABELS: Record<ApplyBlock, string> = {
  age: 'You can apply in your last year of high school.',
  enrolled: 'You can apply when you’re in your last year, or out of school.',
  highSchool: 'Needs a high school diploma or GED.',
  bachelor: 'Needs a bachelor’s degree.',
  major: 'Needs a bachelor’s in a related major.',
  tried: 'You already applied this year.',
  holding: 'You already have a place here.',
  unknown: 'Not available.',
};

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

export const ORIGIN_LABELS: Record<'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step', string> = {
  birth: 'Your child',
  adopted: 'Adopted',
  ivf: 'Your child, through IVF',
  surrogacy: 'Your child, through surrogacy',
  step: 'Stepchild',
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
  partner: 'Partner',
  fiance: 'Fiancé(e)',
  spouse: 'Spouse',
  ex: 'Ex',
  friend: 'Friend',
  coworker: 'Coworker',
  boss: 'Boss',
  classmate: 'Classmate',
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
};

export const VACATION_BLOCK_LABELS: Record<VacationBlock, string> = {
  age: 'You have to be old enough to own a home.',
  limit: 'You own as many vacation homes as you can keep.',
  savings: 'You don’t have enough saved for the down payment and closing costs.',
  bankruptcy: 'Lenders won’t say yes so soon after a bankruptcy.',
  income: 'Your payments on both homes would be more than a lender will allow for your income.',
  prison: 'Not while you are in prison.',
  unknown: 'Not available.',
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
