/**
 * The teen years (T1): small read-only helpers every part of the engine
 * shares: whether a life is in its teen years, your crowd, who the parents at
 * home are, whether you can drive. Numbers: balance/teen.yaml.
 */
import type { CliqueDef, ContentBundle, RuleDomainId, TeenFocusId } from '../../content/schemas';
import { whereabouts } from '../presence';
import { isFamilyKind } from '../relationships';
import type { Id, LifeState, Person, TeenClique, TeenRule, TeenState } from '../types';

export const emptyTeen = (): TeenState => ({
  school: null,
  cliques: [],
  nextClique: 1,
  member: null,
  turnedAway: {},
  standing: 40,
  focus: null,
  focusYears: { school: 0, friends: 0, work: 0, passion: 0 },
  passion: 0,
  license: { stage: 'none', lessons: 0, fails: 0 },
  job: null,
  activities: [],
  home: null,
  penalties: [],
  totals: { broken: 0, caught: 0, negotiated: 0, won: 0 },
  seenRecords: 0,
});

/**
 * The teen state of a life that starts at this age (an heir): nothing yet,
 * except that a grown heir is taken to hold a license (an adult is, unless
 * they say otherwise through the lessons and the test, like anyone).
 */
export function startingTeen(age: number, year: number, content: ContentBundle): TeenState {
  const teen = emptyTeen();
  if (age >= content.balance.relationships.adultAge) teen.license = { stage: 'licensed', since: year, lessons: 0, fails: 0 };
  return teen;
}

/** The teen years: from the age the teen systems begin until the adult age. */
export function inTeenYears(state: LifeState, content: ContentBundle): boolean {
  const age = state.character.age;
  return age >= content.balance.teen.ages.from && age < content.balance.relationships.adultAge;
}

/** The definition of a crowd, or undefined (a retired or missing one). */
export function cliqueDef(content: ContentBundle, defId: Id): CliqueDef | undefined {
  return content.cliques[defId];
}

/** A crowd at your school by its id. */
export function cliqueById(state: LifeState, id: Id | undefined): TeenClique | undefined {
  return id === undefined ? undefined : state.teen.cliques.find((c) => c.id === id);
}

/** The crowd you belong to. */
export function myClique(state: LifeState): TeenClique | undefined {
  return cliqueById(state, state.teen.member?.cliqueId);
}

/** The crowd your crowd is at odds with at school. */
export function rivalClique(state: LifeState, clique: TeenClique | undefined = myClique(state)): TeenClique | undefined {
  return clique?.rival === undefined ? undefined : cliqueById(state, clique.rival);
}

/** The living members of a crowd who are still in your life. */
export function livingMembers(state: LifeState, clique: TeenClique | undefined): Id[] {
  if (!clique) return [];
  return clique.members.filter((id) => {
    const p = state.people[id];
    const r = state.relationships[id];
    return p?.alive === true && r !== undefined && r.status !== 'ended';
  });
}

/** The people in your own crowd, or in the crowd it is at odds with. */
export function crowdMembers(state: LifeState, which: 'yours' | 'rival'): Id[] {
  const mine = myClique(state);
  return livingMembers(state, which === 'yours' ? mine : rivalClique(state, mine));
}

/** The name of a crowd as text uses it ("Back Bleacher"); empty when it has none. */
export function cliqueName(content: ContentBundle, clique: TeenClique | undefined): string {
  return clique ? (cliqueDef(content, clique.defId)?.name ?? '') : '';
}

/** Where this year's energy goes: the focus chosen for this year, else 'none'. */
export function focusOf(state: LifeState): TeenFocusId | 'none' {
  const f = state.teen.focus;
  return f !== null && f.year === state.currentYear ? f.id : 'none';
}

/** You have your driver's license. */
export function hasLicense(state: LifeState): boolean {
  return state.teen.license.stage === 'licensed';
}

/** The parents (and the guardian) you live with, who set the rules at home: living, in your household. */
export function householdParents(state: LifeState, content: ContentBundle): Person[] {
  const found: Person[] = [];
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person || !person.alive || rel.status === 'ended') continue;
    const isParent = rel.kind === 'parent' || rel.kind === 'stepparent';
    const isGuardian = state.housing.guardianId === id;
    if (!isParent && !isGuardian) continue;
    if (isParent && isFamilyKind(rel.kind) && whereabouts(state, id, content) !== 'household') continue;
    found.push(person);
  }
  return found;
}

/** The house rule of a domain, if one is set. */
export function ruleOf(state: LifeState, domain: RuleDomainId): TeenRule | undefined {
  return state.teen.home?.rules.find((r) => r.ruleId === domain);
}

/** True when a penalty is in force this year. */
export function penaltyActive(state: LifeState, kind: 'grounded' | 'privilege', domain?: RuleDomainId): boolean {
  return state.teen.penalties.some((p) => p.kind === kind && p.until >= state.currentYear && (domain === undefined || p.domain === domain));
}

/** You are grounded this year. */
export const isGrounded = (state: LifeState): boolean => penaltyActive(state, 'grounded');
