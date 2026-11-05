/** A light tap on devices that can buzz (U3: actions give a light haptic). Does nothing elsewhere, and never throws. */
export function lightHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8);
  } catch {
    // A browser that refuses to vibrate is fine.
  }
}
