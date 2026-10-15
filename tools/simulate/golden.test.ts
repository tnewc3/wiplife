/**
 * Golden lives (Batch 0): fixed seeds played by the simulation's player models, every year and the finished life
 * compared by hash against `golden.json`. A change that is only meant to make the engine faster must leave every
 * hash alone; a change to the game's rules or content changes them on purpose, and then
 * `GOLDEN_UPDATE=1 npx vitest run tools/simulate/golden.test.ts` rewrites the file (say why in the pull request).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setAutoFreeze } from 'immer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import type { LifeState } from '../../src/engine/types';
import { runSimulation, type SimulatedPlayer } from './run';

const FILE = new URL('./golden.json', import.meta.url);
/** Players and how many lives each: the careful player in several countries, and the players that reach the other systems. */
const RUNS: readonly { player: SimulatedPlayer; lives: number }[] = [
  { player: 'careful', lives: 8 },
  { player: 'careless', lives: 3 },
  { player: 'criminal', lives: 2 },
  { player: 'star', lives: 2 },
  { player: 'athlete', lives: 2 },
];

/** JSON with sorted keys, so the hash doesn't depend on the order properties were added. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 20);

interface GoldenLife {
  seed: string;
  years: number;
  ageAtDeath: number;
  /** Every year's life (after the year begins), chained, and the finished life. */
  yearsHash: string;
  finalHash: string;
}

function play(): Record<string, GoldenLife[]> {
  const out: Record<string, GoldenLife[]> = {};
  for (const { player, lives } of RUNS) {
    const list: GoldenLife[] = [];
    // One life at a time, so each has its own chain; seeds are `${prefix}-${i}`.
    for (let i = 0; i < lives; i++) {
      const chain = createHash('sha256');
      let years = 0;
      const finals: LifeState[] = [];
      runSimulation(content, {
        lives: 1,
        seedPrefix: `golden-${player}-${i}`,
        player,
        onYear: (life) => {
          years++;
          chain.update(canonical(life));
        },
        onLife: (life) => finals.push(life),
      });
      const life = finals[0]!;
      list.push({ seed: life.seed, years, ageAtDeath: life.character.age, yearsHash: chain.digest('hex').slice(0, 20), finalHash: hash(canonical(life)) });
    }
    out[player] = list;
  }
  return out;
}

describe('golden lives', () => {
  beforeAll(() => setAutoFreeze(false));
  afterAll(() => setAutoFreeze(true));

  it('play out exactly as recorded', { timeout: 900_000 }, () => {
    const now = play();
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, `${JSON.stringify({ contentVersion: content.contentVersion, lives: now }, null, 2)}\n`);
      return;
    }
    const recorded = JSON.parse(readFileSync(FILE, 'utf8')) as { contentVersion: string; lives: Record<string, GoldenLife[]> };
    expect(now).toEqual(recorded.lives);
  });
});
