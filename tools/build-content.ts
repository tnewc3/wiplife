/**
 * `npm run content`: compiles src/content/**\/*.yaml into
 * src/content/compiled/content.json, validating every file with Zod, and the
 * end-to-end test content pack (tests/e2e/content laid over it) into
 * src/content/compiled/test-content.json. Exits with code 1 and a list of
 * errors if anything is invalid.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, formatErrors } from './content/compile';

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

let failed = false;
for (const build of builds) {
  const result = await compileContent({ contentDir, appVersion: build.appVersion, ...(build.overlayDir ? { overlayDir: build.overlayDir } : {}) });
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
}
if (failed) process.exit(1);
