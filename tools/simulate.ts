/**
 * `npm run simulate -- [--lives 1000] [--seed sim] [--player both|careful|careless] [--json report.json]`:
 * plays random lives headless and prints a report: the careful player's in
 * full, then (with both, the default) a careful vs careless comparison on
 * the same seeds. Exits with code 1 if any invariant fails in either run.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle } from '../src/content/schemas';
import { formatComparison, formatReport, runSimulation, type SimulatedPlayer } from './simulate/run';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const content = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '1000' },
    seed: { type: 'string', default: 'sim' },
    json: { type: 'string' },
    player: { type: 'string', default: 'both' },
  },
});

const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives < 1) {
  console.error('--lives must be a positive whole number');
  process.exit(2);
}

// Immer freezes every new state to catch accidental mutation. The app and the
// unit tests keep that on; a headless run of thousands of lives skips it for
// speed (about a third faster).
setAutoFreeze(false);

const started = Date.now();
const players: SimulatedPlayer[] = values.player === 'both' ? ['careful', 'careless'] : [values.player as SimulatedPlayer];
if (!players.every((p) => p === 'careful' || p === 'careless')) {
  console.error('--player must be careful, careless or both');
  process.exit(2);
}
const reports = players.map((player) => runSimulation(content, { lives, seedPrefix: values.seed, player }));
console.log(formatReport(reports[0]!, content));
if (reports.length === 2) {
  console.log('');
  console.log(formatComparison(reports[0]!, reports[1]!, content));
}
console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (values.json) await writeFile(values.json, `${JSON.stringify(reports.length === 2 ? { careful: reports[0], careless: reports[1] } : reports[0], null, 2)}\n`);
if (reports.some((r) => r.invariantFailures > 0)) process.exit(1);
