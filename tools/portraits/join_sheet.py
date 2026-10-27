"""Joins the collared-shirt tiles into review/collared-shirt-fix.png (and a before/after strip when the "before" tiles exist)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TILES = os.path.join(ROOT, 'review', 'collared-shirt-tiles')
BEFORE = os.path.join(ROOT, 'review', 'collared-shirt-tiles-before')
STAGES = ['young_child', 'teenager', 'young_adult', 'adult', 'middle_aged', 'senior', 'very_old']
BODIES = ['male', 'female']
SKINS = ['porcelain', 'golden_tan', 'deep_brown']
CLOTHES = ['navy', 'rust']
CROP = (60, 250, 452, 500)  # the collar and neck of a 512 px portrait
CELL = (300, 191)
LABEL = 150
HEAD = 26


def cell(folder, name):
    return Image.open(os.path.join(folder, name + '.png')).convert('RGBA').crop(CROP).resize(CELL, Image.LANCZOS)


def sheet(columns, path, title):
    rows = [(b, s) for b in BODIES for s in STAGES]
    img = Image.new('RGBA', (LABEL + CELL[0] * len(columns), HEAD + CELL[1] * len(rows)), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((4, 6), title, fill=(0, 0, 0, 255))
    for c, (label, _folder, _skin, _clothes) in enumerate(columns):
        draw.text((LABEL + c * CELL[0] + 6, 6), label, fill=(0, 0, 0, 255))
    for r, (body, stage) in enumerate(rows):
        draw.text((6, HEAD + r * CELL[1] + CELL[1] // 2), f'{body} {stage}', fill=(0, 0, 0, 255))
        for c, (_label, folder, skin, clothes) in enumerate(columns):
            tile = cell(folder, f'{body}_{stage}_{skin}_{clothes}')
            img.alpha_composite(tile, (LABEL + c * CELL[0], HEAD + r * CELL[1]))
    img.convert('RGB').save(path, optimize=True)


os.makedirs(os.path.join(ROOT, 'review'), exist_ok=True)
sheet([(f'{s} / {c}', TILES, s, c) for s in SKINS for c in CLOTHES], os.path.join(ROOT, 'review', 'collared-shirt-fix.png'),
      'Collared shirt after the fix: all 14 front layers, three skin tones, two clothing colors')
if os.path.isdir(BEFORE):
    sheet([('before (package art)', BEFORE, 'porcelain', 'navy'), ('after', TILES, 'porcelain', 'navy')],
          os.path.join(ROOT, 'review', 'collared-shirt-before-after.png'), 'Collared shirt, before and after the fix')
print('Wrote review/collared-shirt-fix.png')
