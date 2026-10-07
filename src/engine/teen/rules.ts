/**
 * House rules (T1): the rules your parents set (src/content/houseRules), the
 * way each parent's style and personality decide them, breaking them, getting
 * caught, what a parent does about it and asking for a rule to be loosened.
 *
 * Your own parents' style is worked out from who they are (personality, and
 * what you remember of them: a warm home, strict rules...). The E2a parenting
 * style belongs to the children you raise; this is the same three lines seen
 * from the child's side. Numbers: balance/teen.yaml (rules).
 */
import type { ContentBundle, HouseRuleDef, PunishmentId, RuleDomainId } from '../../content/schemas';
import { PUNISHMENTS } from '../../content/schemas';
import { curveAt } from '../curve';
import { PARENTING_KEYS } from '../../content/schemas';
import { applyStatEffects } from '../systems/economy';
import { clampInt, weightedPick } from '../random';
import { chance } from '../rng';
import type { Id, LifeState, ParentingStyle, Person, TeenRule } from '../types';
import { teenHistory } from './cliques';
import { cliqueDef, hasLicense, householdParents, inTeenYears, isGrounded, myClique, penaltyActive, ruleOf } from './query';
import { queueTeenEvent } from './cliques';

export { PARENTING_KEYS };

const trait = (p: Person, key: keyof Person['traits']): number => p.traits[key] ?? 50;

function remembers(state: LifeState, parentId: Id, tag: string): boolean {
  return state.relationships[parentId]?.memories.some((m) => m.tag === tag) ?? false;
}

/** A parent's style (warmth, strictness, involvement), from their personality, how you two get on and what you remember. */
export function styleOfParent(state: LifeState, parent: Person, content: ContentBundle): ParentingStyle {
  const s = content.balance.teen.rules.style;
  const rel = state.relationships[parent.id];
  const fond = (rel?.affection ?? 60) - 60;
  const m = s.memory;
  let warmth = 50 + s.warmth.kindness * (trait(parent, 'kindness') - 50) + s.warmth.affection * fond;
  let strictness = 50 + s.strictness.discipline * (trait(parent, 'discipline') - 50) + s.strictness.riskTaking * (trait(parent, 'riskTaking') - 50) + s.strictness.ambition * (trait(parent, 'ambition') - 50);
  let involvement = 50 + s.involvement.sociability * (trait(parent, 'sociability') - 50) + s.involvement.kindness * (trait(parent, 'kindness') - 50) + s.involvement.affection * fond;
  if (remembers(state, parent.id, 'parent_warm_home')) warmth += m;
  if (remembers(state, parent.id, 'parent_cold_home')) warmth -= m;
  if (remembers(state, parent.id, 'parent_strict_rules')) strictness += m;
  if (remembers(state, parent.id, 'parent_no_rules')) strictness -= m;
  if (remembers(state, parent.id, 'parent_always_there')) involvement += m;
  if (remembers(state, parent.id, 'parent_never_around')) involvement -= m;
  if (rel?.kind === 'stepparent') involvement += s.stepparent;
  return { warmth: clampInt(warmth, 0, 100), strictness: clampInt(strictness, 0, 100), involvement: clampInt(involvement, 0, 100) };
}

/** How tight a parent would make a rule: a number from 0 to 100, from their style and personality. */
export function tightnessOf(def: HouseRuleDef, style: ParentingStyle, parent: Person, content: ContentBundle): number {
  let tight = content.balance.teen.rules.tightness.base;
  tight += def.tight.strictness * (style.strictness - 50) + def.tight.warmth * (style.warmth - 50) + def.tight.involvement * (style.involvement - 50);
  for (const [key, weight] of Object.entries(def.tight.traits)) tight += (weight ?? 0) * (trait(parent, key as keyof Person['traits']) - 50);
  return tight;
}

