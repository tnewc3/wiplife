/**
 * Health rules (docs/design.md, sections E and F; docs/technical.md, Stage 9):
 * the conditions you have, how they start, change and end, what treatment
 * does, what seeing a doctor costs and does, and how likely a condition is
 * to kill. The yearly health step (./systems/health.ts), the doctor action,
 * effects, conditions, the death check, selectors and invariants all use
 * these functions, so each rule lives in one place. Numbers come from
 * src/content/balance/health.yaml; conditions from src/content/conditions.
 *
 * Medical costs go through the debt system (./finance.ts): what savings
 * can't cover becomes medical debt. A child's family pays for them.
 */
import type { ConditionDef, ContentBundle, DoctorResult, ONSET_FACTOR_KEYS } from '../content/schemas';
import { evaluate } from './conditions';
import { curveAt } from './curve';
import { addDebt, isIndependent, setMinPayment, wholeDollars } from './finance';
import { rollDiagnosis } from './mental/diagnose';
import { circleSupport, isMentalKind } from './mental/query';
import { clampInt } from './random';
import { chance, nextInt } from './rng';
import { writeFromGroup } from './systems/history';
import type { HealthCondition, Id, LifeState } from './types';

/** An active (not retired) condition, or undefined. */
export function activeCondition(content: ContentBundle, id: Id): ConditionDef | undefined {
  const def = content.conditions[id];
  return def && !def.retired ? def : undefined;
}

/** The condition you have with this id, if you have it. */
export function conditionOf(state: LifeState, id: Id): HealthCondition | undefined {
  return state.health.conditions.find((c) => c.conditionId === id);
}

/** Your conditions of the addiction kind. */
export function addictions(state: LifeState, content: ContentBundle): HealthCondition[] {
  return state.health.conditions.filter((c) => content.conditions[c.conditionId]?.kind === 'addiction');
}

export function healthHistory(state: LifeState, key: 'diagnosed' | 'treated' | 'recovered' | 'relapsed', def: ConditionDef, content: ContentBundle): void {
  writeFromGroup(state, content.text.history.health[key], ['health', key, `condition:${def.id}`], { values: { condition: def.noun } }, content);
}

/**
 * Pays a medical cost: from savings, and what savings can't cover becomes
 * medical debt (one medical debt at the usual rate, grown if you have one).
 * A child's family pays. Returns the amount borrowed.
 */
export function payMedical(state: LifeState, amount: number, content: ContentBundle): number {
  const cost = wholeDollars(Math.max(0, amount));
  const f = state.finances;
  if (cost <= f.savings) {
    f.savings -= cost;
    return 0;
  }
  const shortfall = cost - f.savings;
  f.savings = 0;
  if (!isIndependent(state, content)) return 0;
  const rate = content.balance.economy.interest.debts.medical;
  const existing = f.debts.find((d) => d.kind === 'medical' && d.annualRate === rate);
  if (existing) {
    existing.balance = wholeDollars(existing.balance + shortfall);
    setMinPayment(existing, content);
  } else {
    addDebt(state, 'medical', shortfall, content);
  }
  return shortfall;
}

/**
 * Gives you a condition at `severity` (1–100), or makes one you have worse
 * by that much. A new condition writes a history entry.
 */
export function addCondition(state: LifeState, conditionId: Id, severity: number, content: ContentBundle): void {
  const def = activeCondition(content, conditionId);
  if (!def || severity <= 0) return;
  const had = conditionOf(state, conditionId);
  if (had) {
    had.severity = clampInt(had.severity + severity, 1, 100);
    return;
  }
  const condition: HealthCondition = { conditionId, since: state.currentYear, severity: clampInt(severity, 1, 100), treated: false };
  state.health.conditions.push(condition);
  if (!isMentalKind(def.kind)) {
    healthHistory(state, 'diagnosed', def, content);
    return;
  }
  // M1: a mental health condition is named only after a diagnosis (./mental/diagnose.ts), unless it
  // is one you recovered from and know: it comes back with its name.
  if (state.health.mental.past[conditionId]?.diagnosed) {
    condition.diagnosed = state.currentYear;
    healthHistory(state, 'relapsed', def, content);
  }
}

/** Moves a condition's severity; at 0 it is gone (with a history entry). */
export function changeSeverity(state: LifeState, conditionId: Id, delta: number, content: ContentBundle): void {
  const had = conditionOf(state, conditionId);
  if (!had) {
    if (delta > 0) addCondition(state, conditionId, delta, content);
    return;
  }
  const next = Math.round(had.severity + delta);
  if (next > 0) {
    had.severity = Math.min(100, next);
    return;
  }
  state.health.conditions = state.health.conditions.filter((c) => c !== had);
  const def = content.conditions[conditionId];
  if (!def) return;
  if (!isMentalKind(def.kind)) {
    healthHistory(state, 'recovered', def, content);
    return;
  }
  // M1: you can recover from a mental health condition, and it can come back. You only remember
  // recovering from one you knew you had.
  const past = state.health.mental.past[conditionId];
  state.health.mental.past[conditionId] = { year: state.currentYear, times: (past?.times ?? 0) + 1, diagnosed: had.diagnosed !== undefined };
  if (had.diagnosed !== undefined) healthHistory(state, 'recovered', def, content);
}

/** Marks a condition you have as treated or not (a history entry when treatment starts). */
export function setTreated(state: LifeState, conditionId: Id, treated: boolean, content: ContentBundle): void {
  const had = conditionOf(state, conditionId);
  if (!had || had.treated === treated) return;
  const def = content.conditions[conditionId];
  // M1: care for a mental health condition is chosen through ./mental/care.ts, not marked.
  if (def && isMentalKind(def.kind)) return;
  had.treated = treated;
  if (treated && def) healthHistory(state, 'treated', def, content);
}

