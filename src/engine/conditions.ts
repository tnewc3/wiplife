/**
 * Condition evaluator (docs/technical.md, "Condition language"). Conditions
 * are structured data from content; each case below matches one entry of
 * conditionSchema in src/content/schemas/events.ts.
 */
import type { Compare, Condition, ContentBundle } from '../content/schemas';
import { familyHolds } from './family/query';
import { lifeHolds } from './lives/query';
import { heardHolds, ITEM_ROLE, tieHolds } from './web/query';
import { whereabouts } from './presence';
import { mostMissed, totalDebt } from './finance';
import { circleSupport } from './mental/query';
import { romanceStatus, yearsInKind } from './relationships';
import type { Id, LifeState } from './types';

export interface ConditionContext {
  /** Role name -> person id, once the event is cast. */
  cast?: Record<string, Id>;
  /**
   * Before casting, conditions about roles can't be known yet. 'assumeTrue'
   * lets them pass (the event is checked again once cast); 'strict' fails
   * them when the role is missing.
   */
  roles?: 'strict' | 'assumeTrue';
  /** The content, for conditions on where someone is (C1); without it they fail. */
  content?: ContentBundle;
}

export function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

const FAMILY_ALIVE_DEFAULT = true;

/** True when the condition holds for this life (and cast). A missing condition always holds. */
export function evaluate(condition: Condition | undefined, state: LifeState, ctx: ConditionContext = {}): boolean {
  if (condition === undefined) return true;
  const c = state.character;
  const roleCheck = (role: string, check: (personId: Id) => boolean): boolean => {
    const id = ctx.cast?.[role];
    if (id === undefined) return ctx.roles === 'assumeTrue';
    return check(id);
  };

  if ('all' in condition) return condition.all.every((sub) => evaluate(sub, state, ctx));
  if ('any' in condition) return condition.any.some((sub) => evaluate(sub, state, ctx));
  if ('not' in condition) {
    // Unknown roles make "not" unknowable too; stay optimistic before casting.
    if (ctx.roles === 'assumeTrue' && mentionsRole(condition.not)) return true;
    return !evaluate(condition.not, state, ctx);
  }
  if ('age' in condition) return compare(c.age, condition.age);
  if ('lifeStage' in condition) return condition.lifeStage.includes(c.lifeStage);
  if ('stat' in condition) return compare(c.stats[condition.stat], condition);
  if ('trait' in condition) return compare(c.personality[condition.trait], condition);
  if ('hidden' in condition) return compare(c.hidden[condition.hidden], condition);
  if ('money' in condition) return compare(state.finances.savings, condition.money);
  if ('city' in condition) return c.cityId === condition.city;
  if ('familyWealth' in condition) return condition.familyWealth.includes(c.familyWealth);
  if ('flag' in condition) {
    const value = state.flags[condition.flag];
    if (condition.eq !== undefined) return value === condition.eq;
    return value !== undefined && value !== false && value !== 0 && value !== '';
  }
  if ('fired' in condition) return (state.eventLog[condition.fired]?.count ?? 0) > 0;
  if ('relative' in condition) {
    const alive = condition.relative.alive ?? FAMILY_ALIVE_DEFAULT;
    return Object.values(state.relationships).some(
      (r) => r.kind === condition.relative.kind && state.people[r.personId]?.alive === alive,
    );
  }
  if ('romance' in condition) return condition.romance.includes(romanceStatus(state));
  if ('finances' in condition) {
    const q = condition.finances;
    const f = state.finances;
    if (q.debt && !compare(totalDebt(state), q.debt)) return false;
    if (q.missed && !compare(mostMissed(state), q.missed)) return false;
    if (q.collections !== undefined && f.debts.some((d) => d.kind === 'collections') !== q.collections) return false;
    if (q.kinds && !f.debts.some((d) => q.kinds!.includes(d.kind))) return false;
    if (q.lifestyle && !q.lifestyle.includes(f.lifestyle)) return false;
    if (q.gig !== undefined && state.career.gig !== q.gig) return false;
    if (q.bankruptWithin !== undefined && !(f.bankruptcyYear !== undefined && state.currentYear - f.bankruptcyYear <= q.bankruptWithin)) return false;
    if (q.planWithin !== undefined && !(f.debtPlanYear !== undefined && state.currentYear - f.debtPlanYear <= q.planWithin)) return false;
    if (q.income && !compare(f.lastLedger?.gross ?? 0, q.income)) return false;
    return true;
  }
  if ('home' in condition) {
    const q = condition.home;
    const h = state.housing;
    if (q.kind && !q.kind.includes(h.kind)) return false;
    if (q.years && !compare(state.currentYear - h.since, q.years)) return false;
    if (q.roommate !== undefined && (h.roommate === true) !== q.roommate) return false;
    if (q.relocated !== undefined && (c.cityId !== c.birthCityId) !== q.relocated) return false;
    if (q.partner !== undefined && (h.partnerId !== undefined) !== q.partner) return false;
    return true;
  }
  if ('education' in condition) {
    const q = condition.education;
    const edu = state.education;
    const cur = edu.current;
    if (q.program && !q.program.includes(cur?.program ?? 'none')) return false;
    if (q.tier && !(cur?.tier !== undefined && q.tier.includes(cur.tier))) return false;
    if (q.major && !(cur?.majorId !== undefined && q.major.includes(cur.majorId))) return false;
    if (q.trade && !(cur?.tradeId !== undefined && q.trade.includes(cur.tradeId))) return false;
    if (q.year && !(cur && compare(cur.year, q.year))) return false;
    if (q.final !== undefined && (cur !== null && cur.year >= cur.lengthYears) !== q.final) return false;
    if (q.gpa && !(cur && compare(cur.gpa, q.gpa))) return false;
    if (q.credential && !q.field && !edu.credentials.some((cr) => q.credential!.includes(cr.type))) return false;
    if (q.field && !edu.credentials.some((cr) => cr.refId !== undefined && q.field!.includes(cr.refId) && (!q.credential || q.credential.includes(cr.type)))) {
      return false;
    }
    if (q.left !== undefined && (edu.left !== null) !== q.left) return false;
    if (q.admission !== undefined && (edu.admission !== null) !== q.admission) return false;
    return true;
  }
  if ('career' in condition) {
    const q = condition.career;
    const career = state.career;
    const job = career.job;
    if (q.employed !== undefined && (job !== null) !== q.employed) return false;
    if (q.job && !(job && q.job.includes(job.jobId))) return false;
    if (q.level && !(job && compare(job.level, q.level))) return false;
    if (q.years && !(job && compare(state.currentYear - job.since, q.years))) return false;
    if (q.performance && !(job && compare(job.performance, q.performance))) return false;
    if (q.retired !== undefined && career.retired !== q.retired) return false;
    if (
      q.lostWithin !== undefined &&
      !career.history.some((h) => (h.endedBy === 'fired' || h.endedBy === 'laid_off') && state.currentYear - h.toYear <= q.lostWithin!)
    ) {
      return false;
    }
    return true;
  }
  if ('record' in condition) {
    const q = condition.record;
    return state.legal.record.some(
      (r) => (!q.outcome || q.outcome.includes(r.outcome)) && (q.within === undefined || state.currentYear - r.year <= q.within),
    );
  }
  if ('health' in condition) {
    const q = condition.health;
    return state.health.conditions.some((had) => {
      if (q.conditions && !q.conditions.includes(had.conditionId)) return false;
      if (q.treated !== undefined && had.treated !== q.treated) return false;
      if (q.severity && !compare(had.severity, q.severity)) return false;
      // M1: named once diagnosed; the year it was; how you care for it.
      if (q.named !== undefined && (had.diagnosed !== undefined) !== q.named) return false;
      if (q.within !== undefined && !(had.diagnosed !== undefined && state.currentYear - had.diagnosed <= q.within)) return false;
      if (q.care && !q.care.some((c) => (had.care ?? []).includes(c))) return false;
      if (q.uncared !== undefined && ((had.care ?? []).length === 0) !== q.uncared) return false;
      return true;
    });
  }
  if ('legal' in condition) {
    const q = condition.legal;
    const inside = state.housing.kind === 'incarcerated';
    const until = state.legal.probationUntil;
    const probation = !inside && until !== undefined && until >= state.currentYear;
    if (q.incarcerated !== undefined && inside !== q.incarcerated) return false;
    if (q.probation !== undefined && probation !== q.probation) return false;
    return true;
  }
  if ('discovery' in condition) {
    const q = condition.discovery;
    const latent = c.latent.identity;
    const has = {
      attraction: latent?.attractedTo !== undefined,
      gender: latent?.genderCategory !== undefined,
      expression: latent?.genderExpression !== undefined,
      personality: c.latent.personality !== undefined && Object.keys(c.latent.personality).length > 0,
    };
    if (q.latent && !q.latent.some((k) => has[k])) return false;
    if (q.known && !q.known.some((k) => has[k] && state.discovery.surfaced[k] !== undefined)) return false;
    if (q.innerConflict && !compare(c.hidden.innerConflict, q.innerConflict)) return false;
    if (q.talent !== undefined) {
      const talent = c.hidden.talent === null ? 'none' : c.hidden.talentDiscovered ? 'found' : 'hidden';
      if (talent !== q.talent) return false;
    }
    return true;
  }
  if ('family' in condition) return familyHolds(condition.family, state, ctx.content?.balance.relationships.adultAge);
  if ('memory' in condition) {
    const { role, tag } = condition.memory;
    return roleCheck(role, (id) => state.relationships[id]?.memories.some((m) => m.tag === tag) ?? false);
  }
  if ('role' in condition) {
    return roleCheck(condition.role, (id) => {
      const person = state.people[id];
      if (!person) return false;
      const rel = state.relationships[id];
      if (condition.alive !== undefined && person.alive !== condition.alive) return false;
      if (condition.age && !compare((person.deathYear ?? state.currentYear) - person.birthYear, condition.age)) return false;
      if (condition.affection && !(rel && compare(rel.affection, condition.affection))) return false;
      if (condition.trust && !(rel && compare(rel.trust, condition.trust))) return false;
      if (condition.kind && !(rel && condition.kind.includes(rel.kind))) return false;
      if (condition.status && !(rel && condition.status.includes(rel.status))) return false;
      if (condition.years && !(rel && compare(yearsInKind(state, rel), condition.years))) return false;
      if (condition.where && !(ctx.content && condition.where.includes(whereabouts(state, id, ctx.content)))) return false;
      if (condition.gpa && !(person.child && compare(person.child.gpa, condition.gpa))) return false;
      if (condition.style) {
        for (const [line, bound] of Object.entries(condition.style)) {
          const value = rel?.parenting?.[line as 'warmth' | 'strictness' | 'involvement'];
          if (value === undefined || !compare(value, bound)) return false;
        }
      }
      if (condition.custody && !(person.child && condition.custody.includes(person.child.custody))) return false;
      if (condition.movedOut !== undefined && (person.child?.movedOutYear !== undefined) !== condition.movedOut) return false;
      if (condition.life && !lifeHolds(condition.life, person, state.currentYear, ctx.content?.balance.people.trouble.serious ?? 35)) return false;
      if (condition.heard && !heardHolds(condition.heard, state, id, ctx.content, ctx.cast?.[ITEM_ROLE])) return false;
      if (condition.mental) {
        const noticing = state.health.mental.noticed[id];
        if (condition.mental.noticed !== undefined && (noticing !== undefined) !== condition.mental.noticed) return false;
        if (condition.mental.reaction && !(noticing && condition.mental.reaction.includes(noticing.reaction))) return false;
      }
      return true;
    });
  }
  if ('mental' in condition) {
    const q = condition.mental;
    const m = state.health.mental;
    if (q.trauma && !compare(m.trauma, q.trauma)) return false;
    if (q.support && !(ctx.content && compare(circleSupport(state, ctx.content), q.support))) return false;
    if (q.crisis !== undefined) {
      const since = m.crisisYear === undefined ? undefined : state.currentYear - m.crisisYear;
      const held = typeof q.crisis === 'boolean' ? (since !== undefined) === q.crisis : since !== undefined && since <= q.crisis;
      if (!held) return false;
    }
    if (q.recovered && !q.recovered.some((id) => m.past[id] !== undefined)) return false;
    if (q.noticed !== undefined && (Object.keys(m.noticed).length > 0) !== q.noticed) return false;
    if (q.sideEffects !== undefined && (m.sideEffectYear !== undefined && state.currentYear - m.sideEffectYear <= 1) !== q.sideEffects) return false;
    return true;
  }
  if ('tie' in condition) {
    const q = condition.tie;
    const a = ctx.cast?.[q.a];
    const b = ctx.cast?.[q.b];
    if (a === undefined || b === undefined) return ctx.roles === 'assumeTrue';
    return tieHolds(q, state, a, b, ctx.content);
  }
  const unknown: never = condition;
  throw new Error(`Unknown condition: ${JSON.stringify(unknown)}`);
}

