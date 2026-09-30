/// <reference types="vite/client" />
import compiled from './compiled/content.json';
import testPack from './compiled/test-content.json';
import type { ContentBundle } from './schemas';

/** True when the page URL asks for the test content pack (`?content=test`). */
function wantsTestPack(): boolean {
  // Read without DOM types: this file is also compiled with the engine.
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  return /[?&]content=test(&|$)/.test(search);
}

/**
 * The compiled game content. `npm run content` builds and validates it from
 * the YAML files in this folder; the app never reads YAML directly.
 *
 * End-to-end test builds only (VITE_TEST_HOOKS=true): `?content=test` loads
 * the test content pack (tests/e2e/content), so flow tests don't change when
 * real events do. The flag check stays inline here so normal builds compile
 * it, and the test pack with it, away.
 */
export const content: ContentBundle = (
  import.meta.env.VITE_TEST_HOOKS === 'true' && wantsTestPack() ? testPack : compiled
) as ContentBundle;
