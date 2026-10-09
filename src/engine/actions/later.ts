/**
 * Later-life actions (L1, More → Later life): arrange how you are looked
 * after near the end, and set your final wishes when a death is coming. Both
 * take effect at once, between years. The checks live with the rules
 * (../later), so an event's choice and the screen agree.
 */
import { CARE_OPTIONS } from '../../content/schemas';
import { canChooseCare, chooseCare } from '../later/care';
import { canSetWishes, parseWishes, setWishes } from '../later/terminal';
import type { CareOption, Id } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const LATER_ACTION_IDS = ['set_final_wishes', 'choose_care'] as const;
export type LaterActionId = (typeof LATER_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);

export const LATER_ACTIONS: Record<LaterActionId, LifeActionRule> = {
  set_final_wishes: {
    // The shape only; the people are checked against the life when the action is taken.
    parse: (params): LifeActionParams | null => {
      const o = field(params, 'wishes');
      return typeof o === 'object' && o !== null ? { wishes: o as NonNullable<LifeActionParams['wishes']> } : null;
    },
    allowed: (state, p, content) => canSetWishes(state) && parseWishes(p.wishes, state, content) !== null,
    apply: (state, p, content) => {
      const wishes = parseWishes(p.wishes, state, content);
      if (wishes) setWishes(state, wishes, state.rng, content);
    },
  },
  choose_care: {
    parse: (params): LifeActionParams | null => {
      const option = field(params, 'careOption');
      const carerId = field(params, 'carerId');
      if (!(CARE_OPTIONS as readonly unknown[]).includes(option)) return null;
      if (carerId !== undefined && typeof carerId !== 'string') return null;
      return { careOption: option as CareOption, ...(carerId !== undefined ? { carerId: carerId as Id } : {}) };
    },
    allowed: (state, p, content) => state.phase === 'yearStart' && p.careOption !== undefined && canChooseCare(state, p.careOption, p.carerId, content),
    apply: (state, p, content) => {
      if (p.careOption !== undefined) chooseCare(state, p.careOption, p.carerId, content);
    },
  },
};
