/**
 * Invariants for the family (E2a): pregnancies and processes are possible
 * (between adults, a carrier who can carry), every child is a person with a
 * relationship of the right kind and valid data, parenting styles stay in
 * range, nobody under the adult age is a parent, and no child is ever in a
 * romantic relationship or a romance interaction.
 */
import type { ContentBundle } from '../../content/schemas';
import { isRomanticKind } from '../relationships';
import type { LifeState } from '../types';

export function familyFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const { adultAge } = content.balance.relationships;
  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };
  const f = state.family;

  const checkCarrier = (label: string, carrier: string) => {
    if (carrier === 'surrogate') return;
    if (carrier === 'you') {
      if (!state.character.canCarry) fail(`${label}: you carry a pregnancy but can't`);
      return;
    }
    const person = state.people[carrier];
    if (!person) fail(`${label}: the carrier ${carrier} is missing`);
    else if (!person.canCarry) fail(`${label}: ${carrier} carries a pregnancy but can't`);
  };

  const p = f.pregnancy;
  if (p) {
    if (p.startYear > state.currentYear || p.startYear < state.birthYear) fail('the pregnancy starts outside the life');
    if (p.startYear - state.birthYear < adultAge) fail(`a pregnancy began when you were under ${adultAge}`);
    checkCarrier('pregnancy', p.carrier);
    if (p.otherParentId !== undefined) {
      const other = state.people[p.otherParentId];
      if (!other) fail('the pregnancy names a missing other parent');
      else if (p.startYear - other.birthYear < adultAge) fail(`a pregnancy with someone under ${adultAge}`);
    }
    if ((p.how === 'trying' || p.how === 'unplanned') && p.carrier === 'surrogate') fail('a natural pregnancy with a surrogate');
    if (p.how === 'surrogacy' && p.carrier !== 'surrogate') fail('a surrogacy pregnancy carried by someone else');
    if (p.decision === 'pending' && p.how !== 'unplanned') fail('only an unplanned pregnancy waits for a decision');
  }
  const pr = f.process;
  if (pr) {
    if (pr.dueYear <= pr.startYear) fail('a family process is due before it starts');
    if (pr.startYear > state.currentYear) fail('a family process starts in the future');
    if (pr.carrier !== undefined) checkCarrier('process', pr.carrier);
    if (pr.otherParentId !== undefined && !state.people[pr.otherParentId]) fail('a family process names a missing other parent');
  }
  if (p && pr) fail('a pregnancy and a family process at once');
  if (f.support && !state.people[f.support.personId]) fail('child support names a missing person');
  for (const key of ['attempts', 'lostChildren', 'miscarriages'] as const) {
    if (!Number.isInteger(f[key]) || f[key] < 0) fail(`family.${key} must be a whole number of at least 0`);
  }

  let dead = 0;
  for (const [id, person] of Object.entries(state.people)) {
    const rel = state.relationships[id];
    const label = `child ${id}`;
    const isChildKind = rel?.kind === 'child' || rel?.kind === 'stepchild';
    if (person.child && !isChildKind) fail(`${label} has child data but is "${rel?.kind ?? 'unrelated'}"`);
    if (isChildKind && !person.child) fail(`${label} is your ${rel!.kind} without child data`);
    if (!isChildKind && rel?.parenting) fail(`${label} has a parenting style but isn't a child`);
    if (person.priorChildren !== undefined && isChildKind) fail(`${label} is a child with children of their own from before`);
    const kid = person.child;
    if (!kid || !rel) continue;
    if (!person.alive) dead++;
    for (const key of ['health', 'happiness', 'fitness', 'stress', 'geneticRisk'] as const) score(`${label}.${key}`, kid[key]);
    if (typeof kid.gpa !== 'number' || kid.gpa < 0 || kid.gpa > 4) fail(`${label}.gpa must be from 0 to 4`);
    for (const trait of ['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability'] as const) score(`${label}.traits.${trait}`, person.traits[trait]);
    if (kid.talent !== null && !content.talents[kid.talent]) fail(`${label} has an unknown talent "${kid.talent}"`);
    if (kid.otherParentId !== undefined && !state.people[kid.otherParentId]) fail(`${label} names a missing other parent`);
    if (kid.custody === 'other' && kid.otherParentId === undefined) fail(`${label} lives with an other parent they don't have`);
    if (rel.kind === 'child' && kid.origin !== 'adopted' && person.birthYear - state.birthYear < adultAge) fail(`${label} was born when you were under ${adultAge}`);
    if (kid.movedOutYear !== undefined && (kid.movedOutYear < person.birthYear || kid.movedOutYear > state.currentYear)) fail(`${label} moved out outside their life`);
    if (isRomanticKind(rel.kind)) fail(`${label} is in a romantic relationship`);
    if (rel.parenting) {
      score(`${label}.parenting.warmth`, rel.parenting.warmth);
      score(`${label}.parenting.strictness`, rel.parenting.strictness);
      score(`${label}.parenting.involvement`, rel.parenting.involvement);
    }
  }
  if (dead > f.lostChildren) fail(`${dead} children have died but only ${f.lostChildren} are counted`);
  return failures;
}
