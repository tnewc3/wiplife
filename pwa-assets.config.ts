import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// `npx pwa-assets-generator` regenerates the icons in public/ from favicon.svg.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
