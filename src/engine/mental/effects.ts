/** The `mental` effect (M1): what an event (or an action) does to your mental health. Rules live in the other files of this folder. */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { startCare, stopCare, payMentalCost } from './care';
import { applyCrisis } from './crisis';
import { diagnose, undiagnosed } from './diagnose';
import { noteNoticed, rollReaction } from './notice';
import { careOf, namedMental } from './query';

type MentalEffect = Extract<Effect, { type: 'mental' }>;

/** The conditions an effect is about: the one it names, or every one that fits. */
function targets(effect: MentalEffect, all: () => Id[]): Id[] {
  return effect.conditionId !== undefined ? [effect.conditionId] : all();
}

export function applyMentalEffect(state: LifeState, effect: MentalEffect, cast: Record<string, Id>, content: ContentBundle): void {
  switch (effect.action) {
    case 'trauma':
      state.health.mental.trauma = clampInt(state.health.mental.trauma + (effect.amount ?? 0), 0, 100);
      return;
    case 'diagnose':
      for (const id of targets(effect, () => undiagnosed(state, content))) diagnose(state, id, effect.via ?? 'assessment', content);
      return;
    case 'start':
      for (const id of targets(effect, () => namedMental(state, content).map((h) => h.def.id))) startCare(state, id, effect.care!, content);
      return;
    case 'stop':
      for (const id of targets(effect, () => namedMental(state, content).filter((h) => careOf(h.condition).includes(effect.care!)).map((h) => h.def.id))) stopCare(state, id, effect.care!, content);
      return;
    case 'pay':
      payMentalCost(state, effect.item!, content);
      return;
    case 'crisis':
      applyCrisis(state, content);
      return;
    case 'confide': {
      const id = cast[effect.role!];
      const rel = id === undefined ? undefined : state.relationships[id];
      if (id === undefined || !rel || !state.people[id]?.alive) return;
      const reaction = state.health.mental.noticed[id]?.reaction ?? rollReaction(state, id, content);
      noteNoticed(state, id, reaction, true);
      const change = content.balance.mentalHealth.confide[reaction];
      rel.affection = clampInt(rel.affection + change.affection, 0, 100);
      rel.trust = clampInt(rel.trust + change.trust, 0, 100);
      if (reaction !== 'neutral') rel.memories.push({ tag: reaction === 'supportive' ? 'stood_by_you_struggling' : 'brushed_you_off', year: state.currentYear });
      const next = effect.then?.[reaction];
      if (next !== undefined) state.scheduled.push({ eventId: next, dueYear: state.currentYear + 1, cast: { [effect.role!]: id }, since: state.currentYear });
      return;
    }
  }
}
