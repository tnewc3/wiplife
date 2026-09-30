/**
 * `npm run simulate -- [--lives 1000] [--seed sim] [--json report.json]`:
 * plays random lives headless and prints a report. Exits with code 1 if any
 * invariant fails.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle } from '../src/content/schemas';
import { formatReport, runSimulation } from './simulate/run';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const content = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '1000' },
    seed: { type: 'string', default: 'sim' },
    json: { type: 'string' },
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
const report = runSimulation(content, { lives, seedPrefix: values.seed });
console.log(formatReport(report, content));
console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (values.json) await writeFile(values.json, `${JSON.stringify(report, null, 2)}\n`);
if (report.invariantFailures > 0) process.exit(1);
