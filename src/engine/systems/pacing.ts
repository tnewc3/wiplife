/**
 * Pacing director (year pipeline step 9). Empty until Stage 4 builds this system.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

/** Step 9: queue due scheduled events first, then pick new events. Stage 4 fills this in; it does nothing yet. */
export function runPacing(_state: LifeState, _content: ContentBundle): void {
  // Intentionally empty until Stage 4.
}
