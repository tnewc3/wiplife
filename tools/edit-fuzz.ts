/**
 * `npm run edit-fuzz -- [--lives 100] [--seed edit-fuzz] [--edits 40] [--max-age 70]`: the god mode edit fuzz (G1). Applies random
 * valid and invalid edits to simulated lives and checks the rules (see tools/edit-fuzz/fuzz.ts). Exits with code 1 if anything fails.
 */
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle } from '../src/content/schemas';
import { fuzz } from './edit-fuzz/fuzz';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const content = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '100' },
    seed: { type: 'string', default: 'edit-fuzz' },
    edits: { type: 'string', default: '40' },
    'max-age': { type: 'string', default: '70' },
  },
});
const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives < 1) {
  console.error('--lives must be a positive whole number');
  process.exit(2);
}

// Skip Immer's freezing, as the simulation does, for a faster headless run.
setAutoFreeze(false);

const started = Date.now();
const report = fuzz(content, { lives, seedPrefix: values.seed, edits: Number(values.edits), maxAge: Number(values['max-age']) });
console.log(`Edit fuzz: ${report.lives} lives, ${report.attempted} edits tried, ${report.accepted} accepted, ${report.refused} refused.`);
console.log('Refusals by code:', Object.entries(report.codes).sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ${n}`).join(', '));
console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (report.problems.length > 0) {
  console.error(`${report.problems.length} problem(s):`);
  for (const p of report.problems.slice(0, 30)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Clean.');
