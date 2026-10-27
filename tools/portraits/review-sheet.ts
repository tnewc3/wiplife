/**
 * `npx tsx tools/portraits/review-sheet.ts`: writes review/collared-shirt-fix.png, a sheet of all 14 collared shirts (7 age
 * stages, both body types) drawn by the real renderer in three skin tones and two clothing colors, for the owner to approve.
 * Needs Pillow only to join the tiles (python3 -I tools/portraits/join_sheet.py).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness } from './harness';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAGES = ['young_child', 'teenager', 'young_adult', 'adult', 'middle_aged', 'senior', 'very_old'];
const BODIES = ['male', 'female'];
const SKINS = ['porcelain', 'golden_tan', 'deep_brown'];
const CLOTHES = ['navy', 'rust'];

const BEFORE = process.argv.find((a) => a.startsWith('--before='))?.slice('--before='.length);
const harness = await openHarness();
const tiles: { name: string; appearance: object }[] = [];
for (const body of BODIES)
  for (const stage of STAGES)
    for (const skin of SKINS)
      for (const clothing of CLOTHES)
        tiles.push({
          name: `${body}_${stage}_${skin}_${clothing}`,
          appearance: { templateId: `${body}_${stage}`, outfit: 'collared_shirt', skin, clothing, hairstyle: 'original', expression: 'smile', hair: 'dark_brown', eyes: 'brown' },
        });
const dir = path.join(root, 'review', 'collared-shirt-tiles');
await mkdir(dir, { recursive: true });
const pngs = await harness.render(tiles.map((t) => t.appearance), 512);
for (let i = 0; i < tiles.length; i++) await writeFile(path.join(dir, `${tiles[i]!.name}.png`), pngs[i]!);
await harness.close();
if (BEFORE) {
  // The same adult... all 14 shirts as the package drew them, in one skin tone and clothing color, to set beside the fix.
  const before = await openHarness(BEFORE);
  const base = tiles.filter((t) => t.name.endsWith('_porcelain_navy'));
  const out = await before.render(base.map((t) => t.appearance), 512);
  const bdir = path.join(root, 'review', 'collared-shirt-tiles-before');
  await mkdir(bdir, { recursive: true });
  for (let i = 0; i < base.length; i++) await writeFile(path.join(bdir, `${base[i]!.name}.png`), out[i]!);
  await before.close();
}
console.log(`Wrote ${tiles.length} tiles to review/collared-shirt-tiles`);
