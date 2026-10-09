/**
 * The `later` effect (L1): what an event or interaction can do in later
 * life. Care, hospice, amends, raising or returning a grandchild, and
 * mentoring one. The engine ignores anything that does not fit now, so a
 * stale event cannot break a life.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { recordAmends } from './amends';
import { chooseCare } from './care';
import { raiseGrandchild, returnGrandchild, teachGrandchild } from './grandchildren';
import { setHospice } from './terminal';

export function applyLaterEffect(state: LifeState, effect: Extract<Effect, { type: 'later' }>, cast: Record<string, Id>, rng: RngState, content: ContentBundle): void {
  const id = effect.role === undefined ? undefined : cast[effect.role];
  switch (effect.action) {
    case 'care':
      if (effect.option !== undefined) chooseCare(state, effect.option, id, content);
      return;
    case 'hospice':
      if (effect.choice !== undefined) setHospice(state, effect.choice);
      return;
    case 'amends':
      if (effect.source !== undefined && effect.result !== undefined) recordAmends(state, effect.source, id, effect.result, content);
      return;
    case 'raise':
      if (id !== undefined) raiseGrandchild(state, id, rng, content);
      return;
    case 'return':
      if (id !== undefined) returnGrandchild(state, id, content);
      return;
    case 'teach':
      if (id !== undefined && effect.key !== undefined && effect.delta !== undefined) teachGrandchild(state, id, effect.key, effect.delta);
      return;
  }
}
