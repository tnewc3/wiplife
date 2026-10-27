/**
 * The WIPlife wordmark (U1): the name in Fredoka with a small progress bar under it, for "work in progress".
 * Drawn as SVG text so it takes the theme's colors; the bar is partly filled with the Age button's coral.
 */
export function Logo({ className = '', title = 'WIPlife' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 200 64" role="img" aria-label={title} className={className} xmlns="http://www.w3.org/2000/svg">
      <text x="100" y="40" textAnchor="middle" fontFamily="Fredoka, Nunito, system-ui, sans-serif" fontWeight="700" fontSize="44" fill="currentColor">
        WIP<tspan fill="var(--wl-age)">life</tspan>
      </text>
      <rect x="30" y="50" width="140" height="8" rx="4" fill="var(--wl-bar-track)" />
      <rect x="30" y="50" width="86" height="8" rx="4" fill="var(--wl-age)" />
    </svg>
  );
}
