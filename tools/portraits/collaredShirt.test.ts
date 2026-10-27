/**
 * The collared-shirt fix (tools/portraits/patch_collared_shirt.py): the package's 14 front layers were cut flat beside each
 * collar point, leaving a square patch of neck skin showing. The inner collar edge must now be one smooth curve from the tip.
 * A rectangular cutout shows as a step of 17 or more pixels between two rows; a curve moves a few pixels at most.
 */
import { describe, expect, it } from 'vitest';
import { readPng, type Png } from './png.testutil';

const STAGES = ['young_child', 'teenager', 'young_adult', 'adult', 'middle_aged', 'senior', 'very_old'];
const BODIES = ['male', 'female'];
const root = new URL('../../public/portraits/', import.meta.url);
const frontPath = (stage: string, body: string) => `clothing/${stage}/${body}/collared_shirt/top_front_collared_shirt_${body}_${stage}.png`;
const maskPath = (stage: string, body: string) => `clothing_masks/${stage}/${body}/collared_shirt/top_front_collared_shirt_${body}_${stage}_mask.png`;

/** The inner end of the collar flap on each row of the first 70 rows from the top of the shirt (the cutout was 57 rows tall at most): the rightmost solid pixel left of center, and the leftmost right of it. */
function collarEdges(png: Png): { left: number[]; right: number[] } {
  const alpha = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3]!;
  let top = 0;
  while (top < png.height && ![...Array(png.width).keys()].some((x) => alpha(x, top) > 128)) top++;
  const left: number[] = [];
  const right: number[] = [];
  for (let y = top; y < top + 70; y++) {
    let l = -1;
    for (let x = 512; x >= 0; x--) if (alpha(x, y) > 128) { l = x; break; }
    let r = -1;
    for (let x = 512; x < png.width; x++) if (alpha(x, y) > 128) { r = x; break; }
    if (l >= 0) left.push(l);
    if (r >= 0) right.push(r);
  }
  return { left, right };
}

const maxStep = (edges: number[]) => Math.max(...edges.slice(1).map((e, i) => Math.abs(e - edges[i]!)));

describe('collared shirt front layers', () => {
  for (const body of BODIES) {
    for (const stage of STAGES) {
      it(`${body} ${stage}: no rectangular cutout beside either collar point`, () => {
        const png = readPng(new URL(frontPath(stage, body), root));
        expect(png.channels).toBe(4);
        const { left, right } = collarEdges(png);
        expect(left.length).toBeGreaterThan(60);
        expect(right.length).toBeGreaterThan(60);
        expect(maxStep(left)).toBeLessThanOrEqual(4);
        expect(maxStep(right)).toBeLessThanOrEqual(4);
      });

      it(`${body} ${stage}: the clothing mask covers the fabric that was added`, () => {
        const front = readPng(new URL(frontPath(stage, body), root));
        const mask = readPng(new URL(maskPath(stage, body), root));
        expect(mask.channels).toBe(1);
        let opaqueUnmasked = 0;
        for (let i = 0; i < front.width * front.height; i++) if (front.data[i * 4 + 3]! > 200 && mask.data[i]! === 0) opaqueUnmasked++;
        // Anywhere the shirt is solid and the mask is empty is fabric that would not recolor (buttons are the only intended gaps).
        expect(opaqueUnmasked).toBeLessThan(front.width * front.height * 0.02);
      });
    }
  }
});
