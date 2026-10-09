/**
 * Sanity checks on later life (L1): grandchildren are real people tied to a
 * child of yours, a grandchild you raise is your child, care and the warning
 * of a death are consistent with the life, and an amends record names a
 * source that exists.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

export function laterFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const adultAge = content.balance.relationships.adultAge;

  for (const [id, person] of Object.entries(state.people)) {
    const rel = state.relationships[id];
    const label = `grandchild ${id}`;
    if (rel?.kind === 'grandchild') {
      if (!person.grandchild) fail(`${label} has no link to a parent`);
      if (person.child) fail(`${label} has child data but is a grandchild, not raised by you`);
    }
    if (!person.grandchild) continue;
    const parent = state.people[person.grandchild.parentId];
    if (!parent) fail(`${label} names a missing parent`);
    else if (!(state.relationships[parent.id]?.kind === 'child' || state.relationships[parent.id]?.kind === 'stepchild')) fail(`${label}'s parent is not your child`);
    else if (person.birthYear - parent.birthYear < adultAge) fail(`${label} was born when their parent was under ${adultAge}`);
    if (rel && rel.kind !== 'grandchild' && !(rel.kind === 'child' && person.child?.origin === 'grandchild')) fail(`${label} is "${rel.kind}", not a grandchild or a grandchild you raise`);
    if (person.child && person.child.origin !== 'grandchild') fail(`${label} is raised by you but their origin is "${person.child.origin}"`);
  }
  const l = state.later;
  if (l.care !== null) {
    const care = l.care;
    if (care.since < state.birthYear || care.since > state.currentYear) fail('later.care.since is outside the life');
    if (care.option === 'family') {
      const p = care.providerId === undefined ? undefined : state.people[care.providerId];
      if (!p) fail('family care without someone providing it');
      else if (!p.alive && state.phase !== 'dead') fail('family care provided by someone who has died');
    } else if (care.providerId !== undefined) fail(`${care.option ?? 'unarranged'} care has a provider`);
    if (care.option === 'assisted' && state.housing.kind !== 'renting' && state.housing.kind !== 'incarcerated') fail('assisted care without assisted living as your home');
  }
  if (state.housing.assisted !== undefined) {
    if (state.housing.kind !== 'renting') fail(`assisted living in a "${state.housing.kind}" home`);
    if (state.housing.homeValue !== undefined) fail('assisted living with a home you own');
  }
  if (l.terminal !== null) {
    const t = l.terminal;
    if (t.since < state.birthYear || t.since > state.currentYear) fail('later.terminal.since is outside the life');
    if (!content.causes[t.causeId]) fail(`later.terminal names an unknown cause "${t.causeId}"`);
    if (t.conditionId !== undefined && !content.conditions[t.conditionId]) fail(`later.terminal names an unknown condition "${t.conditionId}"`);
    if (t.letters.length > content.balance.later.terminal.maxLetters) fail('later.terminal has more letters than allowed');
    if (t.visitors.length > content.balance.later.terminal.maxVisitors) fail('later.terminal has more visitors than allowed');
    for (const id of [...t.letters, ...t.visitors, ...(t.speakerId !== undefined ? [t.speakerId] : []), ...t.visits.map((v) => v.id)]) {
      if (!state.people[id]) fail(`later.terminal names a missing person ${id}`);
    }
    if (t.visits.map((v) => v.id).sort().join() !== [...t.visitors].sort().join()) fail('later.terminal visits do not match its visitors');
  }
  for (const a of l.amends) {
    if (!content.registries.later.amends.sources[a.source]) fail(`an amends record names an unknown source "${a.source}"`);
    if (a.personId !== undefined && !state.people[a.personId]) fail('an amends record names a missing person');
  }
  return failures;
}
