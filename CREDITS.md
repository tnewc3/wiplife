# Credits

## Portrait art

The character portraits (`public/portraits`) come from the WIPlife portrait package `wiplife_portrait_integration_v1` (asset manifest revision 14): 2,558 layered, recolorable PNG layers and masks, plus the browser renderer and colour engine that became `src/portraits` (the colour engine is `src/portraits/vendor/recolor.js`). The package's own record (`review/source.json`) names its source as `character_girls_hairstyles_v1.zip`. The package ships no license text, so who made the art and on what terms is not recorded here; the owner should add it.

The 14 front layers of the collared shirt (`top_front_collared_shirt_*`) and their clothing masks were patched in this repository so the collar has no rectangular cutouts (`tools/portraits/patch_collared_shirt.py`, run against the pristine package). The patched set is revision 15 of `public/portraits/manifest.json`. See `review/collared-shirt-fix.png` and `review/collared-shirt-before-after.png`.
