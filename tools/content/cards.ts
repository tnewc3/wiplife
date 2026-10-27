/**
 * U1: event card checks. Every event category shows under a banner; banners, events and icons name icons that exist (in
 * registries/icons.yaml, as a file in public/icons, and credited in CREDITS.md); a banner has its color token; an event's
 * meter names a role the event casts.
 */
import type { ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';

export interface CardFiles {
  /** The file names in public/icons. */
  iconFiles: ReadonlySet<string>;
  /** CREDITS.md. */
  credits: string;
  /** src/ui/theme/tokens.css. */
  tokens: string;
}

export function checkCards(bundle: ContentBundle, files: CardFiles | null, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const { icons } = bundle.registries.icons;
  const { banners, categories: shownUnder } = bundle.registries.banners;

  for (const [id, banner] of Object.entries(banners)) {
    if (!icons[banner.icon]) err('registries/banners.yaml', `banner "${id}": unknown icon "${banner.icon}"`);
    if (files && !files.tokens.includes(`--wl-cat-${id}:`)) err('registries/banners.yaml', `banner "${id}" has no color: add --wl-cat-${id} to both themes in src/ui/theme/tokens.css`);
  }
  for (const category of Object.keys(bundle.registries.categories.categories)) {
    const banner = shownUnder[category];
    if (banner === undefined) err('registries/banners.yaml', `category "${category}" shows under no banner: add it to "categories"`);
    else if (!banners[banner]) err('registries/banners.yaml', `category "${category}": unknown banner "${banner}"`);
  }
  for (const category of Object.keys(shownUnder)) {
    if (!bundle.registries.categories.categories[category]) err('registries/banners.yaml', `"${category}" is not an event category (registries/categories.yaml)`);
  }

  if (files) {
    for (const id of Object.keys(icons)) {
      if (!files.iconFiles.has(`${id}.svg`)) err('registries/icons.yaml', `icon "${id}": public/icons/${id}.svg is missing (run npm run icons)`);
      if (!files.credits.includes(`public/icons/${id}.svg`)) err('registries/icons.yaml', `icon "${id}" is not credited in CREDITS.md`);
    }
  }

  // The real events are all checked; a test pack's stand-in events may use anything.
  if (!partialEvents) {
    for (const def of Object.values(bundle.events)) {
      const at = `events/${def.id}`;
      if (def.banner !== undefined && !banners[def.banner]) err(at, `unknown banner "${def.banner}" (registries/banners.yaml)`);
      if (def.icon !== undefined && !icons[def.icon]) err(at, `unknown icon "${def.icon}" (registries/icons.yaml)`);
      if (def.meter && 'role' in def.meter && !Object.keys(def.cast ?? {}).includes(def.meter.role)) err(at, `meter role "${def.meter.role}" is not in the event's cast`);
    }
  }
  return errors;
}
