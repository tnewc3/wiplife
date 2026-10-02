/**
 * The simulated player's interactions (E1): how each simulated player uses
 * the Interact menu, and what the run measures about it. Like the other
 * player models these chances describe the simulated player, not the game,
 * so they live here rather than in the balance files.
 *
 * - careful: a few kind interactions a year with the people closest to it
 *   (family, partner, close friends); no fights; gifts and asking for money
 *   only when sensible.
 * - careless: random available interactions with random people, fights and
 *   all, and random choices.
 * - spammer: picks one person with a middling relationship and repeats the
 *   same interaction with them over and over, every year, to show that
 *   repeating can't take a neutral relationship to maximum affection.
 */
import { OUTCOME_TIERS, type ContentBundle, type GiftTier, type OutcomeTier } from '../../src/content/schemas';
import { canAffordGift, giftPrice } from '../../src/engine/interactions/links';
import { availableInteractions, isInteractionAvailable } from '../../src/engine/interactions/availability';
import { closeInteraction, performInteraction, resolveInteractionChoice } from '../../src/engine/interactions/perform';
import { repeatsThisYear } from '../../src/engine/interactions/reaction';
import { isFamilyKind, isPartnerKind } from '../../src/engine/relationships';
import { nextInt, pick, type RngState } from '../../src/engine/rng';
import { weightedPick } from '../../src/engine/random';
import type { LifeState } from '../../src/engine/types';

export type InteractionPlayer = 'careful' | 'careless' | 'spammer';

export interface InteractionPlan {
  interactionId: string;
  personId: string;
  giftTier?: GiftTier;
}

/** How many times a year the spammer repeats itself (the same interaction with the same person). */
export const SPAMS_PER_YEAR = 10;

const GIFT_TIERS_BY_PRICE: GiftTier[] = ['small', 'medium', 'big'];

function closePeople(life: LifeState): string[] {
  return Object.keys(life.relationships)
    .sort()
    .filter((id) => life.relationships[id]!.status === 'active' && life.people[id]?.alive);
}

/** The interactions the simulated player does this year, drawing from `rng`. */
export function chooseInteractions(life: LifeState, content: ContentBundle, rng: RngState, player: InteractionPlayer): InteractionPlan[] {
  const plans: InteractionPlan[] = [];
  const people = closePeople(life);
  if (people.length === 0 || life.character.age < 4) return plans;

  if (player === 'spammer') {
    // The middling relationship is the hardest case: lots of room to grow.
    const options = people
      .filter((id) => isInteractionAvailable(life, content.interactions.compliment!, id, content))
      .sort((a, b) => Math.abs(life.relationships[a]!.affection - 50) - Math.abs(life.relationships[b]!.affection - 50));
    const target = options[0];
    if (target === undefined) return plans;
    for (let i = 0; i < SPAMS_PER_YEAR; i++) plans.push({ interactionId: 'compliment', personId: target });
    return plans;
  }

  const budget = player === 'careless' ? nextInt(rng, 0, 6) : nextInt(rng, 1, 4);
  const done = new Map<string, number>();
  for (let i = 0; i < budget; i++) {
    const weighted = people.map((id) => {
      const rel = life.relationships[id]!;
      const closeness = isFamilyKind(rel.kind) || isPartnerKind(rel.kind) ? 2 : 1;
      return [id, player === 'careless' ? 1 : (rel.affection + 20) * closeness] as const;
    });
    const personId = weightedPick(rng, weighted);
    const defs = availableInteractions(life, personId, content).filter((def) => {
      if ((done.get(`${def.id}:${personId}`) ?? 0) >= 2) return false;
      if (player === 'careless') return true;
      if (def.group === 'conflict') return false;
      if (def.romance && !isPartnerKind(life.relationships[personId]!.kind)) return false;
      if (def.id === 'ask_money') return life.finances.savings < 200 && life.character.age >= content.balance.economy.independenceAge;
      if (def.id === 'apologize') return true;
      return true;
    });
    if (defs.length === 0) continue;
    const def =
      player === 'careless'
        ? pick(rng, defs)
        : weightedPick(rng, defs.map((d) => [d, d.group === 'everyday' ? 3 : d.group === 'romance' ? 2 : d.id === 'apologize' ? 3 : 1.5] as const));
    let giftTier: GiftTier | undefined;
    if (def.gift) {
      const affordable = GIFT_TIERS_BY_PRICE.filter((t) => canAffordGift(life, t, content) && (player === 'careless' || life.finances.savings >= giftPrice(life, t, content) * 20));
      if (affordable.length === 0) continue;
      giftTier = pick(rng, affordable);
    }
    done.set(`${def.id}:${personId}`, (done.get(`${def.id}:${personId}`) ?? 0) + 1);
    plans.push({ interactionId: def.id, personId, ...(giftTier ? { giftTier } : {}) });
  }
  return plans;
}

