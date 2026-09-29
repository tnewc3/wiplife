import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

// Browser globals the engine must never touch. The engine is also type-checked
// without the DOM lib (tsconfig.engine.json), so this is a second line of defense.
const browserGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'performance',
  'crypto',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'alert',
  'self',
].map((name) => ({
  name,
  message: 'src/engine is pure TypeScript and must not use browser APIs (see AGENTS.md).',
}));

export default defineConfig(
  { ignores: ['dist', 'dev-dist', 'coverage', 'src/content/compiled', 'playwright-report', 'test-results'] },

  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx', 'src/App.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },

  // Only src/persistence may talk to the database.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/persistence/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: 'Persistence code lives only in src/persistence (see AGENTS.md).' }],
        },
      ],
    },
  },

  // Engine boundary: pure, deterministic TypeScript.
  {
    files: ['src/engine/**/*.ts'],
    languageOptions: {
      globals: { ...globals.es2021 },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'dexie', message: 'The engine must not touch storage (see AGENTS.md).' },
            { name: 'zustand', message: 'The engine must not depend on the store (see AGENTS.md).' },
          ],
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-*', '@testing-library/*'],
              message: 'src/engine must not import React (see AGENTS.md).',
            },
            {
              group: ['virtual:*', 'workbox-*'],
              message: 'src/engine must not import browser-only modules (see AGENTS.md).',
            },
            {
              group: ['**/ui/**', '**/store/**', '**/persistence/**', '@/ui/*', '@/store/*', '@/persistence/*'],
              message: 'src/engine must not import the UI, store or persistence layers (see AGENTS.md).',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...browserGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded rng in src/engine/rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must not read the clock; pass time in as input.' },
        { object: 'performance', property: 'now', message: 'The engine must not read the clock.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Use the seeded rng in src/engine/rng.ts.' },
        { object: 'crypto', property: 'randomUUID', message: 'Use the seeded rng in src/engine/rng.ts.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() reads the clock; the engine must be deterministic.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Date() reads the clock; the engine must be deterministic.',
        },
      ],
    },
  },

  // Node-side code: build tools, configs, end-to-end tests.
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
