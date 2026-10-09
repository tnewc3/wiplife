/**
 * The fame effects events can have (E6b): starting a career or crossing over,
 * moving on the ladder, fame, public image, fan mood, craft and burnout, your
 * commitment, an agent, a contract, the scene, retiring and coming back, a
 * stalker, and money from the work. The engine ignores what doesn't fit (no
 * career, a path that can't be started), and never what would break a rule: a
 * parent signs for anyone under 18, and a stalker is for adults.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { spend } from '../finance';
import { clampInt } from '../random';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import {
  bigBreak,
  climb,
  comeback,
  crossOver,
  endContract,
  enterPath,
  payFameMoney,
  retire,
  setAgentTier,
  signContract,
} from './ladder';
import { endStalker, orderStalker, reportStalker, startStalker } from './people';
import { isMinorStar, mainPath, pathDef, rungDef, sizeAmount } from './query';

type FameEffect = Extract<Effect, { type: 'fame' }>;
type PayEffect = Extract<Effect, { type: 'famePay' }>;

const ORDER = { back: 0, steady: 1, all: 2 } as const;

/** The lowest commitment you can hold now: a contract asks for a steady one, and anyone young can't go all in. */
export function commitmentFloor(state: LifeState, content: ContentBundle): 'back' | 'steady' | 'all' {
  return state.fame.contract ? content.balance.fame.contracts.minCommitment : 'back';
}

export function commitmentCeiling(state: LifeState, content: ContentBundle): 'back' | 'steady' | 'all' {
  return isMinorStar(state, content) ? content.balance.fame.commitment.minorsMax : 'all';
}

export function applyFameEffect(state: LifeState, effect: FameEffect, cast: Record<string, Id>, content: ContentBundle, rng: RngState): void {
  const f = state.fame;
  const role = effect.role === undefined ? undefined : cast[effect.role];
  const delta = effect.delta ?? 0;
  switch (effect.action) {
    case 'enter':
      enterPath(state, effect.path!, effect.route, content);
      return;
    case 'comeback':
      comeback(state, content);
      return;
    case 'retire':
      retire(state, content);
      return;
    default:
      break;
  }
  if (!f.active || f.main === null) return;
  const main = mainPath(state);
  const def = pathDef(content, f.main);
  switch (effect.action) {
    case 'cross':
      crossOver(state, effect.path!, content);
      return;
    case 'rung':
      if (main && def) {
        main.rung = clampInt(main.rung + delta, 1, def.rungs.length);
        main.peak = Math.max(main.peak, main.rung);
        main.fame = Math.max(main.fame, rungDef(def, main.rung).fame);
        if (delta < 0) main.fame = Math.min(main.fame, rungDef(def, main.rung).fame + 1);
        climb(state, f.main, content);
      }
      return;
    case 'break':
      for (let i = 0; i < delta; i++) if (bigBreak(state, f.main, content, rng) === 0) break;
      return;
    case 'fame':
      if (main) {
        main.fame = Math.max(0, Math.min(100, main.fame + delta));
        climb(state, f.main, content);
      }
      return;
    case 'image':
      f.image = clampInt(f.image + delta, 0, 100);
      return;
    case 'mood':
      f.mood = clampInt(f.mood + delta, 0, 100);
      return;
    case 'craft':
      if (main) main.craft = clampInt(main.craft + delta, 0, 100);
      return;
    case 'burnout':
      f.burnout = clampInt(f.burnout + delta, 0, 100);
      return;
    case 'fans':
      f.fans = Math.max(0, Math.round(f.fans * (1 + delta / 100)));
      return;
    case 'commitment': {
      const v = effect.value!;
      if (ORDER[v] <= ORDER[commitmentCeiling(state, content)] && ORDER[v] >= ORDER[commitmentFloor(state, content)]) f.commitment = v;
      else if (v === 'back') f.commitment = commitmentFloor(state, content);
      return;
    }
    case 'agent':
      setAgentTier(state, effect.tier!, content);
      return;
    case 'contract':
      signContract(state, effect.terms!, content, rng);
      return;
    case 'end_contract':
      endContract(state, effect.how!, content);
      return;
    case 'scene':
      f.scene = effect.scene!;
      return;
    case 'stalker':
      if (effect.step === 'start') {
        if (role !== undefined) startStalker(state, role, content);
      } else if (effect.step === 'report') reportStalker(state, content, rng);
      else if (effect.step === 'order') orderStalker(state, content, rng);
      else endStalker(state);
      return;
  }
}

export function applyFamePayEffect(state: LifeState, effect: PayEffect, content: ContentBundle): void {
  if (!state.fame.active && state.fame.retired === undefined) return;
  if (effect.gain !== undefined) payFameMoney(state, sizeAmount(state, effect.gain, content), content);
  else if (effect.cost !== undefined) spend(state, sizeAmount(state, effect.cost, content), content);
}
