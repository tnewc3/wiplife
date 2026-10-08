/**
 * Fan people (E6b): a superfan, a hater or a critic becomes a person in your
 * life: tagged, with a memory of how they came to you, how they feel about
 * you, and ties to the others of their kind (a fan club, a pile-on) and, for
 * a superfan, to one of your friends. Kept apart from the casting code, which
 * enrolls anyone it creates for a fan role.
 */
import type { ContentBundle, FameFanType } from '../../content/schemas';
import { clampInt } from '../random';
import { nextInt, pick, type RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { addTie, canTie, inCircle } from '../web/ties';

const MEMORY: Record<FameFanType, string> = { super: 'fan_super', hater: 'fan_hater', critic: 'fan_critic' };

/** The ages a new fan person can be: a young star's fans are their own age or so; no fan of anyone is ever romantic. */
export function fanAgeRange(state: LifeState, type: FameFanType, content: ContentBundle): { min: number; max: number } {
  const age = state.character.age;
  const adult = age >= content.balance.relationships.adultAge;
  if (type === 'critic') return { min: 25, max: adult ? 70 : 60 };
  return adult ? { min: 16, max: 70 } : { min: Math.max(8, age - 3), max: Math.min(17, age + 4) };
}

/** Makes an existing new person a fan of this kind: their tag, their feelings, a memory, the list and their ties. */
export function enrollFan(state: LifeState, id: Id, type: FameFanType, content: ContentBundle, rng: RngState): void {
  const f = state.fame;
  const person = state.people[id];
  const rel = state.relationships[id];
  if (!person || !rel) return;
  person.tags.push(`fan:${type}`);
  rel.affection = clampInt(content.balance.fame.people.affection[type] + nextInt(rng, -6, 6), 0, 100);
  if (type === 'super') rel.trust = clampInt(rel.trust + 10, 0, 100);
  rel.memories.push({ tag: MEMORY[type], year: state.currentYear });
  f.people[type].push(id);
  // Events can bring fans too, so the cap holds here: the longest-known fan of this kind drifts out of the list (never the one stalking you).
  const max = content.balance.fame.people.max;
  while (f.people[type].length > max) {
    const gone = f.people[type].find((other) => other !== id && other !== f.stalker?.id);
    if (gone === undefined) break;
    f.people[type] = f.people[type].filter((other) => other !== gone);
    const tags = state.people[gone]?.tags;
    if (tags) state.people[gone]!.tags = tags.filter((t) => t !== `fan:${type}`);
  }
  const year = state.currentYear;
  const same = f.people[type].filter((other) => other !== id && inCircle(state, other) && canTie(state, id, other));
  if (type !== 'critic' && same.length > 0) addTie(state.web, id, pick(rng, same), 'friends', type === 'super' ? 62 : 55, 'context', year);
  if (type === 'super') {
    const friends = Object.keys(state.relationships)
      .sort()
      .filter((p) => state.relationships[p]!.kind === 'friend' && inCircle(state, p) && canTie(state, id, p));
    if (friends.length > 0) addTie(state.web, id, pick(rng, friends), 'friends', 52, 'context', year);
  }
}

/** Forgets anyone removed from the life (a rejected cast). */
export function forgetFans(state: LifeState, ids: readonly Id[]): void {
  if (ids.length === 0) return;
  const f = state.fame;
  for (const type of ['super', 'hater', 'critic'] as const) f.people[type] = f.people[type].filter((id) => !ids.includes(id));
}
