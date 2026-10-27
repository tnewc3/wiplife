/**
 * `npm run icons -- <path to a fluentui-emoji checkout>`: copies the Fluent Emoji (Color style, MIT) listed in
 * src/content/registries/icons.yaml into public/icons/<id>.svg. Get the source with
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/fluentui-emoji.git
 *   cd fluentui-emoji && git sparse-checkout set assets
 * Only the icons the registry lists are copied. The content build fails if one is missing or not credited.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run icons -- <path to a fluentui-emoji checkout>');
  process.exit(1);
}

const registry = parse(await readFile(path.join(root, 'src', 'content', 'registries', 'icons.yaml'), 'utf8')) as {
  icons: Record<string, { fluent: string; variant?: string }>;
};
await mkdir(path.join(root, 'public', 'icons'), { recursive: true });
for (const [id, { fluent, variant }] of Object.entries(registry.icons)) {
  const slug = fluent.toLowerCase().replaceAll(' ', '_');
  const dir = variant ? path.join(source, 'assets', fluent, variant, 'Color') : path.join(source, 'assets', fluent, 'Color');
  const file = variant ? `${slug}_color_${variant.toLowerCase()}.svg` : `${slug}_color.svg`;
  await copyFile(path.join(dir, file), path.join(root, 'public', 'icons', `${id}.svg`));
  console.log(`${id}.svg  ←  ${fluent}${variant ? ` (${variant})` : ''}`);
}
