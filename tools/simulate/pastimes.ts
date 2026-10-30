/**
 * Activities, simulated and measured (Batch 2a): how each simulated player
 * uses the Activities screen, and what it leads to. Like the other player
 * models these chances describe the simulated player, not the game, so they
 * live here rather than in the balance files.
 *
 * - careful: a few activities a year, picked by what the life is into
 *   (a profile rolled per life), within what it can comfortably pay; surgery
 *   and luxury are rare and need savings; singles try the Love activities;
 *   a partner comes along on a date night.
 * - careless: random available activities, random companions and surgeons,
 *   whatever they cost.
 * - spammer: finds one activity (the gym) and repeats it as often as the
 *   yearly limit allows, every year, to show that repeating gives less
 *   each time.
 *
 * The watcher compares the life before and after each activity, so nothing
 * here touches the engine.
 */
import { OUTCOME_TIERS, PASTIME_CATEGORIES, PASTIME_QUALITIES, RISK_CATEGORIES, type ContentBundle, type PastimeCategory, type PastimeQuality, type PastimeRoute, type PastimeStake } from '../../src/content/schemas';
import { allPastimes, companionOptions, pastimeBlock, pastimePrice } from '../../src/engine/pastimes/query';
import { repeatsOf } from '../../src/engine/pastimes/activities';
import { getActivityTabView } from '../../src/engine/selectors';
import { valuablesOf } from '../../src/engine/possessions/query';
import { weightedPick } from '../../src/engine/random';
import { chance, nextFloat, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { LifeState, PastimeReceipt } from '../../src/engine/types';
import { emptyRiskReport, RiskWatcher, type RiskReport } from './risk';
import { evidenceCount, fakeIdUsable } from '../../src/engine/pastimes/risk';
import type { SimulationReport, TargetResult } from './run';

export type PastimePlayer = 'careful' | 'careless' | 'spammer' | 'criminal' | 'activities';

export interface PastimePlan {
  pastimeId: string;
  companionId?: string;
  quality?: PastimeQuality;
  /** Batch 2b: gambling (a stake, chasing a loss), a lawsuit (the route), a name change (typed names and the parent who agrees). */
  stake?: PastimeStake;
  chase?: true;
  route?: PastimeRoute;
  first?: string;
  last?: string;
  consentId?: string;
  /** A1: what changes in the portrait (the salon and shopping). */
  look?: string;
}

/** The action's params for a plan. */
export function paramsOfPlan(plan: PastimePlan): Record<string, unknown> {
  return { ...plan };
}

/** Chances describing the simulated player (not the game). */
const POLICY = {
  /** Activities a year for the careful player, by age (the most; each is rolled). */
  perYear: [
    { upTo: 9, max: 1, p: 0.25 },
    { upTo: 17, max: 2, p: 0.3 },
    { upTo: 64, max: 2, p: 0.45 },
    { upTo: 120, max: 2, p: 0.3 },
  ],
  /** A pick whose price is above this share of savings is left for later. */
  affordShare: 0.06,
  /** A companion comes along, when one can. */
  companion: 0.45,
  /** A yearly chance of wanting each of these (when the life is that way inclined and can pay). */
  surgery: 0.012,
  luxury: 0.025,
  loveSingle: 0.3,
  dateNight: 0.2,
  /** Savings must be this many times the price for surgery and luxury. */
  cushion: 5,
  /** The careful player sells a valuable when it is in debt with nothing saved, with this chance. */
  sellWhenBroke: 0.4,
  /** The careless player does this many activities a year at most. */
  carelessMax: 4,
  /** The spammer's activity: the gym, hard and light workouts and runs in turn, as often as the year allows. */
  spam: ['hit_the_gym_hard', 'go_to_the_gym', 'go_for_a_run'],
  /** A1: the activity player. Activities a year (the most), with the chance of each; and the chance of each risky or costly kind. */
  tab: { perYear: [{ upTo: 9, max: 2, p: 0.5 }, { upTo: 17, max: 3, p: 0.6 }, { upTo: 64, max: 3, p: 0.65 }, { upTo: 120, max: 2, p: 0.5 }], casino: 0.1, lottery: 0.15, hobbyYear: 0.7, hobbySessions: 3, affordShare: 0.1 },
};

export interface PastimeProfile {
  /** How much the life likes each group. */
  interests: Record<PastimeCategory, number>;
  /** Cares about how it looks: surgery is on the table. */
  vain: boolean;
  /** Likes to buy beautiful things. */
  collector: boolean;
  /** A1: how much the life likes each activity of the tab, and the hobby it takes up (the id of a hobby's option). */
  hubs: Record<string, number>;
  hobby: string;
}

/** The hobbies there are, in a fixed order (every option of the Hobbies activity). */
const HOBBY_IDS = ['play_the_guitar', 'paint_or_draw', 'write_stories', 'bake_something', 'build_with_wood', 'play_chess', 'practice_dance', 'practice_public_speaking', 'shoot_hoops'];
// The activities this player picks from (the risky ones, crime, loans, the black market and lawsuits, are the criminal's and the careless player's). U2 added the outdoors, health and mind & body ones.
const HUB_IDS = ['gym', 'meditate', 'read', 'nightlife', 'dating', 'parties', 'lottery', 'casino', 'shopping', 'vacation', 'salon', 'hobbies', 'walk', 'yoga', 'hike', 'fish', 'camp', 'birdwatch', 'swim', 'garden', 'eyes', 'dentist', 'counseling', 'movies'];

export function rollPastimeProfile(rng: RngState): PastimeProfile {
  const w = () => 0.3 + 1.4 * nextFloat(rng);
  return {
    interests: { mind_body: w(), health: w(), recovery: 0.3, salon_spa: w(), surgery: 0.3, shopping: w(), movies: w() * 1.2, nightlife: w(), outdoor: w(), luxury: 0.3, love: 1, social: w(), hobby: w(), crime: 0, black_market: 0, gambling: 0, lawsuits: 0, identity: 0, loans: 0 },
    vain: chance(rng, 0.18),
    collector: chance(rng, 0.2),
    hubs: Object.fromEntries(HUB_IDS.map((id) => [id, w()])),
    hobby: HOBBY_IDS[nextInt(rng, 0, HOBBY_IDS.length - 1)]!,
  };
}

function countFor(age: number, rng: RngState): number {
  const row = POLICY.perYear.find((r) => age <= r.upTo)!;
  let n = 0;
  for (let i = 0; i < row.max; i++) if (chance(rng, row.p)) n++;
  return n;
}

/** The activities the simulated player does this year, drawing from `rng`. */
export function choosePastimePlans(life: LifeState, content: ContentBundle, rng: RngState, profile: PastimeProfile, player: PastimePlayer): PastimePlan[] {
  if (life.phase !== 'yearStart') return [];
  const age = life.character.age;
  const defs = allPastimes(content);
  const plans: PastimePlan[] = [];

  if (player === 'spammer') {
    // A1: the gym's options in turn, as many times as the year allows (each option's own limit and the activity's).
    const hub = content.registries.activities.activities.find((a) => a.id === 'gym')!;
    for (let i = 0; i < hub.limit; i++) plans.push({ pastimeId: POLICY.spam[i % POLICY.spam.length]! });
    return plans;
  }
  if (player === 'activities') return chooseActivityPlans(life, content, rng, profile);

  const options = (def: (typeof defs)[number], loose: boolean): PastimePlan | null => {
    const quality: PastimeQuality | undefined = def.quality ? (loose ? pick(rng, [...PASTIME_QUALITIES]) : life.finances.savings > 40_000 && chance(rng, 0.5) ? 'premier' : chance(rng, 0.2) ? 'budget' : 'standard') : undefined;
    const companions = companionOptions(life, def, content);
    let companionId: string | undefined;
    if (def.companion === 'required') companionId = companions[0]?.id;
    else if (def.companion === 'optional' && companions.length > 0 && chance(rng, loose ? 0.5 : POLICY.companion)) companionId = pick(rng, companions).id;
    if (def.companion === 'required' && companionId === undefined) return null;
    const choice = { companionId, quality };
    if (pastimeBlock(life, def, choice, content) !== null) return null;
    return { pastimeId: def.id, ...(companionId ? { companionId } : {}), ...(quality ? { quality } : {}) };
  };

  if (player === 'careless') {
    const n = nextInt(rng, 0, POLICY.carelessMax);
    const ordinary = defs.filter((d) => !(RISK_CATEGORIES as readonly string[]).includes(d.category));
    for (let i = 0; i < n; i++) {
      const plan = options(pick(rng, ordinary), true);
      if (plan) plans.push(plan);
    }
    return plans;
  }

  // Careful: ordinary activities by interest and price, then the rare ones.
  const n = countFor(age, rng);
  const single = !Object.values(life.relationships).some((r) => ['partner', 'fiance', 'spouse'].includes(r.kind) && r.status === 'active');
  for (let i = 0; i < n; i++) {
    const candidates: [PastimePlan, number][] = [];
    for (const def of defs) {
      // (Batch 2b: crime, gambling, lawsuits, names and loans are chosen by ./risk.ts.)
      if (['surgery', 'luxury', 'love'].includes(def.category) || (RISK_CATEGORIES as readonly string[]).includes(def.category)) continue;
      const plan = options(def, false);
      if (!plan) continue;
      const price = pastimePrice(life, def, plan, content);
      if (price > life.finances.savings * POLICY.affordShare) continue;
      candidates.push([plan, profile.interests[def.category] * (def.category === 'nightlife' && age > 45 ? 0.3 : 1) * (price === 0 ? 1.5 : 1)]);
    }
    if (candidates.length > 0) plans.push(weightedPick(rng, candidates));
  }
  const rare = (category: PastimeCategory, p: number, needs: boolean) => {
    if (!needs || !chance(rng, p)) return;
    const pool = defs.filter((d) => d.category === category);
    const def = pick(rng, pool);
    const plan = options(def, false);
    if (!plan) return;
    if (life.finances.savings < pastimePrice(life, def, plan, content) * POLICY.cushion) return;
    plans.push(plan);
  };
  rare('surgery', POLICY.surgery, profile.vain && age >= 18);
  rare('luxury', POLICY.luxury, profile.collector && age >= 18);
  if (age >= 18 && single) rare('love', POLICY.loveSingle, true);
  if (age >= 18 && !single && chance(rng, POLICY.dateNight)) {
    const date = options(content.pastimes.date_night!, false);
    if (date) plans.push(date);
    else {
      const classPlan = options(content.pastimes.take_a_class_together!, false);
      if (classPlan) plans.push(classPlan);
    }
  }
  return plans;
}

/** A1: the player who uses the Activities tab: a few activities a year, picked by interest, their options chosen as the tab offers them, and a hobby kept up. */
function chooseActivityPlans(life: LifeState, content: ContentBundle, rng: RngState, profile: PastimeProfile): PastimePlan[] {
  const view = getActivityTabView(life, content);
  const open = view.categories.flatMap((c) => c.sections.flatMap((x) => x.activities)).filter((a) => a.block === null && a.options.length > 0 && profile.hubs[a.id] !== undefined);
  const row = POLICY.tab.perYear.find((r) => life.character.age <= r.upTo)!;
  let n = 0;
  for (let i = 0; i < row.max; i++) if (chance(rng, row.p)) n++;
  const plans: PastimePlan[] = [];
  const planOf = (entry: (typeof open)[number]['options'][number]): PastimePlan | null => {
    const def = content.pastimes[entry.id]!;
    let plan: PastimePlan = { pastimeId: def.id };
    if (entry.look) plan = { ...plan, look: pick(rng, entry.look.options) };
    if (entry.qualities) plan = { ...plan, quality: 'standard' };
    if (entry.stakes) plan = { ...plan, stake: chance(rng, 0.7) ? 'low' : 'medium' };
    if (def.companion === 'required') {
      const first = entry.companions[0];
      if (!first) return null;
      plan = { ...plan, companionId: first.id };
    } else if (def.companion === 'optional' && entry.companions.length > 0 && chance(rng, POLICY.companion)) plan = { ...plan, companionId: pick(rng, entry.companions).id };
    if (pastimeBlock(life, def, plan, content) !== null) return null;
    const price = pastimePrice(life, def, plan, content);
    return price > life.finances.savings * POLICY.tab.affordShare ? null : plan;
  };
  for (let i = 0; i < n && open.length > 0; i++) {
    const hub = weightedPick(rng, open.map((a) => [a, profile.hubs[a.id]!] as [(typeof open)[number], number]));
    if (hub.id === 'casino' && !chance(rng, POLICY.tab.casino)) continue;
    if (hub.id === 'lottery' && !chance(rng, POLICY.tab.lottery)) continue;
    if (hub.kind === 'hobbies') {
      // A hobby is taken up and kept up: the same one, a few times a year.
      if (!chance(rng, POLICY.tab.hobbyYear)) continue;
      const entry = hub.options.find((o) => o.id === profile.hobby) ?? pick(rng, hub.options);
      const sessions = nextInt(rng, 1, POLICY.tab.hobbySessions);
      for (let k = 0; k < sessions; k++) {
        const plan = planOf(entry);
        if (plan) plans.push(plan);
      }
      continue;
    }
    const plan = planOf(pick(rng, hub.options));
    if (plan) plans.push(plan);
  }
  return plans;
}

// ─────────────────────────────── The report ───────────────────────────────

interface Tiers {
  great: number;
  good: number;
  neutral: number;
  bad: number;
  backfire: number;
}
const emptyTiers = (): Tiers => ({ great: 0, good: 0, neutral: 0, bad: 0, backfire: 0 });

export interface PastimesReport {
  players: PastimePlayer;
  lives: number;
  years: number;
  activities: number;
  /** Lives that did at least one. */
  livesWith: number;
  tiers: Tiers;
  byCategory: Record<PastimeCategory, { count: number; spent: number; lives: number }>;
  byActivity: Record<string, { count: number; tiers: Tiers }>;
  /** Everything spent on activities (base dollars), and the income of the lives (for the share). */
  spent: number;
  income: number;
  /** Activities by how many times the same one was done earlier this year (0, 1, 2, 3, 4+): outings, summed benefit, great and good outcomes. */
  byRepeat: { outings: number; benefit: number; goodShare: number }[];
  surgery: { done: number; complications: number; byQuality: Record<PastimeQuality, { done: number; complications: number }>; lives: number; regrets: number };
  nightlife: { outings: number; meetings: number; hookups: number; temptations: number; fights: number; charges: number; drunkDrives: number; addictions: number; livesWithAddiction: number; adultsOnlyBreaches: number };
  love: { outings: number; matches: number; partnered: number };
  valuables: { bought: number; spent: number; stolen: number; sold: number; valuableYears: number; lives: number; thefts: number };
  /** Receipts that showed money coming in (must be 0) and under-18s who did an adults-only activity (must be 0). */
  moneyCreated: number;
  minorBreaches: number;
  invariantFailures: number;
  /** Batch 2b: crime, the black market, gambling, lawsuits, names and loans. */
  risk: RiskReport;
  /** A1: the Activities tab. */
  a1: A1Report;
}

/** A1: what the Activities tab led to. */
export interface A1Report {
  /** By activity of the tab: outings, outcomes, what was spent, what was won (gambling) and how many lives used it. */
  byHub: Record<string, { count: number; tiers: Tiers; spent: number; won: number; lives: number }>;
  /** What each stat moved by across all outings of the tab (sum of the receipts' changes). */
  statSums: Record<string, number>;
  /** Portrait changes by kind (salon and shopping). */
  looks: Record<string, number>;
  /** Hobbies: lives that took one up, practices, lives that got skilled, hidden talents brought to light by practice, and the best skill reached. */
  hobbies: { lives: number; practices: number; skilledLives: number; talentsFound: number; bestSkill: number };
  /** Addictions started (lives), and anyone under 18 in an activity of an adults-only kind (must be 0). */
  addictions: { gamblingLives: number; alcoholLives: number };
  adultsOnlyBreaches: number;
  /** The spammer: the biggest change of any of the four stats in a year it spammed, and years when a stat went from 60 or less to 100. */
  spam: { years: number; maxGain: number; maxed: number };
}

const emptyA1 = (): A1Report => ({
  byHub: {},
  statSums: {},
  looks: {},
  hobbies: { lives: 0, practices: 0, skilledLives: 0, talentsFound: 0, bestSkill: 0 },
  addictions: { gamblingLives: 0, alcoholLives: 0 },
  adultsOnlyBreaches: 0,
  spam: { years: 0, maxGain: 0, maxed: 0 },
});

export function emptyPastimesReport(player: PastimePlayer): PastimesReport {
  return {
    players: player,
    lives: 0,
    years: 0,
    activities: 0,
    livesWith: 0,
    tiers: emptyTiers(),
    byCategory: Object.fromEntries(PASTIME_CATEGORIES.map((c) => [c, { count: 0, spent: 0, lives: 0 }])) as PastimesReport['byCategory'],
    byActivity: {},
    spent: 0,
    income: 0,
    byRepeat: Array.from({ length: 5 }, () => ({ outings: 0, benefit: 0, goodShare: 0 })),
    surgery: { done: 0, complications: 0, byQuality: Object.fromEntries(PASTIME_QUALITIES.map((q) => [q, { done: 0, complications: 0 }])) as PastimesReport['surgery']['byQuality'], lives: 0, regrets: 0 },
    nightlife: { outings: 0, meetings: 0, hookups: 0, temptations: 0, fights: 0, charges: 0, drunkDrives: 0, addictions: 0, livesWithAddiction: 0, adultsOnlyBreaches: 0 },
    love: { outings: 0, matches: 0, partnered: 0 },
    valuables: { bought: 0, spent: 0, stolen: 0, sold: 0, valuableYears: 0, lives: 0, thefts: 0 },
    moneyCreated: 0,
    minorBreaches: 0,
    invariantFailures: 0,
    risk: emptyRiskReport(),
    a1: emptyA1(),
  };
}

/** What an outing came to, as a number: the stats that rose, less the stress that did. */
function benefit(changes: PastimeReceipt['changes']): number {
  return (changes.health ?? 0) + (changes.happiness ?? 0) + (changes.smarts ?? 0) + (changes.looks ?? 0) + (changes.fitness ?? 0) - (changes.stress ?? 0);
}

const conditionIds = (life: LifeState) => new Set(life.health.conditions.map((c) => c.conditionId));

/** Watches one life's activities. */
export class PastimesWatcher {
  private categories = new Set<PastimeCategory>();
  private any = false;
  private surgery = false;
  private addiction = false;
  private owned = false;
  private hubs = new Set<string>();
  private hobby = false;
  private skilled = false;
  private gambling = false;
  private alcohol = false;
  private readonly risk: RiskWatcher;

  constructor(
    private readonly r: PastimesReport,
    private readonly content: ContentBundle,
  ) {
    this.risk = new RiskWatcher(r.risk, content);
  }

  /** The engine refused a plan (a name that is not valid, say). */
  refused(plan: PastimePlan): void {
    this.risk.refused(plan);
  }

  /** Runs one activity: `act` performs it and returns the life before it is settled; `settle` plays out the result events. */
  play(life: LifeState, plan: PastimePlan, act: (life: LifeState) => LifeState, settle: (life: LifeState) => LifeState): LifeState {
    const { content, r } = this;
    const def = content.pastimes[plan.pastimeId]!;
    const before = life;
    const repeats = repeatsOf(before, def, content);
    const opened = act(life);
    const receipt = opened.pastimes.receipts.at(-1)!;
    const pendingIds = opened.pending.map((p) => p.eventId);
    const castPeople = opened.pending.flatMap((p) => Object.values(p.cast)).map((id) => opened.people[id]).filter((p) => p !== undefined);
    const after = settle(opened);

    r.activities++;
    this.any = true;
    this.categories.add(def.category);
    r.tiers[receipt.tier]++;
    const cat = r.byCategory[def.category];
    cat.count++;
    const row = (r.byActivity[def.id] ??= { count: 0, tiers: emptyTiers() });
    row.count++;
    row.tiers[receipt.tier]++;
    const spent = receipt.money ? -receipt.money.change : 0;
    cat.spent += spent;
    // (Crime, gambling, lawsuits and loans bring money in by design; the leisure activities never do.)
    const isRisk = (RISK_CATEGORIES as readonly string[]).includes(def.category);
    if (!isRisk) r.spent += Math.max(0, spent);
    if (!isRisk && receipt.money && (receipt.money.change > 0 || receipt.money.debtChange < 0)) r.moneyCreated++;
    if (isRisk) {
      this.risk.played(before, after, plan, receipt);
      if (def.mechanic === 'lawsuit' && evidenceCount(before, def, plan.companionId, content) === 0) r.risk.lawsuits.withoutEvidence++;
      if (def.legalAge === 'drinking') this.fakeId(before, after, def);
    }
    if (!isRisk && def.legalAge === 'drinking') this.fakeId(before, after, def);
    this.a1(before, after, def, receipt, spent);
    const bucket = r.byRepeat[Math.min(repeats, 4)]!;
    bucket.outings++;
    bucket.benefit += benefit(receipt.changes);
    if (receipt.tier === 'great' || receipt.tier === 'good') bucket.goodShare++;

    const age = before.character.age;
    if (age < before.character.age - 0 || (age < content.balance.relationships.adultAge && ['surgery', 'nightlife', 'luxury', 'love'].includes(def.category))) r.minorBreaches++;

    const newCondition = (id: string) => conditionIds(after).has(id) && !conditionIds(before).has(id);
    if (def.category === 'surgery') {
      r.surgery.done++;
      this.surgery = true;
      const q = r.surgery.byQuality[plan.quality ?? 'standard'];
      q.done++;
      if (newCondition('surgical_complication')) {
        r.surgery.complications++;
        q.complications++;
      }
      if (after.flags.surgery_regret === true && before.flags.surgery_regret !== true) r.surgery.regrets++;
    }
    if (def.category === 'nightlife') {
      const n = r.nightlife;
      n.outings++;
      if (pendingIds.includes('nightlife_met_someone')) n.meetings++;
      if (pendingIds.includes('nightlife_hookup')) n.hookups++;
      if (pendingIds.includes('nightlife_temptation')) n.temptations++;
      if (pendingIds.some((id) => content.registries.possessions.accidents.drunk.events.includes(id))) n.drunkDrives++;
      if (after.flags.nightlife_fight === true && before.flags.nightlife_fight !== true) n.fights++;
      if (after.legal.record.length > before.legal.record.length) n.charges++;
      if (newCondition('alcohol_addiction')) {
        n.addictions++;
        this.addiction = true;
      }
      if (castPeople.some((p) => before.currentYear - p.birthYear < content.balance.relationships.adultAge)) n.adultsOnlyBreaches++;
    }
    if (def.category === 'love') {
      r.love.outings++;
      if (pendingIds.some((id) => ['speed_dating_match', 'matchmaker_intro', 'app_match'].includes(id) || id.startsWith('find_date_'))) r.love.matches++;
      const partners = (l: LifeState) => Object.values(l.relationships).filter((x) => x.kind === 'partner').length;
      if (partners(after) > partners(before)) r.love.partnered++;
    }
    if (def.category === 'luxury') {
      r.valuables.bought++;
      r.valuables.spent += Math.max(0, spent);
    }
    return after;
  }

  /** A1: the Activities tab's own measures. */
  private a1(before: LifeState, after: LifeState, def: (typeof this.content.pastimes)[string], receipt: PastimeReceipt, spent: number): void {
    const a = this.r.a1;
    const hubId = def.hub;
    if (hubId !== undefined) {
      const row = (a.byHub[hubId] ??= { count: 0, tiers: emptyTiers(), spent: 0, won: 0, lives: 0 });
      row.count++;
      row.tiers[receipt.tier]++;
      row.spent += Math.max(0, spent);
      if (def.mechanic === 'gamble' && receipt.money && receipt.money.change > 0) row.won += receipt.money.change;
      this.hubs.add(hubId);
      const hub = this.content.registries.activities.activities.find((h) => h.id === hubId);
      if (hub?.adultsOnly && before.character.age < this.content.balance.relationships.adultAge) a.adultsOnlyBreaches++;
    }
    for (const [k, v] of Object.entries(receipt.changes)) a.statSums[k] = (a.statSums[k] ?? 0) + v;
    if (def.look !== undefined && before.character.look && after.character.look && JSON.stringify(before.character.look) !== JSON.stringify(after.character.look)) {
      a.looks[def.look] = (a.looks[def.look] ?? 0) + 1;
    }
    if (def.hobby) {
      a.hobbies.practices++;
      this.hobby = true;
      if (after.flags[`skilled_${def.id}`] === true) this.skilled = true;
      a.hobbies.bestSkill = Math.max(a.hobbies.bestSkill, after.hobbies[def.id]?.skill ?? 0);
      if (after.character.hidden.talentDiscovered && !before.character.hidden.talentDiscovered) a.hobbies.talentsFound++;
    }
    const has = (l: LifeState, id: string) => l.health.conditions.some((c) => c.conditionId === id);
    if (has(after, 'gambling_addiction') && !has(before, 'gambling_addiction')) this.gambling = true;
    if (has(after, 'alcohol_addiction') && !has(before, 'alcohol_addiction')) this.alcohol = true;
  }

  /** A nightlife outing with a fake ID: used to get in, and perhaps caught. */
  private fakeId(before: LifeState, after: LifeState, def: (typeof this.content.pastimes)[string]): void {
    if (!fakeIdUsable(before, def, this.content)) return;
    this.r.risk.market.fakeIdUses++;
    if (before.flags.fake_id === true && after.flags.fake_id !== true) this.r.risk.market.fakeIdCaught++;
  }

  /** A year has passed: valuables kept, stolen, and the receipts the engine kept. */
  observe(before: LifeState, after: LifeState): void {
    const r = this.r;
    r.years++;
    this.risk.observeYear(before, after);
    // A1: a spammer's year: how far did the four stats move, and did one reach the top?
    if (r.players === 'spammer' && before.pastimes.year === before.currentYear) {
      for (const key of ['health', 'smarts', 'looks', 'fitness'] as const) {
        const gain = after.character.stats[key] - before.character.stats[key];
        r.a1.spam.maxGain = Math.max(r.a1.spam.maxGain, gain);
        if (after.character.stats[key] >= 100 && before.character.stats[key] <= 60) r.a1.spam.maxed++;
      }
      r.a1.spam.years++;
    }
    const items = valuablesOf(after);
    if (items.length > 0) this.owned = true;
    r.valuables.valuableYears += items.length;
    const stolenEvents = this.content.registries.possessions.valuableStolen.events;
    for (const p of after.pending) if (stolenEvents.includes(p.eventId)) r.valuables.thefts++;
    for (const p of valuablesOf(before)) if (!after.possessions.items.some((q) => q.id === p.id)) r.valuables.stolen++;
  }

  finish(life: LifeState): void {
    const r = this.r;
    r.lives++;
    r.income += life.finances.earnings.total;
    if (this.any) r.livesWith++;
    for (const c of this.categories) r.byCategory[c].lives++;
    if (this.surgery) r.surgery.lives++;
    if (this.addiction) r.nightlife.livesWithAddiction++;
    if (this.owned) r.valuables.lives++;
    for (const id of this.hubs) {
      const row = (r.a1.byHub[id] ??= { count: 0, tiers: emptyTiers(), spent: 0, won: 0, lives: 0 });
      row.lives++;
    }
    if (this.hobby) r.a1.hobbies.lives++;
    if (this.skilled) r.a1.hobbies.skilledLives++;
    if (this.gambling) r.a1.addictions.gamblingLives++;
    if (this.alcohol) r.a1.addictions.alcoholLives++;
    this.risk.finish(life);
  }
}

// ─────────────────────────────── Printing ───────────────────────────────

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 2) => (d === 0 ? 'n/a' : (n / d).toFixed(digits));
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function formatPastimes(r: PastimesReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'Activities (Batch 2a):'];
  lines.push(`  ${r.lives} lives, ${r.years} years; ${r.activities} activities (${per(r.activities, r.lives)} per life; ${pct(r.livesWith, r.lives)} of lives did at least one); tiers ${OUTCOME_TIERS.map((t) => `${t} ${pct(r.tiers[t], r.activities)}`).join(', ')}`);
  lines.push(`  spent ${dollars(r.spent)} in all (${dollars(r.spent / Math.max(1, r.lives))} a life, ${pct(r.spent, r.income)} of lifetime earnings); receipts that showed money coming in: ${r.moneyCreated} (must be 0); under-18s in adults-only activities: ${r.minorBreaches} (must be 0)`);
  for (const category of PASTIME_CATEGORIES) {
    const c = r.byCategory[category];
    lines.push(`    ${category.padEnd(10)} ${per(c.count, r.lives).padStart(6)} per life  ${pct(c.lives, r.lives).padStart(6)} of lives  ${dollars(c.spent / Math.max(1, r.lives)).padStart(8)} a life`);
  }
  const s = r.surgery;
  lines.push(
    `  surgery: ${s.done} procedures in ${s.lives} lives; complications ${s.complications} (${pct(s.complications, s.done)}); by surgeon ${PASTIME_QUALITIES.map((q) => `${q} ${s.byQuality[q].complications}/${s.byQuality[q].done} (${pct(s.byQuality[q].complications, s.byQuality[q].done)})`).join(', ')}; regrets ${s.regrets}`,
  );
  const n = r.nightlife;
  lines.push(
    `  nightlife: ${n.outings} outings; meetings ${n.meetings} (${pct(n.meetings, n.outings)}), hookups ${n.hookups}, temptations ${n.temptations}; fights ${n.fights}, charges ${n.charges}, drunk drives ${n.drunkDrives}; addictions started ${n.addictions} (${pct(n.addictions, n.outings)} of outings, ${n.livesWithAddiction} lives); anyone under 18 cast: ${n.adultsOnlyBreaches} (must be 0)`,
  );
  lines.push(`  love: ${r.love.outings} outings; ${r.love.matches} matches opened (${pct(r.love.matches, r.love.outings)}); ${r.love.partnered} became couples`);
  const v = r.valuables;
  lines.push(`  valuables: ${v.bought} bought for ${dollars(v.spent)} in ${v.lives} lives (${pct(v.lives, r.lives)}); ${v.thefts} stolen in ${v.valuableYears} valuable-years (${per(100 * v.thefts, v.valuableYears)} per 100)`);
  const rows = r.byRepeat.map((b, i) => `${i === 4 ? '4+' : i}: ${per(b.benefit, b.outings, 2)} (${pct(b.goodShare, b.outings)} good)`);
  lines.push(`  benefit per outing by earlier times the same activity this year: ${rows.join(' · ')}`);
  lines.push(...formatA1(r, content));
  return lines;
}