/** The level a tightness comes to: relaxed, usual or strict. */
export function levelFor(tight: number, content: ContentBundle): 0 | 1 | 2 {
  const at = content.balance.teen.rules.tightness.levelAt;
  return tight < (at[0] ?? 0) ? 0 : tight < (at[1] ?? 100) ? 1 : 2;
}

/** The rule definitions that are in use, in id order. */
export function activeRules(content: ContentBundle): HouseRuleDef[] {
  return Object.keys(content.houseRules)
    .sort()
    .map((id) => content.houseRules[id]!)
    .filter((d) => !d.retired);
}

/**
 * Works out the rules at home from the parents you live with: each parent's
 * style, and for each kind of rule the parent who would make it tightest (no
 * rule at all where none of them would). Rules that stand (the same parent, the
 * same kind) keep how often you broke them and any change you won.
 */
export function refreshHome(state: LifeState, content: ContentBundle): void {
  const parents = householdParents(state, content);
  if (parents.length === 0) {
    state.teen.home = null;
    return;
  }
  const old = state.teen.home;
  const styles: Record<Id, ParentingStyle> = {};
  for (const p of parents) styles[p.id] = old?.styles[p.id] ?? styleOfParent(state, p, content);
  const rules: TeenRule[] = [];
  for (const def of activeRules(content)) {
    let best: { parent: Person; tight: number } | undefined;
    for (const p of parents) {
      const tight = tightnessOf(def, styles[p.id]!, p, content);
      if (!best || tight > best.tight) best = { parent: p, tight };
    }
    if (!best || best.tight < def.absentBelow) continue;
    const kept = old?.rules.find((r) => r.ruleId === def.id && r.by === best.parent.id);
    rules.push(kept ?? { ruleId: def.domain, by: best.parent.id, level: levelFor(best.tight, content), since: state.currentYear, broken: 0, caught: 0 });
  }
  state.teen.home = { styles, rules, year: state.currentYear };
}

/** Whether a rule binds you now (some bind only with a license, a teen job or while in school). */
export function ruleApplies(state: LifeState, def: HouseRuleDef): boolean {
  switch (def.applies) {
    case 'always':
      return true;
    case 'licensed':
      return hasLicense(state);
    case 'job':
      return state.teen.job !== null;
    case 'school':
      return state.education.current !== null;
  }
}

function setBy(state: LifeState, rule: TeenRule): { parent: Person; style: ParentingStyle } | undefined {
  const parent = state.people[rule.by];
  const style = state.teen.home?.styles[rule.by];
  return parent && style ? { parent, style } : undefined;
}

/** The chance a parent notices a break of this rule. */
export function watchChance(state: LifeState, rule: TeenRule, def: HouseRuleDef, content: ContentBundle): number {
  const r = content.balance.teen.rules;
  const who = setBy(state, rule);
  const p = def.watch * (r.levelWatch[rule.level] ?? 1) * curveAt(r.involvement, who?.style.involvement ?? 50);
  return Math.min(0.95, Math.max(0.02, p));
}

/** What a parent does about it: picked by weight from their style and how you two get on. */
function pickPunishment(state: LifeState, rule: TeenRule, content: ContentBundle): PunishmentId {
  const who = setBy(state, rule);
  const rel = state.relationships[rule.by];
  const cons = content.balance.teen.rules.consequences;
  const options = PUNISHMENTS.map((id) => {
    const w = cons[id].weight;
    const style = who?.style ?? { warmth: 50, strictness: 50, involvement: 50 };
    const value = w.base + w.warmth * (style.warmth - 50) + w.strictness * (style.strictness - 50) + w.involvement * (style.involvement - 50) + w.affection * ((rel?.affection ?? 50) - 50);
    return [id, Math.max(0, value)] as const;
  });
  return options.some(([, v]) => v > 0) ? weightedPick(state.rng, options) : 'talking_to';
}

