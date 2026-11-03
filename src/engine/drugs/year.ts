/**
 * The year of a habit (D1): what a drug does to you across a year, once a year, as it begins.
 *
 * - Use last year (and, if the habit has hold of you, the use it forced): tolerance and dependence move; a year with no
 *   use brings them down and, for someone who stopped, a first clean year of withdrawal.
 * - A habit past the line pulls on Health, Happiness and Stress, costs money, and takes from work, school and the people
 *   close to you (and people notice: the social web already talks about an addiction, and an event follows).
 * - An overdose can happen: a scare, then an ER visit, and only after warning signs, rarely, a death. It is never the
 *   first thing that happens (./use.ts makes the first warning); see `overdoseYear`.
 * - Someone who is quitting or recovered can go back (a relapse), less so the longer they stay clean and with support.
 *
 * Numbers: balance/drugs.yaml (habit, overdose, recovery).
 */
import type { ContentBundle, DrugDef } from '../../content/schemas';
import { spend } from '../finance';
import { erVisit, scare } from './use';
import { clampInt } from '../random';
import { chance, nextInt } from '../rng';
import type { DrugHabit, Id, LifeState } from '../types';
import { addDependence, addTolerance, syncAddiction } from './habit';
import { drugDef, drugIds, rollYear, unitPrice } from './query';
import { dollarText, say } from './text';

/** What the year gave: for the step to queue events. */
export interface HabitYear {
  craving: boolean;
  withdrawal: boolean;
  noticed: boolean;
  tempted: boolean;
  scare: boolean;
  er: boolean;
  usedAny: boolean;
}

function supportedRecently(state: LifeState, content: ContentBundle): boolean {
  const p = state.pastimes;
  if (p.year < state.currentYear - 1) return false;
  return content.balance.drugs.recovery.activities.some((id) => (p.counts[id] ?? 0) > 0);
}

/** A habit is in recovery: it once passed the line, and nothing has been used since you quit. */
export function inRecovery(h: DrugHabit, content: ContentBundle): boolean {
  return h.peak >= content.balance.drugs.threshold && h.quitYear > 0;
}

/** The yearly relapse chance of a habit in recovery. Reads only. */
export function relapseChance(state: LifeState, h: DrugHabit, content: ContentBundle): number {
  const r = content.balance.drugs.recovery.relapse;
  const stress = Math.max(0, state.character.stats.stress - 50);
  let p = Math.max(r.floor, r.base * (1 - r.fall) ** h.clean) + stress * r.stress;
  if (supportedRecently(state, content)) p *= r.supported;
  return Math.min(0.9, Math.max(0, p));
}

/** The points of performance a habit takes from work now (added to the Career hub's penalty). */
export function impairment(state: LifeState, content: ContentBundle): number {
  let total = 0;
  for (const [id, h] of Object.entries(state.drugs.habits)) {
    const def = drugDef(content, id);
    if (!def) continue;
    total += def.long.work * Math.min(1.5, h.dependence / 100 + (h.year === state.currentYear ? h.uses / content.balance.drugs.habit.heavyUses / 2 : 0));
  }
  return Math.round(Math.min(15, total) * 10) / 10;
}

function bonds(state: LifeState, amount: number): void {
  const closest = Object.values(state.relationships)
    .filter((r) => r.status === 'active' && (r.kind === 'partner' || r.kind === 'spouse' || r.kind === 'parent' || r.kind === 'child' || r.kind === 'friend' || r.kind === 'sibling'))
    .sort((a, b) => b.affection - a.affection || (a.personId < b.personId ? -1 : 1))
    .slice(0, 3);
  for (const r of closest) r.affection = clampInt(r.affection - amount, 0, 100);
}

