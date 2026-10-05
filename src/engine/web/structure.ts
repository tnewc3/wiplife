/**
 * The ties your family's structure gives (E4): your parents with each other,
 * your siblings with each other and with your parents, your grandparents with
 * your parents, your partner and your ex with your children, and your
 * children with each other. They are made once for each pair that is in your
 * circle (a pair that already has a tie is left alone), so an old save, a new
 * life and an heir all get the same web from the same function.
 */
import type { ContentBundle, TieKindId } from '../../content/schemas';
import { isPartnerKind } from '../relationships';
import type { RngState } from '../rng';
import type { Id, LifeState, Relationship, WebState } from '../types';
import { getTie } from './query';
import { addTie, inCircle, startAffection } from './ties';

export interface Pair {
  a: Id;
  b: Id;
  kind: TieKindId;
}

/** The people in your circle with this relationship to you (any of the kinds), in id order. */
function ofKind(state: LifeState, ...kinds: Relationship['kind'][]): Id[] {
  return Object.keys(state.relationships)
    .sort()
    .filter((id) => kinds.includes(state.relationships[id]!.kind) && inCircle(state, id));
}

/** Every tie the family's structure calls for, whether or not it exists yet. */
export function structuralPairs(state: LifeState): Pair[] {
  const pairs: Pair[] = [];
  const add = (a: Id, b: Id, kind: TieKindId) => {
    if (a !== b) pairs.push({ a, b, kind });
  };
  const parents = ofKind(state, 'parent');
  const stepparents = ofKind(state, 'stepparent');
  const siblings = ofKind(state, 'sibling');
  const grandparents = ofKind(state, 'grandparent');
  const relatives = ofKind(state, 'relative');
  const children = ofKind(state, 'child', 'stepchild');

  // Your parents are together, unless they split. (A stepparent in an heir's life was the dead parent's spouse, not the other parent's.)
  if (parents.length === 2 && !state.flags.parents_split) add(parents[0]!, parents[1]!, 'married');
  // Your parents' children are your siblings; a stepparent is a parent to them too.
  for (let i = 0; i < siblings.length; i++) {
    for (let j = i + 1; j < siblings.length; j++) add(siblings[i]!, siblings[j]!, 'siblings');
    for (const p of [...parents, ...stepparents]) add(p, siblings[i]!, 'parentChild');
  }
  // Your grandparents are the parents of one of your parents (or, in an heir's life, of their aunts and uncles).
  const middle = parents.length > 0 ? parents : relatives;
  grandparents.forEach((g, i) => {
    if (middle.length > 0) add(g, middle[i % middle.length]!, 'parentChild');
  });
  for (let i = 0; i < relatives.length; i++) for (let j = i + 1; j < relatives.length; j++) add(relatives[i]!, relatives[j]!, 'siblings');
  // Your children are siblings; their other parent, your partner and your ex are parents to them.
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) add(children[i]!, children[j]!, 'siblings');
    const kid = state.people[children[i]!]!;
    for (const id of ofKind(state, 'partner', 'fiance', 'spouse')) add(id, children[i]!, 'parentChild');
    for (const id of ofKind(state, 'ex')) if (kid.child?.otherParentId === id) add(id, children[i]!, 'parentChild');
  }
  return pairs;
}

/**
 * Gives every structural pair without a tie its tie, in a stable order. Draws
 * the starting affection from `rng`. Returns how many it made.
 */
export function ensureStructure(state: LifeState, web: WebState, rng: RngState, content: ContentBundle, year: number): number {
  const start = content.balance.web.ties.start;
  const cur = { ...state, web };
  let made = 0;
  for (const p of structuralPairs(cur)) {
    if (getTie(web, p.a, p.b)) continue;
    // A couple needs adults: both parents (and a stepparent) always are, but check anyway.
    if (p.kind === 'married') {
      const adult = content.balance.relationships.adultAge;
      if ([p.a, p.b].some((id) => year - state.people[id]!.birthYear < adult)) continue;
    }
    addTie(web, p.a, p.b, p.kind, startAffection(rng, start[p.kind]), 'family', year);
    made += 1;
  }
  return made;
}

/** True when this person is one of your current partners (for callers that don't want to import relationship helpers). */
export const isYourPartner = (state: LifeState, id: Id): boolean => {
  const rel = state.relationships[id];
  return rel !== undefined && isPartnerKind(rel.kind) && rel.status === 'active';
};
