/**
 * A simple model of a player's relationship choices for the simulation
 * runner: between years it sometimes asks someone out, proposes, gets
 * married, or ends things when affection has run low. These chances describe
 * the simulated player, not the game, so they live here rather than in the
 * balance files; Stage 12's strategy bots replace this.
 */
import type { ActionId, ContentBundle } from '../../src/content/schemas';
import { availableActions } from '../../src/engine/actions';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';

/** Yearly chance the bot takes each action when it can, by how the person feels about you. */
const POLICY: Record<ActionId, (affection: number) => number> = {
  ask_out: (a) => (a >= 55 ? 0.3 : 0.08),
  propose: (a) => (a >= 60 ? 0.35 : 0.05),
  marry: () => 0.6,
  break_up: (a) => (a < 35 ? 0.35 : 0.03),
  divorce: (a) => (a < 25 ? 0.3 : 0.004),
  cut_contact: (a) => (a < 15 ? 0.05 : 0),
  reconcile: () => 0.1,
};

/** Asking out, at most one person a year. */
const ONCE_A_YEAR: ActionId[] = ['ask_out'];

/** The actions the bot takes this year, as [actionId, personId], drawing from `rng`. */
export function chooseActions(life: LifeState, content: ContentBundle, rng: RngState): [ActionId, string][] {
  const taken: [ActionId, string][] = [];
  const askable: string[] = [];
  for (const id of Object.keys(life.relationships).sort()) {
    const affection = life.relationships[id]!.affection;
    for (const action of availableActions(life, id, content)) {
      if (ONCE_A_YEAR.includes(action.id)) {
        if (chance(rng, POLICY[action.id](affection))) askable.push(id);
      } else if (chance(rng, POLICY[action.id](affection))) {
        taken.push([action.id, id]);
      }
    }
  }
  if (askable.length > 0) taken.push(['ask_out', pick(rng, askable)]);
  return taken;
}
