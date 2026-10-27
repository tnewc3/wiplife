"""
Patches the 14 front layers of the collared shirt (and their clothing masks) so the collar has no rectangular cutouts.

Every top_front_collared_shirt_* layer in the portrait package (revision 14) is cut flat beside each collar point: a vertical
edge from the tip straight down, then a horizontal step to where the natural inner edge of the collar begins. The neck skin
shows through as a square patch. This script adds a small wedge of fabric on each side so the inner collar edge is one
smooth curve from the tip to the natural edge, and does the same to the matching clothing mask so recoloring still works.

Usage (from the repository root, with the pristine package unzipped somewhere):
    python3 -I tools/portraits/patch_collared_shirt.py --src /path/to/wiplife_portrait_integration_v1/assets --dest public/portraits

It always reads the pristine files from --src and writes to --dest, so running it twice gives the same result. Needs Pillow.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

STAGES = ['young_child', 'teenager', 'young_adult', 'adult', 'middle_aged', 'senior', 'very_old']
SEXES = ['male', 'female']
MIN_FLAT_ROWS = 8   # a straight edge this many rows long is a cutout, not artwork
SEARCH_ROWS = 260
SAMPLE_INSET = 6    # copy fabric from this far inside the old edge, past its outline


def layer_paths(stage, sex):
    name = f'top_front_collared_shirt_{sex}_{stage}'
    return (f'clothing/{stage}/{sex}/collared_shirt/{name}.png',
            f'clothing_masks/{stage}/{sex}/collared_shirt/{name}_mask.png')


def edge_of(row, side):
    """The inner end of the collar flap on this row: its right end on the left side, its left end on the right side."""
    xs = np.where(row)[0]
    if len(xs) == 0:
        return None
    if side == 'L':
        left = xs[xs <= 512]
        return int(left.max()) if len(left) else None
    right = xs[xs >= 512]
    return int(right.min()) if len(right) else None


def find_cutout(alpha, side):
    """(top row, last flat row, flat edge x, edge x on the first natural row) for the straight cutout beside a collar tip, or None."""
    solid = alpha > 128
    rows = np.where(solid.any(axis=1))[0]
    top = int(rows[0])
    prev = None
    start = top
    for y in range(top, top + SEARCH_ROWS):
        e = edge_of(solid[y], side)
        if e != prev:
            if prev is not None and y - start >= MIN_FLAT_ROWS and start <= top + 2:
                natural = edge_of(solid[y], side)
                return start, y - 1, prev, natural
            start, prev = y, e
    return None


def patch_pair(image, mask):
    """Returns patched copies of the RGBA layer and its L mask, and what was done."""
    rgba = np.array(image.convert('RGBA'))
    original = rgba.copy()
    msk = np.array(mask.convert('L'))
    report = []
    for side in ('L', 'R'):
        cut = find_cutout(rgba[:, :, 3], side)
        if cut is None:
            report.append((side, None))
            continue
        top, last, edge, natural = cut
        height = (last + 1) - top
        sign = 1 if side == 'L' else -1  # which way is "toward the neck"
        # Outline color: the darkest of the last opaque pixels on the first natural row.
        out_y = last + 1
        outline = rgba[out_y, natural - sign * 1, :3].astype(float) if 0 <= natural - sign < 1024 else None
        for y in range(top, last + 2):
            t = (y - top) / height
            reach = edge + (natural - edge) * t * t  # ease-in: vertical at the tip, matching slope at the bottom
            for x in range(edge + sign, int(round(reach)) + sign * 2, sign):
                if not (0 <= x < 1024):
                    continue
                cover = float(np.clip((reach - x) * sign + 0.5, 0.0, 1.0))
                if cover <= 0:
                    continue
                # Fabric from inside the old edge, mirrored across it, skipping its outline.
                sx = edge - sign * (SAMPLE_INSET + abs(x - edge))
                while 0 <= sx < 1024 and rgba[y, sx, 3] < 200 and abs(sx - edge) < 60:
                    sx -= sign
                sx = int(np.clip(sx, 0, 1023))
                px = rgba[y, sx].astype(float)
                # Toward the bottom the new fabric takes the shading of the collar below it, so no seam shows where they meet.
                below = original[last + 3, x].astype(float)
                weight = t if y <= last else 1.0
                px[:3] = px[:3] * (1 - weight) + below[:3] * weight
                if outline is not None and cover < 1.0:
                    px[:3] = px[:3] * 0.45 + outline * 0.55
                rgba[y, x, :3] = np.round(px[:3]).astype(np.uint8)
                rgba[y, x, 3] = int(round(255 * cover))
                msk[y, x] = msk[y, sx]
        # The old straight edge's outline would show as a line inside the fabric: repaint it from just inside.
        for y in range(top, last + 1):
            t = (y - top) / height
            reach = edge + (natural - edge) * t * t  # ease-in: vertical at the tip, matching slope at the bottom
            if (reach - edge) * sign > 1.5:
                for x in (edge, edge - sign):
                    src = edge - sign * 3
                    rgba[y, x, :3] = rgba[y, src, :3]
                    rgba[y, x, 3] = rgba[y, src, 3]
                    msk[y, x] = msk[y, src]
        report.append((side, (top, last, edge, natural)))
    return Image.fromarray(rgba, 'RGBA'), Image.fromarray(msk, 'L'), report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True, help='pristine assets folder (the package\'s assets/)')
    parser.add_argument('--dest', default='public/portraits')
    args = parser.parse_args()
    for sex in SEXES:
        for stage in STAGES:
            image_path, mask_path = layer_paths(stage, sex)
            image = Image.open(os.path.join(args.src, image_path))
            mask = Image.open(os.path.join(args.src, mask_path))
            patched, patched_mask, report = patch_pair(image, mask)
            if any(r is None for _, r in report):
                raise SystemExit(f'No cutout found on {sex} {stage}: {report}')
            for rel, img in ((image_path, patched), (mask_path, patched_mask)):
                target = os.path.join(args.dest, rel)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                img.save(target, optimize=True)
            print(sex, stage, report)


if __name__ == '__main__':
    main()
