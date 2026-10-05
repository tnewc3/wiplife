/**
 * Born-with conditions (M1, docs/expansion.md): ADHD and neurodivergence.
 * They are partly inherited: the chance you are born with one is the
 * population rate, higher for each biological parent who has it (parents,
 * siblings and your own children carry them too: Person.neuro). Before a
 * diagnosis they show only in how your personality starts out, in your stats
 * and in events. Numbers: balance/mental-health.yaml neuro.
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt } from '../random';
import { chance, nextInt, type RngState } from '../rng';
import type { Id, LifeState, Personality } from '../types';

/** The ids of the born-with conditions, in id order. */
export function neuroIds(content: ContentBundle): Id[] {
  return Object.keys(content.balance.mentalHealth.neuro)
    .filter((id) => content.conditions[id]?.kind === 'neuro' && !content.conditions[id]!.retired)
    .sort();
}

/** The born-with conditions someone is born with, given the ones their biological parents have (a list per parent). */
export function rollNeuro(rng: RngState, content: ContentBundle, parents: readonly (readonly Id[] | undefined)[]): Id[] {
  const out: Id[] = [];
  for (const id of neuroIds(content)) {
    const n = content.balance.mentalHealth.neuro[id]!;
    const affected = parents.filter((p) => p?.includes(id)).length;
    if (chance(rng, Math.min(1, n.rate * (1 + n.inheritMult * affected)))) out.push(id);
  }
  return out;
}

/**
 * Gives the character the born-with conditions (rolled by rollNeuro) at birth:
 * a severity, and the shift in personality that is how they show before anyone
 * names them. Only ever called when a life is created (or an heir takes over).
 */
export function giveNeuro(state: LifeState, ids: readonly Id[], content: ContentBundle): void {
  for (const id of ids) {
    const n = content.balance.mentalHealth.neuro[id];
    if (!n || state.health.conditions.some((c) => c.conditionId === id)) continue;
    state.health.conditions.push({ conditionId: id, since: state.birthYear, severity: nextInt(state.rng, n.severity.min, n.severity.max), treated: false });
    for (const [trait, shift] of Object.entries(n.traits) as [keyof Personality, number][]) {
      state.character.personality[trait] = clampInt(state.character.personality[trait] + shift, 0, 100);
    }
  }
}
