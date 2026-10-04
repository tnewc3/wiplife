/**
 * Wills (E2b): who your estate goes to, as percentage shares, written
 * through the "Write a will" action under More. A will names your spouse,
 * your children, other people you know, or a cause; its shares are whole
 * percents that add up to 100. Without one, the default shares apply
 * (./settle.ts, balance/family.yaml estate.default). A will can be rewritten
 * or cleared at any time between years.
 */
import type { ContentBundle } from '../../content/schemas';
import type { EstateLine, Id, LifeState, RelationshipKind, Will, WillShare } from '../types';

export interface WillCandidate {
  kind: 'person' | 'cause';
  id: Id;
  name: string;
  relation: EstateLine['relation'];
}

/** The name a person goes by in a settlement. */
export function fullName(person: { name: { first: string; last: string } }): string {
  return `${person.name.first} ${person.name.last}`;
}

/**
 * Everyone a will can name, in a fixed order: your spouse, your children,
 * your stepchildren, your parents and siblings, then the other people you
 * know (alive, still in your life), then the causes.
 */
export function willCandidates(state: LifeState, content: ContentBundle): WillCandidate[] {
  const order: RelationshipKind[] = ['spouse', 'fiance', 'partner', 'child', 'stepchild', 'parent', 'stepparent', 'sibling', 'grandparent', 'relative'];
  const rank = (kind: RelationshipKind) => {
    const i = order.indexOf(kind);
    return i < 0 ? order.length : i;
  };
  const people: WillCandidate[] = Object.keys(state.relationships)
    .sort((a, b) => rank(state.relationships[a]!.kind) - rank(state.relationships[b]!.kind) || a.localeCompare(b, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      if (!person || !person.alive || rel.status === 'ended') return [];
      return [{ kind: 'person' as const, id, name: fullName(person), relation: rel.kind }];
    });
  const causes = Object.keys(content.registries.estate.causes)
    .sort()
    .map((id) => ({ kind: 'cause' as const, id, name: content.registries.estate.causes[id]!.name, relation: 'cause' as const }));
  return [...people, ...causes];
}

/** You can write (or clear) a will now: an adult, between years. */
export function canWriteWill(state: LifeState, content: ContentBundle): boolean {
  return state.phase === 'yearStart' && state.character.age >= content.balance.relationships.adultAge;
}

/**
 * Checks proposed shares against the people and causes that exist now: each a
 * whole percent from 1 to 100, no one twice, at most the balance limit, and
 * together exactly 100. An empty list is valid and clears the will. Returns
 * the cleaned shares, or null when invalid.
 */
export function parseShares(input: unknown, state: LifeState, content: ContentBundle): WillShare[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0) return [];
  if (input.length > content.balance.family.estate.maxShares) return null;
  const candidates = willCandidates(state, content);
  const seen = new Set<string>();
  const shares: WillShare[] = [];
  let total = 0;
  for (const raw of input as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { kind, id, percent } = raw as Record<string, unknown>;
    if ((kind !== 'person' && kind !== 'cause') || typeof id !== 'string' || typeof percent !== 'number') return null;
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) return null;
    const key = `${kind}:${id}`;
    if (seen.has(key) || !candidates.some((c) => c.kind === kind && c.id === id)) return null;
    seen.add(key);
    total += percent;
    shares.push({ kind, id, percent });
  }
  return total === 100 ? shares : null;
}

/** Writes (or, with no shares, clears) the will. The caller has checked `canWriteWill` and validated the shares. */
export function writeWill(state: LifeState, shares: readonly WillShare[]): void {
  state.will = shares.length === 0 ? null : { shares: shares.map((s) => ({ ...s })), year: state.currentYear };
}

/** The will with shares to people who have died, or no longer exist, taken out and the rest scaled up to 100; null when nothing is left to follow. */
export function livingWill(will: Will | null, state: LifeState, content: ContentBundle): WillShare[] | null {
  if (!will) return null;
  const kept = will.shares.filter((s) => (s.kind === 'cause' ? content.registries.estate.causes[s.id] !== undefined : state.people[s.id]?.alive === true && state.relationships[s.id]?.status !== 'ended'));
  if (kept.length === 0) return null;
  const total = kept.reduce((sum, s) => sum + s.percent, 0);
  // Largest-remainder rounding, so the shares still add up to exactly 100.
  const scaled = kept.map((s, i) => ({ s, i, exact: (s.percent * 100) / total }));
  const out = scaled.map((x) => ({ ...x.s, percent: Math.floor(x.exact) }));
  let left = 100 - out.reduce((sum, s) => sum + s.percent, 0);
  for (const x of [...scaled].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.i - b.i)) {
    if (left <= 0) break;
    out[x.i]!.percent += 1;
    left -= 1;
  }
  return out.filter((s) => s.percent > 0);
}
