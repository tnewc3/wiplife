/**
 * Remembering which parts of a life have already passed a check (the invariants). Life states are never changed
 * after Immer has finished them, so a person, relationship or list that is the same object as one already checked
 * healthy, in the same year, gives the same answer again. A simulation checks after every step and most of a life
 * is unchanged from one step to the next, so this is its biggest saving. An object with a failure is never remembered.
 *
 * Each check has its own `scope`, so passing one check says nothing about another. Only a check that depends on
 * nothing but the object (and the year, and the content) may use this.
 */
import type { ContentBundle } from '../content/schemas';

const scopes = new WeakMap<ContentBundle, Map<string, WeakMap<object, number>>>();

/** What was found healthy in this scope, by object, with the year it was checked in. */
export function healthyIn(content: ContentBundle, scope: string): WeakMap<object, number> {
  let byScope = scopes.get(content);
  if (!byScope) {
    byScope = new Map();
    scopes.set(content, byScope);
  }
  let seen = byScope.get(scope);
  if (!seen) {
    seen = new WeakMap();
    byScope.set(scope, seen);
  }
  return seen;
}

const wholes = new WeakMap<ContentBundle, Map<string, WeakMap<object, { deps: readonly unknown[]; year: number }>>>();

function wholesIn(content: ContentBundle, scope: string): WeakMap<object, { deps: readonly unknown[]; year: number }> {
  let byScope = wholes.get(content);
  if (!byScope) wholes.set(content, (byScope = new Map()));
  let seen = byScope.get(scope);
  if (!seen) byScope.set(scope, (seen = new WeakMap()));
  return seen;
}

/**
 * True when `key` and every one of `deps` are the very objects (or values) that a check in this scope already found
 * healthy in this year: a check that reads nothing else has nothing new to find.
 */
export function foundHealthy(content: ContentBundle, scope: string, key: object, deps: readonly unknown[], year: number): boolean {
  const last = wholesIn(content, scope).get(key);
  return last !== undefined && last.year === year && last.deps.length === deps.length && last.deps.every((d, i) => d === deps[i]);
}

/** Remembers that `key` with these `deps` passed the check in this scope. Call it only when the check found nothing. */
export function markHealthy(content: ContentBundle, scope: string, key: object, deps: readonly unknown[], year: number): void {
  wholesIn(content, scope).set(key, { deps, year });
}
