/**
 * Effect handlers (docs/technical.md, "Event engine internals"). Each effect
 * type has one handler; adding a type means a schema in
 * src/content/schemas/events.ts and a handler here, without touching events.
 */
import type { ContentBundle, Effect, EffectStatKey, EventDef } from '../../content/schemas';
import { HIDDEN_KEYS, STAT_KEYS } from '../../content/schemas';
import { clampInt } from '../random';
import { nextInt, type RngState } from '../rng';
import { addHistory } from '../systems/history';
import { renderText } from '../text';
import type { Id, LifeState } from '../types';
import { textContext } from './text';

export interface EffectContext {
  def: EventDef;
  cast: Record<string, Id>;
  rng: RngState;
  content: ContentBundle;
}

type Handler<T extends Effect['type']> = (state: LifeState, effect: Extract<Effect, { type: T }>, ctx: EffectContext) => void;

function adjustScore(state: LifeState, key: EffectStatKey, delta: number): void {
  const c = state.character;
  if ((STAT_KEYS as readonly string[]).includes(key)) {
    const k = key as keyof typeof c.stats;
    c.stats[k] = clampInt(c.stats[k] + delta, 0, 100);
  } else if ((HIDDEN_KEYS as readonly string[]).includes(key)) {
    const k = key as (typeof HIDDEN_KEYS)[number];
    c.hidden[k] = clampInt(c.hidden[k] + delta, 0, 100);
  } else {
    const k = key as keyof typeof c.personality;
    c.personality[k] = clampInt(c.personality[k] + delta, 0, 100);
  }
}

const handlers: { [T in Effect['type']]: Handler<T> } = {
  stat: (state, effect) => adjustScore(state, effect.key, effect.delta),

  money: (state, effect) => {
    // Savings only until Stage 6; a cost larger than savings stops at zero.
    const next = state.finances.savings + effect.delta;
    state.finances.savings = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, next));
  },

  relationship: (state, effect, ctx) => {
    const rel = state.relationships[ctx.cast[effect.role] ?? ''];
    if (!rel) return;
    if (effect.affection !== undefined) rel.affection = clampInt(rel.affection + effect.affection, 0, 100);
    if (effect.trust !== undefined) rel.trust = clampInt(rel.trust + effect.trust, 0, 100);
    if (effect.status !== undefined) rel.status = effect.status;
    if (effect.kind !== undefined) rel.kind = effect.kind;
  },

  memory: (state, effect, ctx) => {
    const rel = state.relationships[ctx.cast[effect.role] ?? ''];
    rel?.memories.push({ tag: effect.tag, year: state.currentYear });
  },

  flag: (state, effect) => {
    state.flags[effect.key] = effect.value;
  },

  schedule: (state, effect, ctx) => {
    const cast: Record<string, Id> = {};
    for (const role of effect.cast ?? []) {
      const id = ctx.cast[role];
      if (id !== undefined) cast[role] = id;
    }
    const [min, max] = effect.inYears;
    state.scheduled.push({ eventId: effect.eventId, dueYear: state.currentYear + nextInt(ctx.rng, min, max), cast });
  },

  history: (state, effect, ctx) => {
    const text = renderText(effect.text, textContext(state, ctx.cast));
    const legendary = ctx.def.rarity === 'legendary';
    addHistory(
      state,
      {
        text,
        tags: ['event', ctx.def.id, ...(legendary ? ['legendary'] : [])],
        importance: effect.importance,
        ...(legendary ? { legendary: true } : {}),
      },
      ctx.content,
    );
  },

  death: (state, effect) => {
    // endYear closes the life (history entry, recap, dead phase).
    if (state.death) return;
    state.death = { year: state.currentYear, age: state.character.age, causeId: effect.cause };
  },
};

/** Applies effects in order. */
export function applyEffects(state: LifeState, effects: readonly Effect[], ctx: EffectContext): void {
  for (const effect of effects) {
    (handlers[effect.type] as Handler<typeof effect.type>)(state, effect as never, ctx);
  }
}
