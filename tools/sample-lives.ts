/**
 * `npm run samples -- [--lives 20] [--seed sample] [--out docs/sample-lives.md]`:
 * plays lives with the simulation's careful player and writes them to a
 * Markdown file for human review (the Stage 10 writing gate): each life's
 * obituary, then its life history, year by year.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle } from '../src/content/schemas';
import { archiveEntry } from '../src/engine/archive';
import { lifeTone } from '../src/engine/obituary';
import type { LifeState } from '../src/engine/types';
import { runSimulation } from './simulate/run';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const content = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '20' },
    seed: { type: 'string', default: 'sample' },
    out: { type: 'string', default: 'docs/sample-lives.md' },
  },
});
const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives < 1) {
  console.error('--lives must be a positive whole number');
  process.exit(2);
}
setAutoFreeze(false);

const finished: LifeState[] = [];
runSimulation(content, { lives, seedPrefix: values.seed, player: 'careful', onLife: (life) => finished.push(life) });

const lines: string[] = [
  '# Sample lives',
  '',
  `${finished.length} lives played by the simulation's careful player (seeds \`${values.seed}-0\` to \`${values.seed}-${finished.length - 1}\`), ` +
    `content version \`${content.contentVersion}\`, for the Stage 10 writing review. Regenerate with \`npm run samples\`.`,
  '',
  'Each life shows its obituary as the archive keeps it, then its life history. Lines marked ★ come from legendary events.',
  '',
];
finished.forEach((life, i) => {
  const entry = archiveEntry(life, content);
  const p = life.character.identity.pronouns;
  lines.push(
    `## ${i + 1}. ${entry.name} (${entry.birthYear}–${entry.deathYear})`,
    '',
    `*${p.subject}/${p.object} · ${content.cities[entry.birthCityId]?.name ?? entry.birthCityId} → ${content.cities[entry.cityId]?.name ?? entry.cityId} · ` +
      `died at ${entry.ageAtDeath} of ${entry.causeOfDeath ?? 'unknown causes'} · obituary tone: ${lifeTone(life, content)} · seed \`${life.seed}\`*`,
    '',
    `> ${entry.obituary}`,
    '',
    '<details><summary>Life history</summary>',
    '',
  );
  for (const h of life.history) lines.push(`- ${h.year} (age ${h.age}): ${h.legendary ? '★ ' : ''}${h.text}`);
  lines.push('', '</details>', '');
});

const out = path.resolve(values.out);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${lines.join('\n')}\n`);
console.log(`Wrote ${finished.length} lives to ${path.relative(process.cwd(), out)}`);
