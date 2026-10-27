import { useEffect, useRef, useState } from 'react';
import type { AppearanceInput } from '../../portraits/types';
import { getPortraitService, hashSettings } from './portraitService';

/** A neutral silhouette shown while a portrait loads (or when the art cannot be reached). */
function Silhouette() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full text-muted opacity-60" aria-hidden="true" focusable="false">
      <circle cx="50" cy="38" r="17" fill="currentColor" />
      <path d="M16 100c0-22 14-36 34-36s34 14 34 36z" fill="currentColor" />
    </svg>
  );
}

function PortraitImage({ portrait, size }: { portrait: AppearanceInput; size: number }) {
  const holder = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  // Draw only what is on screen: a long list asks for its thumbnails as they scroll into view.
  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    getPortraitService()
      .image(portrait, Math.ceil(size * dpr))
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visible, portrait, size]);

  return (
    <span ref={holder} className="inline-flex h-full w-full items-center justify-center">
      {src ? <img src={src} alt="" width={size} height={size} draggable={false} className="h-full w-full object-cover" /> : <Silhouette />}
    </span>
  );
}

/**
 * A character's portrait (P1). `portrait` comes from the getPortrait selector; the image is a cached thumbnail, so a list
 * of portraits costs nothing after its first visit. `label` is what a screen reader hears ("Mia, your mother").
 */
export function CharacterPortrait({ portrait, size, label, className = '' }: { portrait: AppearanceInput; size: number; label: string; className?: string }) {
  // A different appearance (they aged, or dyed their hair) is a fresh image: start over rather than show the old one.
  const signature = hashSettings(JSON.stringify(portrait));
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="character-portrait"
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 overflow-hidden rounded-full bg-surface-2 ${className}`}
    >
      <PortraitImage key={signature} portrait={portrait} size={size} />
    </span>
  );
}
