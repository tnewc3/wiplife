import { Plus } from 'lucide-react';
import { canAgeUp } from '../../engine/selectors';
import { useAppStore } from '../../store/appStore';

/** A light tap of haptic feedback where the device has it and the player hasn't asked for less motion. */
function buzz(): void {
  try {
    if (typeof navigator.vibrate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate(10);
  } catch {
    // No haptics here; the press animation is enough.
  }
}

/**
 * The Age button (U1): the big coral button between the tabs. Disabled while a year is advancing, so rapid taps can't
 * advance two years (the store and the engine guard against it too). Ages up from any tab and stays on it.
 */
export function AgeUpButton() {
  const aging = useAppStore((s) => s.aging);
  // 'yearEnd' only after an interrupted year; Age then finishes it.
  const ready = useAppStore((s) => (s.life ? canAgeUp(s.life) || s.life.phase === 'yearEnd' : false));
  const ageUp = useAppStore((s) => s.ageUp);
  return (
    <button
      type="button"
      aria-label="Age up"
      aria-busy={aging}
      disabled={aging || !ready}
      data-testid="age-up"
      onClick={() => {
        buzz();
        void ageUp();
      }}
      className="font-display flex size-[4.5rem] shrink-0 -translate-y-3 flex-col items-center justify-center rounded-full border-4 border-bg bg-age text-age-contrast shadow-lg transition-transform select-none active:scale-90 enabled:active:animate-[wl-pop_220ms_ease-out] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus aria-hidden="true" size={22} strokeWidth={3.5} />
      <span className="-mt-1 text-sm leading-none font-bold tracking-wide">AGE</span>
    </button>
  );
}