/** A1: the Activities tab's report. */
function formatA1(r: PastimesReport, content: ContentBundle): string[] {
  const a = r.a1;
  const lines: string[] = ['', 'Activities tab (A1):'];
  const hubs = content.registries.activities.activities.map((h) => h.id).filter((id) => a.byHub[id]);
  if (hubs.length === 0) return [...lines, '  (no activity of the tab was used)'];
  lines.push('  usage by activity (per life; share of lives; tiers great/good/neutral/bad/backfire; spent a life; won a life):');
  for (const id of hubs) {
    const h = a.byHub[id]!;
    lines.push(`    ${id.padEnd(10)} ${per(h.count, r.lives).padStart(6)}  ${pct(h.lives, r.lives).padStart(6)}  ${OUTCOME_TIERS.map((t) => pct(h.tiers[t], h.count)).join('/')}  ${dollars(h.spent / Math.max(1, r.lives)).padStart(8)}  ${dollars(h.won / Math.max(1, r.lives)).padStart(8)}`);
  }
  const outings = hubs.reduce((sum, id) => sum + a.byHub[id]!.count, 0);
  lines.push(`  stat effects per outing of the tab: ${Object.entries(a.statSums).map(([k, v]) => `${k} ${per(v, outings, 2)}`).join(', ')}`);
  lines.push(`  portrait changes: ${Object.entries(a.looks).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  const h = a.hobbies;
  lines.push(`  hobbies: ${h.lives} lives took one up (${pct(h.lives, r.lives)}), ${h.practices} practices; ${h.skilledLives} got skilled (${pct(h.skilledLives, h.lives)} of hobbyists); best skill ${h.bestSkill}; hidden talents brought to light by practice ${h.talentsFound}`);
  lines.push(`  addictions started by the tab's activities: gambling ${a.addictions.gamblingLives} lives (${pct(a.addictions.gamblingLives, r.lives)}), drink ${a.addictions.alcoholLives} lives (${pct(a.addictions.alcoholLives, r.lives)}); under-18s in adults-only activities: ${a.adultsOnlyBreaches} (must be 0)`);
  if (a.spam.years > 0) lines.push(`  spammer: ${a.spam.years} years; the biggest one-year gain in a stat ${a.spam.maxGain}; years a stat went from 60 or less to 100: ${a.spam.maxed} (must be 0)`);
  return lines;
}

/** A1's targets: nobody under 18 in an adults-only activity, no stat maxed in a year by spamming, no invariant failures. */
export function a1Targets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const a = report.pastimes.a1;
  const t = content.balance.targets.activities;
  const zero = (label: string, n: number): TargetResult => ({ label, value: String(n), short: String(n), goal: '0', met: n === 0 });
  const out: TargetResult[] = [zero('under-18s in the adults-only activities of the tab', a.adultsOnlyBreaches), zero('invariant failures in the activity checks', report.pastimes.invariantFailures), zero('receipts that showed money coming in', report.pastimes.moneyCreated)];
  if (a.spam.years > 0) {
    out.push(zero('spammer: years a stat went from 60 or less to 100', a.spam.maxed));
    out.push({ label: 'spammer: biggest gain in a stat in one year', value: String(a.spam.maxGain), short: String(a.spam.maxGain), goal: `at most ${t.spamMaxYearGain}`, met: a.spam.maxGain <= t.spamMaxYearGain });
  }
  return out;
}

