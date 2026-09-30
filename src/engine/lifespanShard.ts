/**
 * Stage 3 acceptance test, split into shards so the lives run in parallel
 * test files (lifespan-1.test.ts to lifespan-4.test.ts). Each shard lives out
 * its share of random lives (with random choices), checking every invariant
 * at the end of every year, and checks the lifespan rules on its share.
 *
 * How many lives: 2,500 in the regular test run (every pull request), and the
 * full 10,000 in the nightly workflow (.github/workflows/nightly.yml), which
 * sets LIFESPAN_LIVES=10000 (docs/technical.md, section Q: invariant fuzzing
 * is small on every pull request, large nightly). The seeds are the same, so
 * the regular run is the first quarter of the nightly one.
 *
 * Deaths before 18 are checked per shard against a loose bound (0.6%),
 * well above the 0.2% target, so random variation can't fail the test.
 *
 * Why shards are enough: when every equal-sized shard has its median age at
 * death between 72 and 82, the median across all the lives lies between the
 * smallest and largest shard medians, so it is between 72 and 82 too. The
 * same holds for "no one lives past the maximum age".
 */
import { setAutoFreeze } from 'immer';
import { beforeAll, expect, it } from 'vitest';
import { content } from '../content';
import { archiveEntry } from './archive';
import { checkInvariants } from './invariants';
import { createLife } from './life';
import { liveOut } from './testFixtures';

export const SHARDS = 4;
/** Lives in the regular test run. */
export const REGULAR_LIVES = 2_500;

/** LIFESPAN_LIVES from the environment (read without Node types: the engine is type-checked without them). */
function livesFromEnvironment(): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LIFESPAN_LIVES;
  if (raw === undefined || raw === '') return REGULAR_LIVES;
  const lives = Number(raw);
  if (!Number.isInteger(lives) || lives <= 0 || lives % SHARDS !== 0) {
    throw new Error(`LIFESPAN_LIVES must be a positive multiple of ${SHARDS} (got "${raw}")`);
  }
  return lives;
}

export const TOTAL_LIVES = livesFromEnvironment();

export function lifespanShard(shard: number): void {
  // Immer's freezing guards against accidental mutation, which other tests
  // cover; this statistical run skips it for speed (each shard runs in its
  // own worker, so no other test is affected).
  beforeAll(() => setAutoFreeze(false));

  const count = TOTAL_LIVES / SHARDS;
  const first = (shard - 1) * count;

  it(`lives ${first + 1}–${first + count} of ${TOTAL_LIVES}: believable median age at death, never past the maximum, zero invariant failures`, () => {
    const { maxAge } = content.balance.mortality;
    const { maxEntries } = content.balance.aging.history;
    const ages: number[] = [];
    const failures: string[] = [];
    let longestHistory = 0;

    for (let i = first; i < first + count; i++) {
      const seed = `lifespan-${i}`;
      const start = createLife({ mode: 'random', seed, birthYear: 2026 }, content);
      const dead = liveOut(start, content, (life) => {
        // Every year, once it has ended.
        if (failures.length >= 20 || (life.phase !== 'yearStart' && life.phase !== 'dead')) return;
        for (const f of checkInvariants(life, content)) failures.push(`${seed} age ${life.character.age}: ${f}`);
      });
      ages.push(dead.character.age);
      longestHistory = Math.max(longestHistory, dead.history.length);
      // Death always produces a complete archive entry.
      const entry = archiveEntry(dead, content);
      if (entry.unfinished || !entry.causeOfDeath || entry.obituary.length === 0) failures.push(`${seed}: incomplete archive entry`);
    }

    ages.sort((a, b) => a - b);
    const percentile = (p: number) => ages[Math.floor(count * p)]!;
    expect(failures).toEqual([]);
    expect(percentile(0.5)).toBeGreaterThanOrEqual(72);
    expect(percentile(0.5)).toBeLessThanOrEqual(82);
    expect(ages[count - 1]).toBeLessThanOrEqual(maxAge);
    expect(longestHistory).toBeLessThanOrEqual(maxEntries);
    // Children can't make choices, so deaths before 18 are kept rare (target about 0.2% of lives).
    expect(ages.filter((a) => a < 18).length / count).toBeLessThan(0.006);
    // Sanity: lifespans vary.
    expect(percentile(0.9) - percentile(0.1)).toBeGreaterThan(10);
  }, 600_000);
}