function applyPunishment(state: LifeState, rule: TeenRule, id: PunishmentId, content: ContentBundle): void {
  const c = content.balance.teen.rules.consequences[id];
  for (const [key, delta] of Object.entries(c.stats)) {
    const k = key as keyof typeof state.character.stats;
    state.character.stats[k] = clampInt(state.character.stats[k] + (delta ?? 0), 0, 100);
  }
  const rel = state.relationships[rule.by];
  if (rel) {
    rel.affection = clampInt(rel.affection + c.affection, 0, 100);
    rel.trust = clampInt(rel.trust + c.trust, 0, 100);
  }
  state.teen.standing = clampInt(state.teen.standing + c.standing, 0, 100);
  if (c.years > 0 && (id === 'grounded' || id === 'privilege')) {
    state.teen.penalties.push({ kind: id, until: state.currentYear + c.years, ...(id === 'privilege' ? { domain: rule.ruleId as RuleDomainId } : {}) });
  }
}

export interface BreakResult {
  caught: boolean;
  punishment?: PunishmentId;
  parentId?: Id;
}

/** You break the rule of this domain: the thrill of it, and the chance a parent notices (and answers). Null without such a rule. */
export function breakRule(state: LifeState, domain: RuleDomainId, content: ContentBundle): BreakResult | null {
  const rule = ruleOf(state, domain);
  const def = content.houseRules[domain];
  if (!rule || !def) return null;
  const r = content.balance.teen.rules;
  const t = state.teen;
  rule.broken += 1;
  t.totals.broken += 1;
  const stats = state.character.stats;
  stats.happiness = clampInt(stats.happiness + r.thrill.happiness, 0, 100);
  t.standing = clampInt(t.standing + r.thrill.standing, 0, 100);
  const pers = state.character.personality;
  pers.riskTaking = clampInt(pers.riskTaking + r.thrill.riskTaking, 0, 100);
  state.character.hidden.vice = clampInt(state.character.hidden.vice + r.thrill.vice, 0, 100);
  if (!chance(state.rng, watchChance(state, rule, def, content))) return { caught: false };
  rule.caught += 1;
  t.totals.caught += 1;
  const punishment = pickPunishment(state, rule, content);
  applyPunishment(state, rule, punishment, content);
  t.caught = { year: state.currentYear, ruleId: rule.ruleId, by: rule.by };
  teenHistory(state, 'ruleCaught', { parent: state.people[rule.by]?.name.first ?? 'a parent', rule: def.name }, content);
  return { caught: true, punishment, parentId: rule.by };
}

/** Moves a rule one level looser or stricter (an event, a negotiation, a growing-up). Returns whether it moved. */
export function adjustRule(state: LifeState, domain: RuleDomainId, delta: -1 | 1, content: ContentBundle): boolean {
  const rule = ruleOf(state, domain);
  if (!rule) return false;
  const next = clampInt(rule.level + delta, 0, 2) as 0 | 1 | 2;
  if (next === rule.level) return false;
  rule.level = next;
  if (delta < 0) teenHistory(state, 'ruleLoosened', { parent: state.people[rule.by]?.name.first ?? 'a parent', rule: content.houseRules[domain]?.name ?? domain }, content);
  return true;
}

export type NegotiateBlock = 'none' | 'relaxed' | 'asked' | 'limit' | 'away' | 'age';

/** Why you can't ask about this rule now, or null. */
export function negotiateBlock(state: LifeState, domain: RuleDomainId, content: ContentBundle): NegotiateBlock | null {
  if (state.housing.kind === 'incarcerated') return 'away';
  if (!inTeenYears(state, content)) return 'age';
  const rule = ruleOf(state, domain);
  if (!rule) return 'none';
  if (rule.level === 0) return 'relaxed';
  if (rule.negotiated === state.currentYear) return 'asked';
  const asked = state.teen.home?.rules.filter((r) => r.negotiated === state.currentYear).length ?? 0;
  if (asked >= content.balance.teen.rules.negotiate.perYear) return 'limit';
  return null;
}

