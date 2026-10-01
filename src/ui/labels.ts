/** Player-facing words for engine values. UI copy only; no game rules here. */
import type { ActionId, CredentialType, DebtKind, HousingKind, Lifestyle, Program, RomanceStatus, Tier } from '../content/schemas';
import type { ApplyBlock } from '../engine/education';
import type { CredentialView, FamilyMember, PeopleGroupId, PersonRow, SchoolLine } from '../engine/selectors';
import type { FamilyWealth, GenderCategory, LifeStage, Personality, RelationshipKind, Stats } from '../engine/types';

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
  sibling: { woman: 'Sister', man: 'Brother', nonbinary: 'Sibling' },
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
  romance: 'Love',
  friends: 'Friends',
  work: 'Work',
};

/** Shown when a group has nobody in it. */
export const PEOPLE_GROUP_EMPTY: Record<PeopleGroupId, string> = {
  family: 'No family.',
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

/** An interest rate: 0.065 → "6.5%". */
export function rateLabel(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

export const HOUSING_LABELS: Record<HousingKind, string> = {
  with_parents: 'Living with family',
  renting: 'Renting',
  owned: 'Homeowner',
  homeless: 'Without a home',
  incarcerated: 'In jail',
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
