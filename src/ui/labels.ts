/** Player-facing words for engine values. UI copy only; no game rules here. */
import type { FamilyMember } from '../engine/selectors';
import type { FamilyWealth, GenderCategory, LifeStage, Personality, Stats } from '../engine/types';

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

const RELATIVE_LABELS: Record<string, Record<GenderCategory, string>> = {
  parent: { woman: 'Mother', man: 'Father', nonbinary: 'Parent' },
  stepparent: { woman: 'Stepmother', man: 'Stepfather', nonbinary: 'Stepparent' },
  grandparent: { woman: 'Grandmother', man: 'Grandfather', nonbinary: 'Grandparent' },
  sibling: { woman: 'Sister', man: 'Brother', nonbinary: 'Sibling' },
};

export function relativeLabel(member: FamilyMember): string {
  return RELATIVE_LABELS[member.relationship.kind]?.[member.person.identity.genderCategory] ?? member.relationship.kind;
}

export function ageLabel(age: number): string {
  if (age <= 0) return 'Newborn';
  return age === 1 ? '1 year old' : `${age} years old`;
}
