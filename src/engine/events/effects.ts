/**
 * Effect handlers (docs/technical.md, "Event engine internals"). Each effect
 * type has one handler; adding a type means a schema in
 * src/content/schemas/events.ts and a handler here, without touching events.
 */
import type { ContentBundle, Effect, EffectStatKey, EventDef } from '../../content/schemas';
import { HIDDEN_KEYS, POSSESSION_ROLES, STAT_KEYS } from '../../content/schemas';
import {
  addDebt,
  canStartDebtPlan,
  declareBankruptcy,
  earn,
  forgiveDebts,
  isIndependent,
  spend,
  wholeDollars,
  startDebtPlan,
} from '../finance';
import { afterMove, canTakeJob, checkJobFits, endJob, giveRaise, promote, startJob } from '../career';
import { addScholarshipFund, leaveSchool } from '../education';
import { applyIdentity, discoverTalent } from '../discovery';
import { changeSeverity, setTreated } from '../health';
import { applyMentalEffect } from '../mental/effects';
import { sentence } from '../legal';
import { changeRent, moveInTogether, moveTo, refreshHousingCost, sellHome, settleHousehold, supportingParent } from '../housing';
import { costPrice, payCost, rentMonthsAmount } from '../costs';
import { createStepchildren } from '../family/children';
import { applyCustody } from '../family/custody';
import { shiftParenting } from '../family/parenting';
import { beginPregnancy, decidePregnancy, failAttempt } from '../family/pregnancy';
import { startProcess } from '../family/process';
import { betray, giveMoney } from '../interactions/links';
import { lifeHelp } from '../lives/help';
import { applyIntroduce, applyKnowledge, applyTie, noteIdentityAccepted } from '../web/actions';
import { shiftMood } from '../interactions/mood';
import { applyPossessionEffect } from '../possessions/effects';
import { applyTeenEffect } from '../teen/effects';
import { applyCrimeEffect, applyDirtyMoneyEffect } from '../crime/effects';
import { whereabouts } from '../presence';
import { clampInt } from '../random';
import { otherCity } from './casting';
import { canChangeKind, canSetStatus } from '../relationships';
import { nextInt, type RngState } from '../rng';
import { addHistory } from '../systems/history';
import { renderText, type TextContext } from '../text';
import type { Id, LifeState } from '../types';
import { keepPossessionText, textContext } from './text';

export interface EffectContext {
  /** The event (or, for E1 interactions, the interaction) the effects come from: its id and rarity. */
  def: Pick<EventDef, 'id' | 'rarity'>;
  cast: Record<string, Id>;
  rng: RngState;
  content: ContentBundle;
  /** A follow-up: the year the event that scheduled it happened ({since}). */
  since?: number;
  /** E5: the text context made before the effects ran, so a possession an earlier effect removed is still named. */
  named?: TextContext;
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

  money: (state, effect, ctx) => {
    // Savings never go below zero: past the independence age the rest is debt.
    if (effect.delta >= 0) earn(state, effect.delta);
    else spend(state, -effect.delta, ctx.content);
  },

  rentMonths: (state, effect, ctx) => {
    const amount = rentMonthsAmount(state, effect.months);
    if (amount >= 0) earn(state, amount);
    else spend(state, -amount, ctx.content);
  },

  cost: (state, effect, ctx) => payCost(state, effect.item, ctx.content),

  debt: (state, effect, ctx) => {
    // Children never take on debt.
    if (!isIndependent(state, ctx.content)) return;
    switch (effect.action) {
      case 'add':
        if (effect.kind && (effect.amount || effect.item)) addDebt(state, effect.kind, effect.amount ?? costPrice(state, effect.item!, ctx.content), ctx.content);
        return;
      case 'forgive':
        forgiveDebts(state, effect.share ?? 0, ctx.content, effect.kinds);
        return;
      case 'bankruptcy':
        declareBankruptcy(state);
        return;
      case 'plan':
        if (canStartDebtPlan(state, ctx.content)) startDebtPlan(state, ctx.content);
        return;
    }
  },