/** True when the condition (or any part of it) is about a cast role. */
export function mentionsRole(condition: Condition): boolean {
  if ('all' in condition) return condition.all.some(mentionsRole);
  if ('any' in condition) return condition.any.some(mentionsRole);
  if ('not' in condition) return mentionsRole(condition.not);
  return 'memory' in condition || 'role' in condition || 'tie' in condition;
}

/** Every role a condition refers to (for the content build). */
export function rolesIn(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(rolesIn);
  if ('any' in condition) return condition.any.flatMap(rolesIn);
  if ('not' in condition) return rolesIn(condition.not);
  if ('memory' in condition) return [condition.memory.role];
  if ('role' in condition) return [condition.role];
  if ('tie' in condition) return [condition.tie.a, condition.tie.b];
  return [];
}

/** Every flag, memory tag and event a condition refers to (for the content build). */
export function referencesIn(condition: Condition | undefined): {
  flags: string[];
  memories: string[];
  events: string[];
  cities: string[];
  majors: string[];
  trades: string[];
  /** Majors, trades or grad programs a credential is in (education field). */
  fields: string[];
  jobs: string[];
  /** Health conditions (Stage 9). */
  conditions: string[];
} {
  const out = {
    flags: [] as string[],
    memories: [] as string[],
    events: [] as string[],
    cities: [] as string[],
    majors: [] as string[],
    trades: [] as string[],
    fields: [] as string[],
    jobs: [] as string[],
    conditions: [] as string[],
  };
  const walk = (cond: Condition | undefined) => {
    if (!cond) return;
    if ('all' in cond) cond.all.forEach(walk);
    else if ('any' in cond) cond.any.forEach(walk);
    else if ('not' in cond) walk(cond.not);
    else if ('flag' in cond) out.flags.push(cond.flag);
    else if ('memory' in cond) out.memories.push(cond.memory.tag);
    else if ('fired' in cond) out.events.push(cond.fired);
    else if ('city' in cond) out.cities.push(cond.city);
    else if ('education' in cond) {
      out.majors.push(...(cond.education.major ?? []));
      out.trades.push(...(cond.education.trade ?? []));
      out.fields.push(...(cond.education.field ?? []));
    } else if ('career' in cond) out.jobs.push(...(cond.career.job ?? []));
    else if ('health' in cond) out.conditions.push(...(cond.health.conditions ?? []));
  };
  walk(condition);
  return out;
}