/** The chance a parent agrees to loosen this rule, 0–1: how they feel about you, their style, your grades, the level and how often you were caught. */
export function negotiateChance(state: LifeState, rule: TeenRule, content: ContentBundle): number {
  const n = content.balance.teen.rules.negotiate;
  const rel = state.relationships[rule.by];
  const style = state.teen.home?.styles[rule.by] ?? { warmth: 50, strictness: 50, involvement: 50 };
  const gpa = state.education.current?.gpa ?? 2.5;
  const points =
    n.base +
    n.affection * ((rel?.affection ?? 50) - 50) +
    n.trust * ((rel?.trust ?? 50) - 50) +
    n.warmth * (style.warmth - 50) +
    n.strictness * (style.strictness - 50) +
    n.grades * (gpa - 2.5) +
    n.perLevel * rule.level +
    n.caught * Math.min(rule.caught, 3);
  return clampInt(points, n.min, n.max) / 100;
}

/** You ask a parent to loosen a rule. Returns whether they agreed (null when you can't ask). */
export function negotiate(state: LifeState, domain: RuleDomainId, content: ContentBundle): boolean | null {
  if (negotiateBlock(state, domain, content) !== null) return null;
  const rule = ruleOf(state, domain)!;
  const n = content.balance.teen.rules.negotiate;
  rule.negotiated = state.currentYear;
  state.teen.totals.negotiated += 1;
  const won = chance(state.rng, negotiateChance(state, rule, content));
  const rel = state.relationships[rule.by];
  const move = won ? n.win : n.lose;
  if (rel) {
    rel.affection = clampInt(rel.affection + move.affection, 0, 100);
    rel.trust = clampInt(rel.trust + move.trust, 0, 100);
  }
  if (won) {
    adjustRule(state, domain, -1, content);
    state.teen.totals.won += 1;
  }
  return won;
}

/** The yearly part of the rules at home. */
export function runRules(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  const r = content.balance.teen.rules;
  // A catch whose event has had its year is forgotten.
  if (t.caught && t.caught.year < state.currentYear - 1) delete t.caught;
  t.penalties = t.penalties.filter((p) => p.until >= state.currentYear);
  refreshHome(state, content);
  if (!t.home) return;

  // Growing up: parents who like and trust you ease off at 15, 16 and 17.
  if (r.negotiate.looserAt.includes(state.character.age)) {
    for (const rule of t.home.rules) {
      const rel = state.relationships[rule.by];
      if (rule.level > 0 && rel && rel.affection >= r.negotiate.ageTrust.affection && rel.trust >= r.negotiate.ageTrust.trust) adjustRule(state, rule.ruleId as RuleDomainId, -1, content);
    }
  }
  if (t.penalties.length > 0) applyStatEffects(state, r.restricted);

  // Rules you break without thinking about it.
  const crowd = myClique(state);
  const trouble = crowd ? (cliqueDef(content, crowd.defId)?.trouble ?? 1) : 1;
  let breaks = 0;
  for (const rule of [...t.home.rules]) {
    if (breaks >= r.maxBreaksPerYear) break;
    const def = content.houseRules[rule.ruleId];
    if (!def || !ruleApplies(state, def)) continue;
    const p =
      def.temptation *
      (r.levelTemptation[rule.level] ?? 1) *
      curveAt(r.riskTaking, state.character.personality.riskTaking) *
      curveAt(r.discipline, state.character.personality.discipline) *
      trouble *
      (isGrounded(state) ? r.groundedBreak : 1) *
      (penaltyActive(state, 'privilege', rule.ruleId as RuleDomainId) ? 0.5 : 1);
    if (!chance(state.rng, Math.min(0.9, p))) continue;
    breaks += 1;
    const result = breakRule(state, rule.ruleId as RuleDomainId, content);
    if (result?.caught && result.parentId !== undefined) queueTeenEvent(state, 'caught', { parent: result.parentId }, content);
  }
}
