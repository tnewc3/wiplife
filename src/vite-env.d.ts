/// <reference types="vite/client" />

/** The app version from package.json, injected at build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "true" only in end-to-end test builds (set by playwright.config.ts); enables test hooks such as ?seed=. */
  readonly VITE_TEST_HOOKS?: string;
}
