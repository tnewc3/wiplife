import compiled from './compiled/content.json';
import type { ContentBundle } from './schemas';

/**
 * The compiled game content. `npm run content` builds and validates it from
 * the YAML files in this folder; the app never reads YAML directly.
 */
export const content: ContentBundle = compiled as ContentBundle;
