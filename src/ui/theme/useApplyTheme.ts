import { useEffect } from 'react';
import type { Theme } from '../../persistence';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

/**
 * Applies the chosen theme to <html data-theme> and the browser chrome color.
 * With "system", follows the OS setting live.
 */
export function useApplyTheme(theme: Theme): void {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => {
      const resolved = resolveTheme(theme, media.matches);
      const root = document.documentElement;
      root.dataset.theme = resolved;
      const bg = getComputedStyle(root).getPropertyValue('--wl-bg').trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute('content', bg);
        meta.removeAttribute('media');
      });
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
