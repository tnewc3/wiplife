import { canAgeUp } from '../../engine/selectors';
import { useAppStore } from '../../store/appStore';
import { Button } from './Button';

/**
 * The primary action on every main game screen. Disabled while a year is
 * advancing, so rapid taps can't advance two years (the store and the engine
 * guard against it too).
 */
export function AgeUpButton() {
  const aging = useAppStore((s) => s.aging);
  // 'yearEnd' only after an interrupted year; Age Up then finishes it.
  const ready = useAppStore((s) => (s.life ? canAgeUp(s.life) || s.life.phase === 'yearEnd' : false));
  const ageUp = useAppStore((s) => s.ageUp);
  return (
    <div className="px-safe border-t border-border bg-bg py-3">
      <Button size="lg" block disabled={aging || !ready} aria-busy={aging} onClick={() => void ageUp()}>
        Age Up
      </Button>
    </div>
  );
}