/** What the run measures about interactions, for one simulated player. */
export interface InteractionReport {
  player: InteractionPlayer;
  lives: number;
  /** Life-years in which the player could interact (age 4 and up, between years). */
  years: number;
  interactions: number;
  tiers: Record<OutcomeTier, number>;
  /** Outcome tiers by earlier uses of the same interaction with the same person that year (0, 1, 2–3, 4 or more). */
  byRepeat: { label: string; interactions: number; bad: number; backfire: number }[];
  byInteraction: { id: string; count: number; tiers: Record<OutcomeTier, number> }[];
  affection: {
    /** Relationships that reached 100 affection at any point in a life (by any means), and through interactions. */
    reachedMax: number;
    reachedMaxByInteractions: number;
    /** Person-years of interactions, and the most affection one gained in one (the cap is balance interactions returns.yearlyCap). */
    personYears: number;
    mostGainedInYear: number;
    /** Relationships at 60 or less at the start of a year that reached 100 through that year's interactions (must be zero). */
    neutralToMax: number;
  };
  money: { giftsBought: number; giftCount: number; givenToYou: number; borrowed: number; loans: number };
  fights: { picked: number; brawls: number; injuries: number; charges: number; suspensions: number };
  health: { intimateNights: number; infections: { treatable: number; chronic: number } };
  cheating: { acts: number; foundOut: number };
  replay: { checked: number; mismatches: number };
}

const emptyTiers = (): Record<OutcomeTier, number> => ({ great: 0, good: 0, neutral: 0, bad: 0, backfire: 0 });

export function emptyInteractionReport(player: InteractionPlayer, content: ContentBundle): InteractionReport {
  return {
    player,
    lives: 0,
    years: 0,
    interactions: 0,
    tiers: emptyTiers(),
    byRepeat: ['0', '1', '2–3', '4 or more'].map((label) => ({ label, interactions: 0, bad: 0, backfire: 0 })),
    byInteraction: Object.keys(content.interactions)
      .sort()
      .map((id) => ({ id, count: 0, tiers: emptyTiers() })),
    affection: { reachedMax: 0, reachedMaxByInteractions: 0, personYears: 0, mostGainedInYear: 0, neutralToMax: 0 },
    money: { giftsBought: 0, giftCount: 0, givenToYou: 0, borrowed: 0, loans: 0 },
    fights: { picked: 0, brawls: 0, injuries: 0, charges: 0, suspensions: 0 },
    health: { intimateNights: 0, infections: { treatable: 0, chronic: 0 } },
    cheating: { acts: 0, foundOut: 0 },
    replay: { checked: 0, mismatches: 0 },
  };
}

const repeatBucket = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3);

/** Per life: who reached maximum affection, and where each person's affection stood when the year's interactions began. */
export class InteractionWatcher {
  readonly reachedMax = new Set<string>();
  readonly reachedByInteractions = new Set<string>();
  private yearStart = new Map<string, number>();
  private touched = new Set<string>();

  beginYear(life: LifeState): void {
    this.yearStart = new Map(Object.entries(life.relationships).map(([id, rel]) => [id, rel.affection]));
    this.touched.clear();
  }

  /** Any relationship at maximum affection now. */
  observe(life: LifeState): void {
    for (const [id, rel] of Object.entries(life.relationships)) if (rel.affection >= 100) this.reachedMax.add(id);
  }

  /** The year's interactions are over: what they did to each person's affection. */
  endInteractions(life: LifeState, report: InteractionReport): void {
    for (const id of this.touched) {
      const rel = life.relationships[id];
      const start = this.yearStart.get(id);
      if (!rel || start === undefined) continue;
      report.affection.personYears++;
      report.affection.mostGainedInYear = Math.max(report.affection.mostGainedInYear, rel.affection - start);
      if (start <= 60 && rel.affection >= 100) report.affection.neutralToMax++;
    }
  }

  touch(personId: string): void {
    this.touched.add(personId);
  }
}

/** Picks the safest option when a moment opens a choice (careful), or any (careless and the spammer). */
function chooseOption(options: readonly { id: string }[], player: InteractionPlayer, rng: RngState): string {
  const safe = options.find((o) => ['walk_away', 'back_down', 'careful'].includes(o.id));
  return player === 'careful' && safe ? safe.id : pick(rng, options).id;
}

/**
 * Does one planned interaction (and answers a choice it opens, then closes
 * the card), counting what it did. Returns the new life.
 */
