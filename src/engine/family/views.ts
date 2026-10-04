/**
 * What the UI needs about the family (E2a), read through selectors: a
 * child's page (parenting style, school, how they're doing), the pregnancy
 * and any process under way for the Home screen, and the options under
 * More → Family with their costs and odds, plus custody and what children
 * cost for the Money tab.
 */
import type { ContentBundle, FamilyProcessKind, ParentingKey } from '../../content/schemas';
import type { Custody, Id, LifeState, Personality } from '../types';
import { carrierAge } from './carrying';
import { custodyHearings } from './custody';
import { livingChildren } from './children';
import { styleLevels, styleOf, type StyleLevel } from './parenting';
import { processView, type ProcessView } from './process';

export interface ChildView {
  stepchild: boolean;
  origin: 'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step';
  custody: Custody;
  /** The other parent's first name, if known. */
  otherParent: string | null;
  /** Where each parenting line sits (for words like "warm but strict"). */
  style: Record<ParentingKey, StyleLevel>;
  /** Grades this school year (0–4) while in school; null otherwise. */
  gpa: number | null;
  /** Their health, happiness, stress (0–100). */
  health: number;
  happiness: number;
  stress: number;
  traits: Partial<Personality>;
  movedOut: boolean;
}

/** A child's page data, or null for someone who isn't your child or stepchild. */
export function getChildView(state: LifeState, personId: Id, content: ContentBundle): ChildView | null {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  const d = person?.child;
  if (!person || !rel || !d) return null;
  const age = (person.deathYear ?? state.currentYear) - person.birthYear;
  const school = content.balance.education.school;
  const inSchool = age >= school.startAge && age < school.startAge + school.elementary + school.middle + school.high;
  const other = d.otherParentId === undefined ? undefined : state.people[d.otherParentId];
  return {
    stepchild: rel.kind === 'stepchild',
    origin: d.origin,
    custody: d.custody,
    otherParent: other ? other.name.first : null,
    style: styleLevels(styleOf(rel, content), content),
    gpa: inSchool && d.gpa > 0 ? d.gpa : null,
    health: d.health,
    happiness: d.happiness,
    stress: d.stress,
    traits: person.traits,
    movedOut: d.movedOutYear !== undefined,
  };
}

export interface FamilyOptionView extends ProcessView {
  /** You can start it now (no blocks). */
  available: boolean;
}

export interface PregnancyView {
  how: 'trying' | 'unplanned' | 'ivf' | 'surrogacy';
  /** You carry it, a surrogate does, or someone else (their first name). */
  carrier: 'you' | 'surrogate' | { name: string };
  otherName: string | null;
  /** The year the baby is due (the year after it began). */
  dueYear: number;
  plan: 'keep' | 'adoption' | 'pending';
}

export interface FamilyView {
  canCarry: boolean;
  pregnancy: PregnancyView | null;
  process: { kind: FamilyProcessKind; dueYear: number; yearsLeft: number } | null;
  options: FamilyOptionView[];
  /** Years of trying that haven't worked (0 when none). */
  attempts: number;
  children: { id: Id; name: string; age: number; stepchild: boolean; custody: Custody }[];
  /** Exes with children whose custody is still to be decided. */
  hearingsWaiting: number;
  support: { direction: 'pay' | 'receive'; name: string } | null;
}

export function getFamilyView(state: LifeState, content: ContentBundle): FamilyView {
  const f = state.family;
  const p = f.pregnancy;
  const nameOf = (id: Id | undefined) => (id !== undefined && state.people[id] ? state.people[id]!.name.first : null);
  return {
    canCarry: state.character.canCarry,
    pregnancy: p
      ? {
          how: p.how,
          carrier: p.carrier === 'you' || p.carrier === 'surrogate' ? p.carrier : { name: nameOf(p.carrier) ?? 'Your partner' },
          otherName: nameOf(p.otherParentId),
          dueYear: p.startYear + 1,
          plan: p.decision,
        }
      : null,
    process: f.process ? { kind: f.process.kind, dueYear: f.process.dueYear, yearsLeft: Math.max(0, f.process.dueYear - state.currentYear) } : null,
    options: (['adoption', 'ivf', 'surrogacy'] as const).map((kind) => {
      const view = processView(state, kind, content);
      return { ...view, available: view.blocks.length === 0 };
    }),
    attempts: f.attempts,
    children: livingChildren(state, true)
      .filter((c) => state.relationships[c.id]?.status !== 'ended')
      .map((c) => ({ id: c.id, name: c.name.first, age: state.currentYear - c.birthYear, stepchild: state.relationships[c.id]?.kind === 'stepchild', custody: c.child.custody })),
    hearingsWaiting: custodyHearings(state, content).length,
    support: f.support ? { direction: f.support.direction, name: nameOf(f.support.personId) ?? 'Their other parent' } : null,
  };
}

/** The carrier's age, for the odds text (kept here so the UI never reaches into the engine). */
export function carrierAgeOf(state: LifeState, content: ContentBundle): number | null {
  const p = state.family.pregnancy;
  if (!p || p.carrier === 'surrogate') return null;
  return carrierAge(state, p.carrier, content);
}
