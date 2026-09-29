/**
 * `npm run content`: compiles src/content/**\/*.yaml into
 * src/content/compiled/content.json, validating every file with Zod.
 * Exits with code 1 and a list of errors if anything is invalid.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, formatErrors } from './content/compile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src', 'content');
const outFile = path.join(contentDir, 'compiled', 'content.json');

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
const result = await compileContent({ contentDir, appVersion: pkg.version });

if (!result.ok) {
  console.error(`Content build failed with ${result.errors.length} error(s):\n${formatErrors(result.errors)}`);
  process.exit(1);
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(result.bundle, null, 2)}\n`);
console.log(
  `Content OK: ${result.definitionCount} definition(s), version ${result.bundle.contentVersion} → ${path.relative(root, outFile)}`,
);