  housing: (state, effect, ctx) => {
    // Only an adult chooses where to live; a move that doesn't fit is ignored.
    if (!isIndependent(state, ctx.content)) return;
    const h = state.housing;
    const city = state.character.cityId;
    switch (effect.action) {
      case 'move_home': {
        const parent = supportingParent(state);
        if (parent && h.kind !== 'owned' && h.kind !== 'with_parents' && h.kind !== 'incarcerated') {
          moveTo(state, 'with_parents', parent.cityId, ctx.content);
          afterMove(state, city, ctx.content);
        }
        return;
      }
      case 'rent':
        if (h.kind === 'with_parents' || h.kind === 'homeless') moveTo(state, 'renting', city, ctx.content);
        return;
      case 'homeless':
        if (h.kind === 'with_parents' || h.kind === 'renting') moveTo(state, 'homeless', city, ctx.content);
        return;
      case 'roommate':
      case 'live_alone':
        if (h.kind !== 'renting') return;
        // You don't take in a roommate while living with your partner.
        if (effect.action === 'roommate' && h.partnerId === undefined) h.roommate = true;
        else delete h.roommate;
        refreshHousingCost(state, ctx.content);
        return;
      case 'sell':
        if (h.kind === 'owned') sellHome(state, ctx.content);
        return;
      case 'move_in_together':
        moveInTogether(state, ctx.cast[effect.role ?? ''] ?? '', ctx.content);
        return;
      case 'rent_change':
        if (h.kind === 'renting') changeRent(state, effect.percent ?? 0, ctx.content);
        return;
    }
  },

  education: (state, effect, ctx) => {
    const edu = state.education;
    switch (effect.action) {
      case 'grades':
        // Only while you're in school; it counts toward this year's grade.
        if (edu.current) edu.current.boost = Math.min(2, Math.max(-2, edu.current.boost + (effect.value ?? 0)));
        return;
      case 'scholarship':
        addScholarshipFund(state, effect.value ?? 0);
        return;
      case 'drop_out':
        leaveSchool(state, 'droppedOut', ctx.content);
        checkJobFits(state, ctx.content);
        return;
      case 'expel':
        leaveSchool(state, 'expelled', ctx.content);
        checkJobFits(state, ctx.content);
        return;
    }
  },

  job: (state, effect, ctx) => {
    const job = state.career.job;
    switch (effect.action) {
      case 'performance':
        if (job) job.performance = clampInt(job.performance + (effect.value ?? 0), 0, 100);
        return;
      case 'raise':
        giveRaise(state, ctx.content.balance.careers.raises.asked, ctx.content);
        return;
      case 'promote':
        promote(state, ctx.content);
        return;
      case 'fire':
        endJob(state, 'fired', ctx.content);
        return;
      case 'quit':
        endJob(state, 'quit', ctx.content);
        return;
      case 'offer':
        // Only a job you could take now: old enough, out of school, qualified.
        if (canTakeJob(state, effect.jobId ?? '', ctx.content)) startJob(state, effect.jobId!, ctx.content);
        return;
    }
  },

