/**
 * Proves the engine boundary lint rules actually fire (a rule that is
 * configured but never triggers is a listed Stage 1 failure mode).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });

async function ruleIds(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const engineFile = 'src/engine/__lint_fixture__.ts';
const uiFile = 'src/ui/__lint_fixture__.ts';

// Loading the ESLint config and TypeScript parser can be slow on a cold start.
beforeAll(async () => {
  await ruleIds('export {};', engineFile);
}, 180_000);

describe('engine boundary lint rules', () => {
  it.each([
    ['imports React', `import { useState } from 'react';\nexport const x = useState;`, 'no-restricted-imports'],
    ['imports react-dom', `import { createRoot } from 'react-dom/client';\nexport const x = createRoot;`, 'no-restricted-imports'],
    ['imports the store', `import { x } from '../store/appStore';\nexport const y = x;`, 'no-restricted-imports'],
    ['imports Dexie', `import Dexie from 'dexie';\nexport const x = Dexie;`, 'no-restricted-imports'],
    ['uses Math.random', `export const x = Math.random();`, 'no-restricted-properties'],
    ['uses Date.now', `export const x = Date.now();`, 'no-restricted-properties'],
    ['uses new Date()', `export const x = new Date();`, 'no-restricted-syntax'],
    ['uses document', `export const x = document.title;`, 'no-restricted-globals'],
    ['uses window', `export const x = window.innerWidth;`, 'no-restricted-globals'],
    ['uses localStorage', `export const x = localStorage.getItem('a');`, 'no-restricted-globals'],
    ['uses crypto.getRandomValues', `export const x = crypto.getRandomValues(new Uint32Array(1));`, 'no-restricted-globals'],
  ])('fails when the engine %s', async (_label, code, rule) => {
    expect(await ruleIds(code, engineFile)).toContain(rule);
  });

  it('allows pure code in the engine', async () => {
    const code = `export function add(a: number, b: number): number {\n  return Math.imul(a, b) + new Date(0).getTime();\n}\n`;
    expect(await ruleIds(code, engineFile)).toEqual([]);
  });

  it('only applies the engine rules to src/engine', async () => {
    expect(await ruleIds(`export const x = Math.random() + Date.now();`, uiFile)).toEqual([]);
  });

  it('keeps Dexie inside src/persistence', async () => {
    const code = `import Dexie from 'dexie';\nexport const x = Dexie;`;
    expect(await ruleIds(code, uiFile)).toContain('no-restricted-imports');
    expect(await ruleIds(code, 'src/persistence/__lint_fixture__.ts')).toEqual([]);
  });
});

describe('god mode boundary (G1)', () => {
  const run = `import { performEdit } from '../engine/godmode';\nexport const x = performEdit;`;
  const typeOnly = `import type { EditPayload } from '../engine/godmode';\nexport type X = EditPayload;`;

  it('keeps the screens, the rest of the engine and the simulation from running an edit', async () => {
    expect(await ruleIds(run, 'src/ui/__lint_fixture__.ts')).toContain('@typescript-eslint/no-restricted-imports');
    expect(await ruleIds(run, 'src/engine/actions/__lint_fixture__.ts')).toContain('@typescript-eslint/no-restricted-imports');
    expect(await ruleIds(`import { performEdit } from '../../src/engine/godmode';\nexport const x = performEdit;`, 'tools/simulate/__lint_fixture__.ts')).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('lets the store, replayLife and tests run it, and the screens name its types', async () => {
    expect(await ruleIds(run, 'src/store/__lint_fixture__.ts')).not.toContain('@typescript-eslint/no-restricted-imports');
    expect(await ruleIds(run, 'src/engine/replay.ts')).not.toContain('@typescript-eslint/no-restricted-imports');
    expect(await ruleIds(run, 'src/engine/godmode/__lint_fixture__.test.ts')).not.toContain('@typescript-eslint/no-restricted-imports');
    expect(await ruleIds(typeOnly, 'src/ui/__lint_fixture__.ts')).not.toContain('@typescript-eslint/no-restricted-imports');
  });
});
