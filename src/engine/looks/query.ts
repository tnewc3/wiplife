/**
 * Looks (P1): every character and person has a look. It is stored on them (`look`) once it is set down: at creation, when a
 * child is born, by the yearly looks step (./step.ts) or by a save upgrade. Until then it is worked out from the life's seed
 * and the person's id with a generator of its own, and always comes out the same, so the screens can ask for anyone's look
 * at any time and the yearly step only makes it permanent.
 */
import type { ContentBundle } from '../../content/schemas';
import { createRng } from '../rng';
import type { Id, LifeState, Look, Person } from '../types';
import { lookFromDescriptors } from './descriptors';
import { bodyFor, completeLook, rollLook } from './generate';

export const YOU = 'you';
type Subject = typeof YOU | Id;

/** The biological parents' subjects of someone, as far as the people you know show. */
function parentSubjects(state: LifeState, subject: Subject): Subject[] {
  // You are rolled first (your hair and eyes are your descriptors); your parents and everyone born to the family look like you.
  if (subject === YOU) return [];
  // Your parents' looks are built around yours (the family is generated around you).
  if (state.relationships[subject]?.kind === 'parent' && !state.people[subject]?.child) return [YOU];
  const person = state.people[subject];
  if (!person) return [];
  const child = person.child;
  if (child) {
    if (child.origin === 'adopted' || child.origin === 'step') return [];
    if (child.origin === 'grandchild') return person.grandchild && state.people[person.grandchild.parentId] ? [person.grandchild.parentId] : [];
    return [YOU, ...(child.otherParentId !== undefined && state.people[child.otherParentId] ? [child.otherParentId] : [])];
  }
  if (person.grandchild) return state.people[person.grandchild.parentId] ? [person.grandchild.parentId] : [];
  if (state.relationships[subject]?.kind === 'sibling') {
    return Object.values(state.relationships)
      .filter((r) => r.kind === 'parent' && state.people[r.personId])
      .map((r) => r.personId)
      .sort()
      .slice(0, 2);
  }
  return [];
}

function lookOf(state: LifeState, subject: Subject, content: ContentBundle, seen: Set<Subject>): Look {
  const stored = subject === YOU ? state.character.look : state.people[subject]?.look;
  if (stored) return stored;
  if (seen.has(subject)) throw new Error(`Looks: ${subject} is its own ancestor`);
  seen.add(subject);
  const parents = parentSubjects(state, subject).map((p) => lookOf(state, p, content, seen));
  seen.delete(subject);
  const rng = createRng(`${state.seed}:look:${subject}`);
  const category = (subject === YOU ? state.character.identity : state.people[subject]!.identity).genderCategory;
  const look = rollLook(rng, content, bodyFor(rng, category, content), parents);
  // Your hair and eye color are your descriptors' (text a character has always had); the portrait agrees with them.
  return subject === YOU ? { ...look, ...lookFromDescriptors(state.character.appearance.descriptors, content) } : look;
}

/** Your look: stored, or worked out. */
export function yourLook(state: LifeState, content: ContentBundle): Look {
  return lookOf(state, YOU, content, new Set());
}

/** A person's look: stored, or worked out. */
export function personLook(state: LifeState, id: Id, content: ContentBundle): Look {
  return lookOf(state, id, content, new Set());
}

/** The age a person shows at: now, or at death. */
export function personAge(state: LifeState, person: Person): number {
  return Math.max(0, (person.alive ? state.currentYear : (person.deathYear ?? state.currentYear)) - person.birthYear);
}

/** Your look at the start of a custom life: what the player chose, and a roll for the rest. */
export function customLook(state: LifeState, content: ContentBundle, chosen: Partial<Look> | undefined): Look {
  const rng = createRng(`${state.seed}:look:${YOU}`);
  const rolledBody = bodyFor(rng, state.character.identity.genderCategory, content);
  // What the player chose, then the hair and eyes their descriptors name, then a roll for the rest.
  return completeLook(rng, content, chosen?.body ?? rolledBody, { ...lookFromDescriptors(state.character.appearance.descriptors, content), ...chosen });
}