/** The activity targets (balance/targets.yaml, pastimes), judged on the careful player's lives. */
export function pastimesTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.pastimes;
  const r = report.pastimes;
  const out: TargetResult[] = [];
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    const text = `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`;
    out.push({ label, value: fmt(value), short: fmt(value), goal: text, met });
  };
  range('activities per life', share(r.activities, r.lives), t.perLife, (n) => n.toFixed(1));
  range('lives that did at least one activity', share(r.livesWith, r.lives), t.livesWith);
  range('share of lifetime earnings spent on activities', share(r.spent, r.income), t.spendShare);
  range('surgeries that had a complication', share(r.surgery.complications, r.surgery.done), t.complicationRate);
  const budget = share(r.surgery.byQuality.budget.complications, r.surgery.byQuality.budget.done);
  const premier = share(r.surgery.byQuality.premier.complications, r.surgery.byQuality.premier.done);
  const enough = r.surgery.byQuality.budget.done >= 10 && r.surgery.byQuality.premier.done >= 10;
  out.push({ label: 'a cheap surgeon goes wrong more often than a top one', value: enough ? `${budget.toFixed(3)} vs ${premier.toFixed(3)}` : 'too few', short: enough ? 'yes' : 'n/a', goal: 'budget above premier', met: !enough || budget > premier });
  range('nightlife outings that start an addiction', share(r.nightlife.addictions, r.nightlife.outings), t.nightlifeAddiction);
  range('nightlife outings that meet someone', share(r.nightlife.meetings, r.nightlife.outings), t.nightlifeMeetings);
  range('lives that ever owned a valuable', share(r.valuables.lives, r.lives), t.valuableLives);
  range('valuables stolen per 100 valuable-years', share(100 * r.valuables.thefts, r.valuables.valuableYears), t.theftPer100Years, (n) => n.toFixed(2));
  out.push({ label: 'receipts that showed money coming in', value: String(r.moneyCreated), short: String(r.moneyCreated), goal: '0', met: r.moneyCreated === 0 });
  out.push({ label: 'under-18s in adults-only activities, or cast in a nightlife follow-up', value: String(r.minorBreaches + r.nightlife.adultsOnlyBreaches), short: String(r.minorBreaches + r.nightlife.adultsOnlyBreaches), goal: '0', met: r.minorBreaches + r.nightlife.adultsOnlyBreaches === 0 });
  out.push({ label: 'invariant failures in the activity checks', value: String(r.invariantFailures), short: String(r.invariantFailures), goal: '0', met: r.invariantFailures === 0 });
  return out;
}

/** The spammer's targets: doing the same thing again and again gives less each time. */
export function pastimesSpamTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.pastimes;
  const rows = report.pastimes.byRepeat;
  const first = rows[0]!;
  const later = rows[3]!;
  const firstBenefit = first.outings > 0 ? first.benefit / first.outings : 0;
  const laterBenefit = later.outings > 0 ? later.benefit / later.outings : 0;
  const ratio = firstBenefit > 0 ? laterBenefit / firstBenefit : 0;
  return [
    { label: 'benefit of the fourth time a year against the first', value: ratio.toFixed(2), short: ratio.toFixed(2), goal: `at most ${t.spamRatio.toFixed(2)}`, met: first.outings === 0 || later.outings === 0 || ratio <= t.spamRatio },
    { label: 'receipts that showed money coming in', value: String(report.pastimes.moneyCreated), short: String(report.pastimes.moneyCreated), goal: '0', met: report.pastimes.moneyCreated === 0 },
  ];
}
