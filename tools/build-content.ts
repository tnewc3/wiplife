/**
 * `npm run content`: compiles src/content/**\/*.yaml into
 * src/content/compiled/content.json, validating every file with Zod, and the
 * end-to-end test content pack (tests/e2e/content laid over it) into
 * src/content/compiled/test-content.json. Exits with code 1 and a list of
 * errors if anything is invalid. C1 wording checks print as warnings.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, formatErrors } from './content/compile';
import { futureTeams } from './content/sports';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src', 'content');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };

/** The game's content, and the end-to-end test pack: the same content with tests/e2e/content laid over it. */
const builds = [
  { label: 'Content', out: path.join(contentDir, 'compiled', 'content.json'), appVersion: pkg.version },
  {
    label: 'Test content pack',
    out: path.join(contentDir, 'compiled', 'test-content.json'),
    appVersion: `${pkg.version}-test`,
    overlayDir: path.join(root, 'tests', 'e2e', 'content'),
  },
];

/** U1: the icon files, credits and color tokens the event cards are checked against. */
const cardFiles = {
  iconFiles: new Set(await readdir(path.join(root, 'public', 'icons'))),
  credits: await readFile(path.join(root, 'CREDITS.md'), 'utf8'),
  tokens: await readFile(path.join(root, 'src', 'ui', 'theme', 'tokens.css'), 'utf8'),
};

let failed = false;
for (const build of builds) {
  const result = await compileContent({ contentDir, appVersion: build.appVersion, cardFiles, ...(build.overlayDir ? { overlayDir: build.overlayDir } : {}) });
  if (!result.ok) {
    console.error(`${build.label} build failed with ${result.errors.length} error(s):\n${formatErrors(result.errors)}`);
    failed = true;
    continue;
  }
  await mkdir(path.dirname(build.out), { recursive: true });
  await writeFile(build.out, `${JSON.stringify(result.bundle, null, 2)}\n`);
  console.log(
    `${build.label} OK: ${result.definitionCount} definition(s), version ${result.bundle.contentVersion} → ${path.relative(root, build.out)}`,
  );
  // Batch 6: the teams that play away from the modeled cities, ready for when those cities and countries are added.
  if (build.label === 'Content') {
    const future = futureTeams(result.bundle);
    for (const kind of ['city', 'country'] as const) {
      const rows = future.filter((t) => t.kind === kind);
      const places = new Set(rows.map((t) => `${t.cityName} (${t.country})`));
      console.log(`futureCity teams (${kind === 'city' ? 'cities' : 'countries'} the game does not model yet): ${rows.length} teams in ${places.size} places`);
      for (const place of [...places].sort()) {
        const here = rows.filter((t) => `${t.cityName} (${t.country})` === place);
        console.log(`  ${place}, lives in ${[...new Set(here.map((t) => t.nearestCityId))].join('/')}: ${here.map((t) => `${t.name} [${t.sport}${t.tier === 2 ? ' II' : ''}]`).join('; ')}`);
      }
    }
  }
  // C1 wording checks: warnings for review, not failures (tools/content/consistency.ts).
  if (result.warnings.length > 0) {
    console.warn(`${build.label}: ${result.warnings.length} consistency warning(s) to review (or justify in the event's "justified"):`);
    console.warn(formatErrors(result.warnings));
  }
}
if (failed) process.exit(1);