/** The year of one habit. */
function habitYear(state: LifeState, id: Id, def: DrugDef, prevUses: number, out: HabitYear, jailed: boolean, content: ContentBundle): void {
  const b = content.balance.drugs;
  const h = state.drugs.habits[id]!;
  const stats = state.character.stats;
  const abstaining = h.quitYear > 0 || jailed;
  const t = b.threshold;

  // The habit's own pull: someone past the line who has not quit keeps using, from stock first and then bought.
  let auto = 0;
  if (!abstaining && h.dependence >= b.habit.craving) {
    auto = Math.round((b.habit.maxUses * h.dependence) / 100);
    const stock = state.drugs.stock[id];
    const fromStock = Math.min(stock?.units ?? 0, auto);
    if (stock && fromStock > 0) {
      stock.units -= fromStock;
      if (stock.units <= 0) delete state.drugs.stock[id];
    }
    const bought = auto - fromStock;
    if (bought > 0) {
      const cost = Math.round(Math.min(bought * unitPrice(state, def, 'market', 50, content), (b.habit.cost * h.dependence) / 100));
      spend(state, cost, content);
    }
  }
  const uses = prevUses + auto;
  if (uses > 0) {
    out.usedAny = true;
    h.clean = 0;
    h.recovered = false;
    // Use has to keep up: without the habit's own pull dependence slips a little every year.
    if (auto === 0) h.dependence = Math.round(Math.max(0, h.dependence - b.habit.decay) * 10) / 10;
    if (auto > 0) {
      h.total += auto;
      h.last = state.currentYear;
      state.drugs.totals.uses += auto;
      addDependence(state, id, def.strength * 0.12, content);
      addTolerance(state, id, def.tolerance * Math.min(auto, 10) * 0.3);
    }
    const heavy = Math.max(h.dependence / 100, uses / b.habit.heavyUses / 2);
    const scale = Math.min(1.5, heavy);
    if (h.dependence >= t || uses >= b.habit.heavyUses) {
      stats.health = clampInt(Math.round(stats.health - def.long.health * scale), 0, 100);
      if (h.dependence >= t) {
        stats.happiness = clampInt(Math.round(stats.happiness - 3 * (h.dependence / 100)), 0, 100);
        stats.stress = clampInt(Math.round(stats.stress + 3 * (h.dependence / 100)), 0, 100);
      }
      const edu = state.education.current;
      if (edu && def.long.school > 0) edu.boost = Math.round((edu.boost - def.long.school * scale) * 100) / 100;
      if (def.long.bonds > 0) bonds(state, def.long.bonds * scale);
    }
    out.craving = out.craving || h.dependence >= b.habit.craving;
    if (h.dependence >= b.habit.notice.at && chance(state.rng, b.habit.notice.chance)) out.noticed = true;
  } else if (h.dependence > 0 || h.tolerance > 0) {
    // A year with no use.
    const wasPast = h.dependence >= b.habit.craving;
    h.clean += 1;
    h.dependence = Math.round(Math.max(0, h.dependence - b.habit.clean.dependence * (abstaining ? 1.5 : 1)) * 10) / 10;
    h.tolerance = Math.round(Math.max(0, h.tolerance - b.habit.clean.tolerance) * 10) / 10;
    if (wasPast && h.clean === 1) {
      stats.stress = clampInt(Math.round(stats.stress + (b.recovery.withdrawalYear * def.withdrawal) / 10), 0, 100);
      out.withdrawal = true;
      say(state, 'withdrawal', { drug: def.noun }, content);
    }
    if (h.quitYear > 0 && h.peak >= t && h.dependence >= b.habit.craving) out.craving = true;
  }

  // Recovery and relapse.
  if (inRecovery(h, content) && uses === 0) {
    if (!h.recovered && h.clean >= b.recovery.recoveredYears && h.dependence < t) {
      h.recovered = true;
      state.drugs.totals.recoveries += 1;
      say(state, 'recovered', { drug: def.noun }, content);
    }
    if (chance(state.rng, relapseChance(state, h, content))) {
      h.quitYear = 0;
      h.recovered = false;
      h.relapses += 1;
      h.clean = 0;
      h.dependence = Math.max(h.dependence, Math.round(h.peak * b.recovery.relapseShare));
      state.drugs.totals.relapses += 1;
      say(state, 'relapsed', { drug: def.noun }, content);
    } else if (chance(state.rng, b.events.tempted)) {
      out.tempted = true;
    }
  }
}

