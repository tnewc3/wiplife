import { useEffect, useRef, useState } from 'react';

/** Does the player ask for less motion? Follows the setting live. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Calls `frame(seconds since the loop began)` on every animation frame while `active`; the loop keeps its start across renders. */
export function useFrames(active: boolean, frame: (seconds: number) => void): void {
  const latest = useRef(frame);
  useEffect(() => {
    latest.current = frame;
  });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const start = performance.now();
    const tick = (now: number) => {
      latest.current((now - start) / 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
