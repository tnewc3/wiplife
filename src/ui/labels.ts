/** Player-facing words for engine values. UI copy only; no game rules here. */
import type { ActionId, RomanceStatus } from '../content/schemas';
import type { FamilyMember, PeopleGroupId, PersonRow } from '../engine/selectors';
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
