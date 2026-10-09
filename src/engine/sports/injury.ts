/**
 * Sports injuries (E6c) run through the health system: an injury is a
 * condition (src/content/conditions, kind injury) with a severity that heals
 * by its own course, faster once treated. Each season carries a risk, from the
 * sport's hazard, the level of play, age, Fitness, how hard you commit and
 * whether you are playing through pain. Playing through pain helps this
 * year's rating and the playoffs, and raises the risk of a worse injury; a
 * serious enough one ends a career. A pro team pays for treatment; anyone
 * else pays. Numbers: balance/sports.yaml.
 */
import type { ContentBundle, FamePathDef, SportDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { addCondition, changeSeverity, conditionOf, setTreated } from '../health';
import { sizeAmount } from '../fame/query';
import { spend } from '../finance';
import { weightedPick } from '../random';
import { chance, nextInt, type RngState } from '../rng';
import type { LifeState } from '../types';
import { injuryNow } from './query';

/** The chance of getting hurt this season. */
export function injuryRisk(state: LifeState, def: SportDef, level: keyof ContentBundle['balance']['sports']['injury']['level'], content: ContentBundle): number {
  const b = content.balance.sports;
  const focus = b.performance.focus[state.sports.focus].risk;
  const pain = state.sports.pain ? b.injury.pain : 1;
  const p =
    b.injury.base *
    def.hazard *
    b.injury.level[level] *
    curveAt(b.injury.age, state.character.age) *
    curveAt(b.injury.fitness, state.character.stats.fitness) *
    b.injury.commitment[state.fame.commitment] *
    focus *
    pain;
  return Math.min(0.9, Math.max(0, p));
}

/** Rolls the season's injury. Returns it (and gives it to you) or null. A condition you already have gets worse instead. */
export function rollInjury(state: LifeState, path: FamePathDef & { sport: SportDef }, level: keyof ContentBundle['balance']['sports']['injury']['level'], content: ContentBundle, rng: RngState): { conditionId: string; severity: number } | null {
  if (!chance(rng, injuryRisk(state, path.sport, level, content))) return null;
  const options = path.sport.injuries.filter((i) => content.conditions[i.id] && !content.conditions[i.id]!.retired).map((i) => [i, i.weight] as const);
  if (options.length === 0) return null;
  const injury = weightedPick(rng, options);
  const severity = nextInt(rng, injury.min, Math.max(injury.min, injury.max));
  addCondition(state, injury.id, severity, content);
  const t = state.sports.totals;
  t.injuries += 1;
  if (severity >= content.balance.sports.injury.aggravate.endsAt * 0.6) t.serious += 1;
  return { conditionId: injury.id, severity: conditionOf(state, injury.id)?.severity ?? severity };
}

/** Whether a pro team pays for treatment now. */
export function teamPays(state: LifeState): boolean {
  return state.sports.pro && state.sports.team?.level === 'pro';
}

/** Treats your worst sports injury: the team pays, or you do (a cost sized to where you are). */
export function treatInjury(state: LifeState, def: SportDef, content: ContentBundle): boolean {
  const worst = injuryNow(state, def);
  if (!worst) return false;
  const had = conditionOf(state, worst.conditionId);
  if (!had || had.treated) return false;
  if (!teamPays(state)) {
    const cost = sizeAmount(state, content.balance.sports.injury.treatment, content);
    spend(state, cost, content);
  }
  setTreated(state, worst.conditionId, true, content);
  return true;
}

/**
 * Last year's decision to play through pain comes due: the injury may be worse,
 * and past a point the career is over. Returns what happened.
 */
export function agePain(state: LifeState, def: SportDef, content: ContentBundle, rng: RngState): 'worse' | 'ended' | null {
  if (!state.sports.pain) return null;
  const worst = injuryNow(state, def);
  if (!worst) return null;
  const a = content.balance.sports.injury.aggravate;
  if (!chance(rng, a.chance)) return null;
  const add = nextInt(rng, a.min, Math.max(a.min, a.max));
  const had = conditionOf(state, worst.conditionId);
  const next = (had?.severity ?? worst.severity) + add;
  if (had) had.severity = Math.min(100, next);
  state.sports.totals.serious += 1;
  state.sports.totals.playedThrough += 1;
  return next >= a.endsAt ? 'ended' : 'worse';
}

/** The share of games a sports injury costs you this season (0–1). */
export function missedShare(state: LifeState, def: SportDef, content: ContentBundle): number {
  const worst = injuryNow(state, def);
  if (!worst) return 0;
  const pain = state.sports.pain ? 0.5 : 1;
  return Math.min(0.9, worst.severity * content.balance.sports.injury.missed * pain);
}

/** You ease the injury off: a doctor's rest takes some severity at once (surgery takes more). */
export function easeInjury(state: LifeState, def: SportDef, amount: number, content: ContentBundle): void {
  const worst = injuryNow(state, def);
  if (worst) changeSeverity(state, worst.conditionId, -amount, content);
}