/** The value an onset factor reads: a stat, a trait, vice or genetic risk. */
function factorValue(state: LifeState, key: (typeof ONSET_FACTOR_KEYS)[number], content: ContentBundle): number {
  const c = state.character;
  if (key === 'trauma') return state.health.mental.trauma;
  if (key === 'support') return circleSupport(state, content);
  if (key === 'vice' || key === 'geneticRisk') return c.hidden[key];
  if (key in c.stats) return c.stats[key as keyof typeof c.stats];
  return c.personality[key as keyof typeof c.personality];
}

/**
 * Your chance (0–1) of the condition starting this year: its chance at your
 * age times each factor, while its requirements hold. Zero when you have it
 * already, it has no onset, or you have as many conditions as the balance allows.
 */
export function onsetChance(state: LifeState, def: ConditionDef, content: ContentBundle): number {
  const onset = def.onset;
  if (!onset || def.retired || conditionOf(state, def.id)) return 0;
  // Born-with conditions (M1) don't count toward the limit.
  const held = state.health.conditions.filter((c) => content.conditions[c.conditionId]?.kind !== 'neuro').length;
  if (held >= content.balance.health.maxConditions) return 0;
  if (!evaluate(onset.requires, state, { roles: 'strict' })) return 0;
  let p = curveAt(onset.chance, state.character.age);
  for (const f of onset.factors ?? []) p *= curveAt(f.curve, factorValue(state, f.key, content));
  // M1: a condition you recovered from comes back more easily, less so as the years pass.
  const past = state.health.mental.past[def.id];
  if (past) {
    const relapse = content.balance.mentalHealth.course.relapse;
    const left = Math.max(0, 1 - (state.currentYear - past.year) / relapse.years);
    p *= 1 + (relapse.mult - 1) * left;
  }
  return Math.min(1, Math.max(0, p));
}

/** Rolls a new condition's starting severity (draws from the life's generator). */
export function rollSeverity(state: LifeState, def: ConditionDef): number {
  const range = def.onset?.severity ?? { min: 20, max: 40 };
  return nextInt(state.rng, range.min, range.max);
}

/** A condition's extra yearly chance of death now: its mortality, scaled by severity and softened by treatment. */
export function conditionDeathChance(condition: HealthCondition, content: ContentBundle): number {
  const def = content.conditions[condition.conditionId];
  if (!def || def.mortality === 0) return 0;
  const treated = condition.treated ? content.balance.health.treated.mortality : 1;
  return def.mortality * (condition.severity / 100) * treated;
}

/** Every condition that could kill you this year, with its chance. */
export function deadlyConditions(state: LifeState, content: ContentBundle): (readonly [Id, number])[] {
  return state.health.conditions.flatMap((c) => {
    const p = conditionDeathChance(c, content);
    return p > 0 ? [[c.conditionId, p] as const] : [];
  });
}

/** Seeing a doctor is possible: once a year, alive and not in prison (prison has its own care). */
export function canSeeDoctor(state: LifeState): boolean {
  return state.phase === 'yearStart' && state.health.lastVisit !== state.currentYear && state.housing.kind !== 'incarcerated';
}

/** What a visit costs now: the visit (city cost of living) and the treatment of every untreated treatable condition. */
export function doctorQuote(state: LifeState, content: ContentBundle): { visit: number; treatment: number } {
  const city = content.cities[state.character.cityId];
  const visit = wholeDollars(content.balance.health.doctor.visitCost * (city?.costOfLiving ?? 1));
  const treatment = state.health.conditions.reduce((sum, c) => {
    const def = content.conditions[c.conditionId];
    return sum + (def && def.treatable && !c.treated && !isMentalKind(def.kind) ? (def.costs?.treatment ?? 0) : 0);
  }, 0);
  return { visit, treatment: wholeDollars(treatment) };
}

/**
 * You see a doctor (the caller checks you can): the visit is paid (medical
 * debt for what savings can't cover), each untreated treatable condition is
 * treated with a chance by its severity (its treatment paid too), each
 * untreatable one is eased, and with nothing to treat it is a checkup that
 * does your Health some good. Returns which kind of result it was.
 */
export function seeDoctor(state: LifeState, content: ContentBundle): DoctorResult {
  const d = content.balance.health.doctor;
  state.health.lastVisit = state.currentYear;
  let cost = doctorQuote(state, content).visit;
  let treated = false;
  let managed = false;
  // M1: a doctor may put a name to something you have been carrying (care for it is chosen on the Health page).
  const named = rollDiagnosis(state, 'doctor', content).length > 0;
  for (const condition of [...state.health.conditions]) {
    const def = content.conditions[condition.conditionId];
    if (!def || condition.treated || isMentalKind(def.kind)) continue;
    if (def.treatable) {
      if (chance(state.rng, curveAt(d.treatChance, condition.severity))) {
        cost += def.costs?.treatment ?? 0;
        setTreated(state, def.id, true, content);
        treated = true;
      } else {
        managed = true;
      }
    } else {
      changeSeverity(state, def.id, -d.manageSeverity, content);
      managed = true;
    }
  }
  payMedical(state, cost, content);
  if (named) return 'diagnosed';
  if (treated) return 'treated';
  if (managed) return 'managed';
  const s = state.character.stats;
  if (s.health < d.checkupLimit) s.health = Math.min(d.checkupLimit, s.health + d.checkupHealth);
  return 'clean';
}
