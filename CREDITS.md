# Credits

## Portrait art

The character portraits (`public/portraits`) come from the WIPlife portrait package `wiplife_portrait_integration_v1` (asset manifest revision 14): 2,558 layered, recolorable PNG layers and masks, plus the browser renderer and colour engine that became `src/portraits` (the colour engine is `src/portraits/vendor/recolor.js`). The package's own record (`review/source.json`) names its source as `character_girls_hairstyles_v1.zip`. The package ships no license text, so who made the art and on what terms is not recorded here; the owner should add it.

The 14 front layers of the collared shirt (`top_front_collared_shirt_*`) and their clothing masks were patched in this repository so the collar has no rectangular cutouts (`tools/portraits/patch_collared_shirt.py`, run against the pristine package). The patched set is revision 15 of `public/portraits/manifest.json`. See `review/collared-shirt-fix.png` and `review/collared-shirt-before-after.png`.

## Content icons

The icons on event cards, stat bars and in the People list (`public/icons`) are **Microsoft Fluent Emoji**, Color style, from https://github.com/microsoft/fluentui-emoji (commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`), used under the MIT License (Copyright (c) Microsoft Corporation). Only the icons below are included. They are listed in `src/content/registries/icons.yaml`, copied with `npm run icons`, and the content build fails if a listed icon is missing here.

| File | Fluent Emoji |
|---|---|
| `public/icons/hugging_face.svg` | Hugging face |
| `public/icons/two_hearts.svg` | Two hearts |
| `public/icons/handshake.svg` | Handshake |
| `public/icons/speech_balloon.svg` | Speech balloon |
| `public/icons/briefcase.svg` | Briefcase |
| `public/icons/graduation_cap.svg` | Graduation cap |
| `public/icons/money_bag.svg` | Money bag |
| `public/icons/stethoscope.svg` | Stethoscope |
| `public/icons/brain.svg` | Brain |
| `public/icons/police_car_light.svg` | Police car light |
| `public/icons/glowing_star.svg` | Glowing star |
| `public/icons/trophy.svg` | Trophy |
| `public/icons/house_with_garden.svg` | House with garden |
| `public/icons/airplane.svg` | Airplane |
| `public/icons/paw_prints.svg` | Paw prints |
| `public/icons/sparkles.svg` | Sparkles |
| `public/icons/candle.svg` | Candle |
| `public/icons/calendar.svg` | Calendar |
| `public/icons/grinning_face.svg` | Grinning face |
| `public/icons/red_heart.svg` | Red heart |
| `public/icons/light_bulb.svg` | Light bulb |
| `public/icons/fire.svg` | Fire |
| `public/icons/flexed_biceps.svg` | Flexed biceps (Default) |
| `public/icons/anxious_face_with_sweat.svg` | Anxious face with sweat |
| `public/icons/headstone.svg` | Headstone |
| `public/icons/rocket.svg` | Rocket |

## Interface icons

Menu, close, chevron, back and tab icons come from **Lucide** (`lucide-react`, ISC License, https://lucide.dev).

## Fonts

**Fredoka** (headings and the wordmark) and **Nunito** (body text), both under the SIL Open Font License 1.1, self-hosted through `@fontsource/fredoka` and `@fontsource/nunito` so they work offline.

## Wordmark

The "WIPlife" wordmark and its progress-bar motif (`src/ui/components/Logo.tsx`) are original to this project.