export function playInteraction(
  life: LifeState,
  content: ContentBundle,
  plan: InteractionPlan,
  player: InteractionPlayer,
  rng: RngState,
  watcher: InteractionWatcher,
  report: InteractionReport,
): LifeState {
  const def = content.interactions[plan.interactionId]!;
  const before = life;
  const repeats = repeatsThisYear(before, before.relationships[plan.personId]!, def.id);
  const price = plan.giftTier ? giftPrice(before, plan.giftTier, content) : 0;
  let next = performInteraction(life, plan, content);
  const outcome = next.pendingInteraction!;
  if (outcome.choice) next = resolveInteractionChoice(next, chooseOption(outcome.choice.options, player, rng), content);
  const card = next.pendingInteraction!;
  next = closeInteraction(next);

  report.interactions++;
  report.tiers[card.tier]++;
  const row = report.byInteraction.find((r) => r.id === def.id)!;
  row.count++;
  row.tiers[card.tier]++;
  const bucket = report.byRepeat[repeatBucket(repeats.same)]!;
  bucket.interactions++;
  if (card.tier === 'bad') bucket.bad++;
  if (card.tier === 'backfire') bucket.backfire++;

  if (def.gift) {
    report.money.giftCount++;
    report.money.giftsBought += price;
  }
  if (card.money) {
    if (def.id === 'ask_money') {
      if (card.money.change > 0) report.money.givenToYou += card.money.change;
      if (card.money.debtChange > 0) {
        report.money.borrowed += card.money.debtChange;
        report.money.loans++;
      }
    }
  }
  if (def.id === 'pick_a_fight') {
    report.fights.picked++;
    if (card.notes.length > 0 || next.relationships[plan.personId]!.memories.some((m) => m.tag === 'big_fight' && m.year === next.currentYear)) report.fights.brawls++;
  }
  const newCondition = (id: string) => next.health.conditions.some((c) => c.conditionId === id) && !before.health.conditions.some((c) => c.conditionId === id);
  if (newCondition('broken_bone') && def.id === 'pick_a_fight') report.fights.injuries++;
  if (next.legal.record.length > before.legal.record.length && next.legal.record.at(-1)!.offenseId === 'assault') report.fights.charges++;
  if (next.flags.suspended === true && before.flags.suspended !== true && def.id === 'pick_a_fight') report.fights.suspensions++;
  if (def.intimate && ['great', 'good', 'neutral'].includes(card.tier)) report.health.intimateNights++;
  if (newCondition('treatable_infection')) report.health.infections.treatable++;
  if (newCondition('chronic_infection')) report.health.infections.chronic++;
  if (next.flags.unfaithful === true && before.flags.unfaithful !== true) report.cheating.acts++;

  watcher.touch(plan.personId);
  if (next.relationships[plan.personId]!.affection >= 100) {
    watcher.reachedMax.add(plan.personId);
    watcher.reachedByInteractions.add(plan.personId);
  }
  return next;
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The interactions part of the report. */
export function formatInteractions(report: InteractionReport, content: ContentBundle): string[] {
  const r = report;
  const cap = content.balance.interactions.returns.yearlyCap;
  const lines: string[] = [];
  lines.push(`Interactions (E1; ${r.player} player): ${r.interactions} in ${r.years} life-years (${(r.years > 0 ? r.interactions / r.years : 0).toFixed(2)} a year, ${(r.lives > 0 ? r.interactions / r.lives : 0).toFixed(1)} a life)`);
  lines.push(`  outcome tiers: ${OUTCOME_TIERS.map((t) => `${t} ${pct(r.tiers[t], r.interactions)}`).join(', ')}`);
  lines.push(`  by earlier uses of the same interaction with the person that year: ${r.byRepeat.map((b) => `${b.label}: bad ${pct(b.bad, b.interactions)}, backfire ${pct(b.backfire, b.interactions)} (${b.interactions})`).join('; ')}`);
  const top = r.byInteraction.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  lines.push(`  by interaction: ${top.map((row) => `${row.id} ${row.count}`).join(', ') || 'none'}`);
  lines.push(
    `  affection: ${r.affection.reachedMax} relationships reached maximum affection by any means (${r.affection.reachedMaxByInteractions} through interactions); most one person gained from interactions in a year: ${r.affection.mostGainedInYear} (cap ${cap.affection}); ${r.affection.neutralToMax} neutral relationships (60 or less) taken to maximum within a year, over ${r.affection.personYears} person-years`,
  );
  lines.push(`  money: bought ${r.money.giftCount} gifts for ${dollars(r.money.giftsBought)}; given to you ${dollars(r.money.givenToYou)}; borrowed ${dollars(r.money.borrowed)} in ${r.money.loans} loans`);
  lines.push(`  fights: ${r.fights.picked} picked, ${r.fights.brawls} turned into brawls, ${r.fights.injuries} injuries, ${r.fights.charges} assault charges, ${r.fights.suspensions} school suspensions`);
  lines.push(`  health: ${r.health.intimateNights} intimate nights, ${r.health.infections.treatable} treatable and ${r.health.infections.chronic} lifelong infections`);
  lines.push(`  unfaithful acts: ${r.cheating.acts} lives; found out by a follow-up event ${r.cheating.foundOut} times`);
  lines.push(`  replay: ${r.replay.checked - r.replay.mismatches} of ${r.replay.checked} sampled lives rebuilt exactly from their input log`);
  return lines;
}
