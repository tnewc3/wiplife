/**
 * The portrait package's own checks (wiplife_portrait_integration_v1 tests/selection.test.mjs), kept in the repo's test run:
 * every layer the manifest names exists, supported selections resolve to complete plans, and unsupported ones fall back or throw.
 * The asset revision is 15 here: revision 14 of the package plus the collared-shirt fix (tools/portraits/patch_collared_shirt.py).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { availableOptions, AppearanceError, deserializeAppearance, normalizeAppearance, resolvePortrait, serializeAppearance } from '../../src/portraits/selection';
import type { Catalog, TemplateId } from '../../src/portraits/types';

const root = new URL('../../public/portraits/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, root), 'utf8')) as never;
const catalog = { manifest: read('manifest.json'), palettes: read('palettes.json') } as Catalog;

const allPaths = new Set<string>();
(function collect(x: unknown): void {
  if (typeof x === 'string' && x.endsWith('.png')) allPaths.add(x);
  else if (x && typeof x === 'object') Object.values(x).forEach(collect);
})(catalog.manifest);

describe('portrait assets', () => {
  it('has every referenced layer and mask on disk', () => {
    for (const p of allPaths) expect(existsSync(fileURLToPath(new URL(p, root))), p).toBe(true);
    expect(allPaths.size).toBe(2558);
  });

  it('resolves every supported hair, hat, eye and lash combination into a complete, non-mutating plan', () => {
    const before = JSON.stringify(catalog);
    let cases = 0;
    for (const t of catalog.manifest.templates) {
      for (const hairstyle of availableOptions(catalog, t.id).hairstyles) {
        const choices = availableOptions(catalog, t.id, hairstyle);
        for (const hat of choices.hats) {
          for (const eyeShape of choices.eyeShapes) {
            for (const lashStyle of choices.lashes) {
              const portrait = resolvePortrait(
                catalog,
                {
                  templateId: t.id,
                  hairstyle: hairstyle as never,
                  hat: hat as never,
                  eyeShape: eyeShape as never,
                  lashStyle: lashStyle as never,
                  expression: choices.expressions[cases % choices.expressions.length] as never,
                  outfit: choices.outfits[cases % choices.outfits.length] as never,
                  browStyle: choices.brows[cases % choices.brows.length] as never,
                  noseShape: choices.noses[cases % choices.noses.length] as never,
                  facialHair: choices.facialHair[cases % choices.facialHair.length] as never,
                  eyewear: choices.eyewear[cases % choices.eyewear.length] as never,
                  earrings: choices.earrings[cases % choices.earrings.length] as never,
                  skin: catalog.palettes.skin[cases % 8]!.id as never,
                  hair: catalog.palettes.hair[cases % 6]!.id as never,
                },
                true,
              );
              expect(portrait.notices).toHaveLength(0);
              const plan = portrait.template;
              expect(new Set(plan.draw_order).size).toBe(plan.draw_order.length);
              for (const n of plan.draw_order) {
                const layer = plan.layers[n]!;
                expect(layer, n).toBeTruthy();
                expect(allPaths.has(layer.image)).toBe(true);
                for (const p of Object.values(layer.masks)) expect(allPaths.has(p)).toBe(true);
              }
              cases++;
            }
          }
        }
      }
    }
    expect(JSON.stringify(catalog)).toBe(before);
    expect(cases).toBe(7488);
  });

  it('falls back with notices for what an age or hairstyle does not offer, and throws in strict mode', () => {
    const result = normalizeAppearance(catalog, { templateId: 'female_baby', hairstyle: 'twin_braids', facialHair: 'mustache', outfit: 'hoodie' });
    expect(result.notices.map((n) => n.field)).toEqual(['hairstyle', 'outfit', 'facialHair']);
    expect(result.appearance.hairstyle).toBe('original');
    const noHat = normalizeAppearance(catalog, { templateId: 'female_adult', hairstyle: 'twin_braids', hat: 'beanie' });
    expect(noHat.appearance.hat).toBe('none');
    expect(() => resolvePortrait(catalog, { templateId: 'male_adult', hairstyle: 'twin_braids' }, true)).toThrow(AppearanceError);
    expect(() => normalizeAppearance(catalog, { templateId: 'missing' as TemplateId })).toThrow(/Unknown portrait template/);
  });

  it('saves and loads appearance settings, and rejects an unknown schema', () => {
    const input = { templateId: 'female_adult' as const, hairstyle: 'long_waves' as const, skin: 'olive' as const, hair: 'copper' as const, eyes: 'green' as const, expression: 'smile' as const, lashStyle: 'full' as const };
    const save = serializeAppearance(catalog, input);
    const loaded = deserializeAppearance(catalog, save, true);
    expect(loaded.revisionChanged).toBe(false);
    expect(loaded.appearance.hairstyle).toBe(input.hairstyle);
    expect(serializeAppearance(catalog, loaded.appearance)).toBe(save);
    expect(() => deserializeAppearance(catalog, 'not json')).toThrow(/Invalid/);
    expect(() => deserializeAppearance(catalog, '{"schemaVersion":2}')).toThrow(/Unsupported/);
    const old = JSON.parse(save) as { assetRevision: number };
    old.assetRevision = 1;
    expect(deserializeAppearance(catalog, JSON.stringify(old)).revisionChanged).toBe(true);
  });

  it('hides both hair pieces when hair is hidden, and starts with no accessories', () => {
    const p = resolvePortrait(catalog, { templateId: 'female_adult', hairstyle: 'long_waves', hairVisible: false });
    expect(p.template.draw_order.some((n) => n.startsWith('hair_'))).toBe(false);
    expect(p.template.draw_order.some((n) => n.startsWith('accessory_'))).toBe(false);
  });
});