/**
 * The chance that a year of use goes badly wrong for one drug, and what comes of it. A death needs warning signs first.
 * Draws from the life's generator.
 */
export function overdoseYear(state: LifeState, id: Id, def: DrugDef, uses: number, mixed: boolean, out: HabitYear, content: ContentBundle): void {
  const b = content.balance.drugs;
  const h = state.drugs.habits[id]!;
  if (uses <= 0 || h.total <= 1) return;
  const heavy = uses >= b.habit.heavyUses || h.dependence >= 50;
  const rolls = Math.max(1, Math.ceil(uses / b.overdose.rollEvery));
  let p = def.overdose * (heavy ? b.use.doses.heavy.risk / 2 : 1);
  p *= 1 + (h.tolerance / 100) * b.overdose.tolerance * (heavy ? 1 : 0.3);
  p *= 1 + (h.dependence / 100) * b.overdose.dependence;
  if (mixed) p *= b.use.mixing;
  p = Math.min(0.4, p);
  for (let i = 0; i < rolls; i++) {
    if (!chance(state.rng, p)) continue;
    const o = b.overdose.outcomes;
    const signs = state.drugs.signs.count >= b.overdose.signsForDeath && state.currentYear - state.drugs.signs.last <= b.overdose.signsFade;
    const total = o.scare + o.er + (signs ? o.death : 0);
    let r = nextInt(state.rng, 0, 999) / 1000 * total;
    if (r < o.scare) {
      scare(state, content, id);
      say(state, 'scare', { drug: def.noun }, content);
      out.scare = true;
      return;
    }
    r -= o.scare;
    if (r < o.er || !signs) {
      const bill = erVisit(state, content, id);
      say(state, 'er', { drug: def.noun, amount: dollarText(state, bill, content) }, content);
      out.er = true;
      return;
    }
    // Death: only with warning signs behind it, from an overdose.
    if (!state.death) {
      state.death = { year: state.currentYear, age: state.character.age, causeId: 'overdose' };
      state.drugs.totals.overdoseDeaths += 1;
      say(state, 'overdose', { drug: def.noun }, content);
    }
    return;
  }
}

/** Runs the year of every habit; returns what happened for the step to queue events. */
export function runHabits(state: LifeState, content: ContentBundle, jailed: boolean): HabitYear {
  const out: HabitYear = { craving: false, withdrawal: false, noticed: false, tempted: false, scare: false, er: false, usedAny: false };
  const prev: Record<Id, number> = {};
  for (const [id, h] of Object.entries(state.drugs.habits)) prev[id] = h.year === state.currentYear - 1 ? h.uses : h.year === state.currentYear ? h.uses : 0;
  const usedDrugs = Object.keys(prev).filter((id) => (prev[id] ?? 0) > 0).length;
  for (const id of drugIds(content)) {
    const h = state.drugs.habits[id];
    const def = drugDef(content, id);
    if (!h || !def) continue;
    habitYear(state, id, def, jailed ? 0 : (prev[id] ?? 0), out, jailed, content);
    const uses = jailed ? 0 : (prev[id] ?? 0) + (h.dependence >= content.balance.drugs.habit.craving && h.quitYear === 0 ? Math.round((content.balance.drugs.habit.maxUses * h.dependence) / 100) : 0);
    if (!state.death) overdoseYear(state, id, def, uses, usedDrugs > 1, out, content);
  }
  rollYear(state);
  syncAddiction(state, content);
  return out;
}