  relationship: (state, effect, ctx) => {
    const id = ctx.cast[effect.role] ?? '';
    const rel = state.relationships[id];
    if (!rel) return;
    if (effect.affection !== undefined) rel.affection = clampInt(rel.affection + effect.affection, 0, 100);
    if (effect.trust !== undefined) rel.trust = clampInt(rel.trust + effect.trust, 0, 100);
    const person = state.people[id];
    if (effect.mood !== undefined && person) shiftMood(person, effect.mood);
    // Kind and status changes that break the relationship rules (a minor in a
    // romance, a second spouse, family becoming a partner...) are refused.
    if (effect.kind !== undefined && effect.kind !== rel.kind && canChangeKind(state, id, effect.kind, ctx.content)) {
      rel.kind = effect.kind;
      rel.kindSince = state.currentYear;
      if (effect.kind === 'spouse') {
        rel.wasSpouse = true;
        // E2a: marrying someone with children makes them your stepchildren.
        createStepchildren(state, ctx.rng, id, ctx.content);
      }
    }
    if (effect.status !== undefined && canSetStatus(state, id, effect.status)) rel.status = effect.status;
    // A partner who lived with you and no longer is your partner moves out.
    settleHousehold(state, ctx.content);
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
      // E5: the pet, vehicle or vacation home the event is about travels as its pseudo-role.
      const kept = role in POSSESSION_ROLES ? ctx.cast[POSSESSION_ROLES[role as keyof typeof POSSESSION_ROLES]] : undefined;
      if (kept !== undefined) cast[POSSESSION_ROLES[role as keyof typeof POSSESSION_ROLES]] = kept;
    }
    const [min, max] = effect.inYears;
    state.scheduled.push({ eventId: effect.eventId, dueYear: state.currentYear + nextInt(ctx.rng, min, max), cast, since: state.currentYear });
  },

  history: (state, effect, ctx) => {
    const now = textContext(state, ctx.cast, ctx.content, ctx.since);
    const text = renderText(effect.text, ctx.named ? keepPossessionText(now, ctx.named) : now);
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
    // endYear closes the life (history entry, recap, dead phase). A
    // management action's result happens between years and never kills
    // (the content build forbids it); this is the engine's backstop.
    if (state.death || state.phase === 'action') return;
    state.death = { year: state.currentYear, age: state.character.age, causeId: effect.cause };
  },

  legal: (state, effect, ctx) => {
    sentence(state, effect.offenseId, effect.outcome, effect.years, ctx.content);
  },

  health: (state, effect, ctx) => {
    if (effect.severity !== undefined) changeSeverity(state, effect.conditionId, effect.severity, ctx.content);
    if (effect.treated !== undefined) setTreated(state, effect.conditionId, effect.treated, ctx.content);
  },

  mental: (state, effect, ctx) => applyMentalEffect(state, effect, ctx.cast, ctx.content),

  identity: (state, effect, ctx) => {
    const before = JSON.stringify(state.character.identity);
    applyIdentity(state, effect.field, effect.value, effect.role === undefined ? undefined : ctx.cast[effect.role], ctx.content);
    // E4: who you are, once accepted, is a fact others may come to hear.
    if (JSON.stringify(state.character.identity) !== before) noteIdentityAccepted(state, ctx.rng, ctx.content);
  },

  innerConflict: (state, effect) => {
    const h = state.character.hidden;
    h.innerConflict = clampInt(h.innerConflict + effect.delta, 0, 100);
  },

  talent: (state, _effect, ctx) => discoverTalent(state, ctx.content),

  // C1: someone moves to another city (never someone who lives with you).
  moveAway: (state, effect, ctx) => {
    const id = ctx.cast[effect.role];
    const person = id === undefined ? undefined : state.people[id];
    if (!person || !person.alive || whereabouts(state, id!, ctx.content) === 'household') return;
    person.cityId = otherCity(state, ctx.rng, ctx.content);
  },

  // E1: money a person gives or lends you when you ask.
  moneyFromPerson: (state, effect, ctx) => {
    const id = ctx.cast[effect.role];
    if (id !== undefined) giveMoney(state, id, effect.mode, ctx.rng, ctx.content);
  },

  // E1: an unfaithful act with the person, when you have a partner who isn't them.
  infidelity: (state, effect, ctx) => {
    const id = ctx.cast[effect.role];
    if (id !== undefined) betray(state, id, effect.act, ctx.rng, ctx.content);
  },

  // E2a: a pregnancy begins, is decided on, or a year of trying didn't work.
  pregnancy: (state, effect, ctx) => {
    if (effect.action === 'begin') {
      const id = ctx.cast[effect.role ?? ''];
      if (id !== undefined && effect.how !== undefined) beginPregnancy(state, effect.how, id, ctx.content);
    } else if (effect.action === 'decide') {
      if (effect.choice !== undefined) decidePregnancy(state, effect.choice);
    } else {
      failAttempt(state);
    }
  },

  // E2a: your parenting style with a child.
  parenting: (state, effect, ctx) => {
    const rel = state.relationships[ctx.cast[effect.role] ?? ''];
    if (!rel || (rel.kind !== 'child' && rel.kind !== 'stepchild')) return;
    shiftParenting(rel, { ...(effect.warmth !== undefined ? { warmth: effect.warmth } : {}), ...(effect.strictness !== undefined ? { strictness: effect.strictness } : {}), ...(effect.involvement !== undefined ? { involvement: effect.involvement } : {}) }, ctx.content);
  },

  // E2a: a child's own stats and traits.
  childStat: (state, effect, ctx) => {
    const person = state.people[ctx.cast[effect.role] ?? ''];
    const kid = person?.child;
    if (!person || !kid || !person.alive) return;
    if (effect.key === 'smarts') person.smarts = clampInt(person.smarts + effect.delta, 0, 100);
    else if (effect.key === 'looks') person.looks = clampInt(person.looks + effect.delta, 0, 100);
    else kid[effect.key] = clampInt(kid[effect.key] + effect.delta, 0, 100);
  },
  childTrait: (state, effect, ctx) => {
    const person = state.people[ctx.cast[effect.role] ?? ''];
    if (!person?.child || !person.alive) return;
    person.traits[effect.key] = clampInt((person.traits[effect.key] ?? 50) + effect.delta, 0, 100);
  },

  // E2a: where the children you had with the other parent live.
  custody: (state, effect, ctx) => {
    const id = ctx.cast[effect.role];
    if (id !== undefined) applyCustody(state, id, effect.choice, ctx.content);
  },

  // E2a: an adoption, IVF cycle or surrogacy begins (its fees are cost effects beside this one).
  process: (state, effect, ctx) => startProcess(state, ctx.rng, effect.process, ctx.content),

  // E3: you step in for someone (bail, rehab, treatment, a job lead, care).
  lifeHelp: (state, effect, ctx) => {
    const id = ctx.cast[effect.role];
    if (id !== undefined) lifeHelp(state, id, effect.action, ctx.rng, ctx.content);
  },

  // E4: something between two people you know; what someone has heard about you; introducing two people.
  tie: (state, effect, ctx) => applyTie(state, effect, ctx.cast, ctx.content),
  knowledge: (state, effect, ctx) => applyKnowledge(state, effect, ctx.cast, ctx.rng, ctx.content),
  introduce: (state, effect, ctx) => applyIntroduce(state, effect, ctx.cast, ctx.rng, ctx.content),

  // E5: what you own: damage, theft, a pet turning up, a vet visit, insurance.
  possession: (state, effect, ctx) => applyPossessionEffect(state, effect, ctx.cast, ctx.content),

  // T1: the teen years: crowds, house rules, the license, a teen job, teams and clubs.
  teen: (state, effect, ctx) => applyTeenEffect(state, effect, ctx.cast, ctx.content),

  // E6a: a life in a crew, and dirty money.
  crime: (state, effect, ctx) => applyCrimeEffect(state, effect, ctx.cast, ctx.content),
  dirtyMoney: (state, effect, ctx) => applyDirtyMoneyEffect(state, effect, ctx.rng, ctx.content),

  // E3: money paid back to you, sized like the cost it repays.
  repay: (state, effect, ctx) => earn(state, wholeDollars(costPrice(state, effect.item, ctx.content) * effect.share)),
};

/** Applies effects in order. */
export function applyEffects(state: LifeState, effects: readonly Effect[], ctx: EffectContext): void {
  for (const effect of effects) {
    (handlers[effect.type] as Handler<typeof effect.type>)(state, effect as never, ctx);
  }
}
