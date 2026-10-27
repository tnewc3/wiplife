/**
 * The one portrait catalog and renderer for the whole app (P1), and the thumbnail cache in front of it.
 *
 * Lists only ever show cached thumbnails: a portrait is drawn once per appearance, age stage and size, stored in IndexedDB
 * (src/persistence/thumbnails.ts) keyed by the rendered settings plus the asset revision, and read back from there. Only the
 * profile and the death screen ask for a size larger than the biggest thumbnail, and those are drawn at full size.
 */
import { content } from '../../content';
import { createThumbnailDb, thumbnailKey, ThumbnailStore } from '../../persistence';
import { loadCatalog, normalizeAppearance, PortraitRenderer } from '../../portraits';
import { ASSET_REVISION } from '../../portraits/options';
import type { AppearanceInput, Notice } from '../../portraits/types';

/** A quick non-cryptographic hash (cyrb53) of the rendered settings, for cache keys. */
export function hashSettings(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The smallest configured thumbnail size that covers `pixels`, or null when it is larger than all of them. */
export function thumbnailSize(pixels: number, sizes: readonly number[]): number | null {
  const sorted = [...sizes].sort((a, b) => a - b);
  return sorted.find((s) => s >= pixels) ?? null;
}

const MEMORY_LIMIT = 400;

export class PortraitService {
  private catalog: Promise<PortraitRenderer> | null = null;
  private renderer: PortraitRenderer | null = null;
  private readonly memory = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly store: ThumbnailStore;

  constructor(private readonly base: string = `${import.meta.env.BASE_URL}portraits/`) {
    this.store = new ThumbnailStore(createThumbnailDb(), ASSET_REVISION, content.balance.portraits.thumbnails.maxRows);
  }

  /** Loads the catalog once (the manifest and palettes only; layer images load when a portrait needs them). */
  ready(): Promise<PortraitRenderer> {
    this.catalog ??= loadCatalog(this.base).then(async (catalog) => {
      this.renderer = new PortraitRenderer(catalog, { assetBaseUrl: this.base });
      await this.store.dropStale();
      return this.renderer;
    });
    return this.catalog;
  }

  /** The settings the renderer will actually draw: choices the age or hair does not allow fall back. Null until the catalog has loaded. */
  normalize(settings: AppearanceInput): AppearanceInput | null {
    if (!this.renderer) return null;
    const { appearance, notices } = normalizeAppearance(this.renderer.catalog, settings);
    if (import.meta.env.DEV && notices.length > 0) reportNotices(settings, notices);
    return appearance;
  }

  /** A URL for an image of the portrait at about `pixels` wide: a cached thumbnail when it fits one, else drawn at full size. */
  async image(settings: AppearanceInput, pixels: number): Promise<string> {
    const renderer = await this.ready();
    const appearance = this.normalize(settings)!;
    const tier = thumbnailSize(pixels, content.balance.portraits.thumbnails.sizes);
    const drawn = tier ?? Math.min(2048, Math.max(1, Math.round(pixels)));
    const key = thumbnailKey(ASSET_REVISION, drawn, hashSettings(JSON.stringify(appearance)));
    const hit = this.memory.get(key);
    if (hit) return hit;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const job = (async () => {
      const cached = tier === null ? null : await this.store.get(key, Date.now());
      const blob = cached ?? (await this.draw(renderer, appearance, drawn));
      if (!cached && tier !== null) void this.store.put(key, blob, Date.now());
      const url = URL.createObjectURL(blob);
      this.remember(key, url);
      return url;
    })();
    this.inFlight.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Draws one at a time, so a list that has just appeared does not freeze the screen. */
  private draw(renderer: PortraitRenderer, appearance: AppearanceInput, size: number): Promise<Blob> {
    const run = this.queue.then(async () => {
      const { canvas } = await renderer.render(appearance, { size });
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private remember(key: string, url: string): void {
    this.memory.set(key, url);
    if (this.memory.size > MEMORY_LIMIT) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) {
        URL.revokeObjectURL(this.memory.get(oldest)!);
        this.memory.delete(oldest);
      }
    }
  }

  /** Forgets every cached thumbnail (Settings → delete data). */
  async clear(): Promise<void> {
    await this.store.clear();
    for (const url of this.memory.values()) URL.revokeObjectURL(url);
    this.memory.clear();
  }
}

function reportNotices(settings: AppearanceInput, notices: Notice[]): void {
  // Development builds only: normalization is expected when someone ages, but a notice that is not about age is worth a look.
  console.debug(`[portraits] ${settings.templateId}: ${notices.map((n) => n.message).join(' ')}`);
}

let service: PortraitService | null = null;
export function getPortraitService(): PortraitService {
  service ??= new PortraitService();
  return service;
}
