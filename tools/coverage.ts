/**
 * `npm run coverage -- [--lives 300] [--seed coverage] [--json report.json] [--static]`:
 * the content coverage report (Stage 10). Events by life stage, category,
 * tone and rarity; memory tags written but never read; flags set but never
 * checked; events no chain can reach; and, from simulated lives, how many
 * events are eligible in typical years, dry spots, and how often events
 * repeat within a life. Exits with code 1 if any check in
 * src/content/balance/targets.yaml (coverage) fails.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle } from '../src/content/schemas';
import { collectCoverage } from './coverage/dynamic';
import { coverageChecks, formatCoverage } from './coverage/report';
import { analyzeContent } from './coverage/static';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const content = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '300' },
    seed: { type: 'string', default: 'coverage' },
    json: { type: 'string' },
    static: { type: 'boolean', default: false },
  },
});

const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives < 1) {
  console.error('--lives must be a positive whole number');
  process.exit(2);
}

// As in tools/simulate.ts: skip Immer's freezing for a faster headless run.
setAutoFreeze(false);

const started = Date.now();
const staticPart = analyzeContent(content);
const dynamicPart = values.static ? null : collectCoverage(content, { lives, seedPrefix: values.seed });
console.log(formatCoverage(staticPart, dynamicPart, content));
console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
const checks = coverageChecks(staticPart, dynamicPart, content);
if (values.json) {
  const { simulation, ...rest } = dynamicPart ?? { simulation: null };
  const report = { static: staticPart, simulated: dynamicPart ? { ...rest, events: simulation?.events } : null, checks };
  await writeFile(values.json, `${JSON.stringify(report, null, 2)}\n`);
}
if (checks.some((c) => !c.met)) process.exit(1);
