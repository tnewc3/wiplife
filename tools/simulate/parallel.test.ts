import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The same report with how long things took left out (the one thing that differs between runs). */
function untimed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(untimed);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'performance' && key !== 'timing' && key !== 'fullCircle').map(([key, v]) => [key, untimed(v)]));
  }
  return value;
}

describe('the careless player in a worker thread', () => {
  it('gives the same reports as running the players one after the other', { timeout: 300_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiplife-parallel-'));
    try {
      const run = (threads: string) => {
        const file = join(dir, `report-${threads}.json`);
        execFileSync('npx', ['tsx', 'tools/simulate.ts', '--lives', '4', '--seed', 'threads-test', '--generations', '2', '--threads', threads, '--json', file], { stdio: 'pipe', encoding: 'utf8' });
        return JSON.parse(readFileSync(file, 'utf8')) as unknown;
      };
      expect(untimed(run('1'))).toEqual(untimed(run('0')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
