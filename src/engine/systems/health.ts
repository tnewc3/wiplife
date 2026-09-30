/**
 * Health conditions (year pipeline step 6). Empty until Stage 9 builds this
 * system. Age-related Health decline is part of aging (step 1).
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

/** Step 6: progress conditions and roll for new ones. Stage 9 fills this in; it does nothing yet. */
export function runHealth(_state: LifeState, _content: ContentBundle): void {
  // Intentionally empty until Stage 9.
}
