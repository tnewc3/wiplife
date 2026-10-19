/**
 * Risk and legal activities, simulated and measured (Batch 2b): crime, the
 * black market, gambling, lawsuits, a legal name change and loans. How each
 * simulated player uses them, and what comes of it. Like the other player
 * models the chances here describe the simulated player, not the game.
 *
 * - careful: never crime or the black market (nor a payday lender or a loan
 *   shark). Now and then a small bet, a lawsuit when it has the evidence and
 *   the savings, a bank loan when money is short, the partner's name after a
 *   wedding.
 * - criminal: lives as the careful player does, and also commits crimes, deals
 *   on the black market, bets harder (and chases losses), takes payday and
 *   shark loans when short.
 * - careless: any activity at random, with random choices, typed names that are
 *   sometimes not valid.
 *
 * Nothing here touches the engine: the watcher compares the life before and
 * after each activity, and each year for the loans.
 */
import { RISK_CATEGORIES, PASTIME_QUALITIES, PASTIME_ROUTES, PASTIME_STAKES, type ContentBundle, type PastimeDef } from '../../src/content/schemas';
import { companionOptions, pastimeBlock, pastimePrice, allPastimes, type PastimeChoice } from '../../src/engine/pastimes/query';
import { consentOptions, houseEdge, incomeOf } from '../../src/engine/pastimes/risk';
import { totalDebt } from '../../src/engine/finance';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState, PastimeReceipt } from '../../src/engine/types';
import type { PastimePlan, PastimePlayer } from './pastimes';
import type { SimulationReport, TargetResult } from './run';

const NAMES = ['Avery', 'Rowan', 'Quinn', 'Sage', 'Jordan', 'Morgan', 'Casey', 'Reese', 'Ellis', 'Noor', 'Mateo', 'Ines'];
const SURNAMES = ['Hale', 'Brightwater', 'Okafor', 'Lindqvist', 'Marlowe', 'Duarte', 'Kessler', 'Vance'];
/** Typed names a careless player might type: some are not valid, and must be refused. */
const BAD_NAMES = ['', '  ', '12345', 'x'.repeat(60), '<b>Zed</b>', 'Anna{name}', '-Nobody'];

/** Chances describing the simulated player (not the game). */
export const RISK_POLICY = {
  careful: { gamble: 0.05, lawsuit: 0.5, partnerName: 0.3, nameChange: 0.004, loanWhenShort: 0.25, shortBelow: 800 },
  criminal: { teenPetty: 0.3, crime: 0.6, market: 0.3, fakeId: 0.15, gamble: 0.3, chase: 0.5, payday: 0.4, shark: 0.25, lawsuit: 0.5 },
  carelessMax: 4,
};

function consentOptionsOf(life: LifeState, content: ContentBundle): Record<string, string> {
  return Object.fromEntries(consentOptions(life, content).map((c) => [c.id, c.name]));
}

function planOf(def: PastimeDef, choice: PastimeChoice): PastimePlan {
  return { pastimeId: def.id, ...Object.fromEntries(Object.entries(choice).filter(([, v]) => v !== undefined)) } as PastimePlan;
}

/** Everything the lawsuit, gambling and name activities need chosen, picked at random (the careless player) or sensibly (the others). */
function choiceFor(life: LifeState, def: PastimeDef, content: ContentBundle, rng: RngState, mode: 'sensible' | 'bold' | 'random'): PastimeChoice | null {
  const choice: PastimeChoice = {};
  if (def.quality) choice.quality = mode === 'random' ? pick(rng, [...PASTIME_QUALITIES]) : life.finances.savings > 30_000 ? 'premier' : 'standard';
  const companions = companionOptions(life, def, content);
  if (def.companion === 'required') {
    if (companions.length === 0) return null;
    choice.companionId = companions[0]!.id;
  }
  if (def.mechanic === 'gamble') choice.stake = mode === 'random' ? pick(rng, [...PASTIME_STAKES]) : mode === 'bold' ? (chance(rng, 0.5) ? 'high' : 'medium') : chance(rng, 0.8) ? 'low' : 'medium';
  if (def.mechanic === 'lawsuit') choice.route = mode === 'random' ? pick(rng, [...PASTIME_ROUTES]) : chance(rng, 0.65) ? 'settle' : 'trial';
  if (def.mechanic === 'name') {
    if (def.nameChange === 'first' || def.nameChange === 'both') choice.first = mode === 'random' && chance(rng, 0.25) ? pick(rng, BAD_NAMES) : pick(rng, NAMES);
    if (def.nameChange === 'last' || def.nameChange === 'both') choice.last = mode === 'random' && chance(rng, 0.25) ? pick(rng, BAD_NAMES) : pick(rng, SURNAMES);
    // A minor needs a parent who agrees.
    if (life.character.age < content.balance.relationships.adultAge) {
      const parent = Object.keys(consentOptionsOf(life, content))[0];
      if (parent) choice.consentId = parent;
    }
  }
  return choice;
}

/** Chasing a loss, when there is one to chase. */
function maybeChase(life: LifeState, def: PastimeDef, choice: PastimeChoice, content: ContentBundle, rng: RngState, p: number): void {
  if (def.mechanic !== 'gamble' || !chance(rng, p)) return;
  const chasing = { ...choice, chase: true as const };
  if (pastimeBlock(life, def, chasing, content) === null) choice.chase = true;
}

const ready = (life: LifeState, def: PastimeDef, choice: PastimeChoice, content: ContentBundle): boolean => pastimeBlock(life, def, choice, content) === null;

/** The risk and legal activities the simulated player does this year (drawing from `rng`). */
export function chooseRiskPlans(life: LifeState, content: ContentBundle, rng: RngState, player: PastimePlayer): PastimePlan[] {
  if (life.phase !== 'yearStart' || player === 'spammer') return [];
  const age = life.character.age;
  const adult = age >= content.balance.relationships.adultAge;
  const defs = allPastimes(content).filter((d) => (RISK_CATEGORIES as readonly string[]).includes(d.category));
  const byCategory = (c: string) => defs.filter((d) => d.category === c);
  const plans: PastimePlan[] = [];
  const add = (def: PastimeDef | undefined, mode: 'sensible' | 'bold' | 'random', chaseP = 0): void => {
    if (!def) return;
    const choice = choiceFor(life, def, content, rng, mode);
    if (!choice) return;
    maybeChase(life, def, choice, content, rng, chaseP);
    if (ready(life, def, choice, content)) plans.push(planOf(def, choice));
  };

  if (player === 'careless') {
    const n = (chance(rng, 0.5) ? 1 : 0) + (chance(rng, 0.25) ? 1 : 0) + (chance(rng, 0.1) ? 2 : 0);
    for (let i = 0; i < Math.min(RISK_POLICY.carelessMax, n); i++) add(pick(rng, defs), 'random', 0.5);
    return plans;
  }

  const savings = life.finances.savings;
  if (player === 'criminal') {
    const p = RISK_POLICY.criminal;
    const crimes = byCategory('crime');
    if (!adult && chance(rng, p.teenPetty)) add(pick(rng, crimes.filter((d) => d.minAge < content.balance.relationships.adultAge)), 'bold');
    if (adult && chance(rng, p.crime)) {
      add(pick(rng, crimes), 'bold');
      if (chance(rng, 0.25)) add(pick(rng, crimes), 'bold');
    }
    const market = byCategory('black_market');
    if (age >= 16 && age < 18 && chance(rng, p.fakeId)) add(content.pastimes.buy_a_fake_id, 'bold');
    if (adult && chance(rng, p.market)) add(pick(rng, market), 'bold');
    if (adult && chance(rng, p.gamble)) add(pick(rng, byCategory('gambling')), 'bold', p.chase);
    if (adult && savings < 500 && chance(rng, p.payday)) add(content.pastimes.take_a_payday_loan, 'bold');
    if (adult && totalDebt(life) > 0 && chance(rng, p.shark)) add(pick(rng, [content.pastimes.borrow_from_a_loan_shark!, content.pastimes.borrow_a_lot_from_a_loan_shark!]), 'bold');
  }

  // The careful player's share (the criminal player lives this way too).
  const c = RISK_POLICY.careful;
  if (adult && savings > 3000 && chance(rng, c.gamble)) add(pick(rng, [content.pastimes.buy_a_lottery_ticket!, content.pastimes.buy_a_lottery_ticket!, content.pastimes.play_the_slots!, content.pastimes.play_blackjack!]), 'sensible');
  if (adult && savings > 5000 && chance(rng, c.lawsuit)) {
    const suits = byCategory('lawsuits').filter((d) => pastimeBlock(life, d, { quality: 'standard', route: 'settle', ...(d.companion === 'required' ? { companionId: companionOptions(life, d, content)[0]?.id } : {}) }, content) === null);
    if (suits.length > 0) add(pick(rng, suits), 'sensible');
  }
  if (adult && chance(rng, c.partnerName)) add(content.pastimes.take_your_partners_name, 'sensible');
  if (adult && chance(rng, c.nameChange)) add(pick(rng, [content.pastimes.change_your_first_name!, content.pastimes.change_your_last_name!, content.pastimes.choose_a_new_name!]), 'sensible');
  if (adult && chance(rng, c.nameChange)) add(content.pastimes.return_to_a_former_name, 'sensible');
  if (adult && savings < c.shortBelow && incomeOf(life) > 0 && chance(rng, c.loanWhenShort)) add(pick(rng, [content.pastimes.take_a_bank_loan!, content.pastimes.borrow_from_a_credit_union!]), 'sensible');
  return plans;
}

/** After a gambling session that lost: the bold player may bet it back at once (chasing the loss), up to a few times a night. */
export function riskFollowUp(life: LifeState, plan: PastimePlan, content: ContentBundle, rng: RngState, player: PastimePlayer): PastimePlan | null {
  const def = content.pastimes[plan.pastimeId];
  if (!def || def.mechanic !== 'gamble' || life.phase !== 'yearStart') return null;
  const p = player === 'criminal' ? RISK_POLICY.criminal.chase : player === 'careless' ? 0.3 : 0;
  if (!chance(rng, p)) return null;
  const choice: PastimeChoice = { stake: plan.stake ?? 'medium', chase: true };
  return ready(life, def, choice, content) ? planOf(def, choice) : null;
}

// ─────────────────────────────── The report ───────────────────────────────

type Tiers = Record<'great' | 'good' | 'neutral' | 'bad' | 'backfire', number>;
const emptyTiers = (): Tiers => ({ great: 0, good: 0, neutral: 0, bad: 0, backfire: 0 });
const OUTCOMES = ['warning', 'fine', 'probation', 'jail'] as const;

export interface RiskReport {
  crime: {
    attempts: number;
    byActivity: Record<string, { n: number; tiers: Tiers }>;
    cash: number;
    dirty: number;
    charged: number;
    byOutcome: Record<(typeof OUTCOMES)[number], number>;
    teenAttempts: number;
    teenCharged: number;
    teenSealed: number;
    sentToPrison: number;
    crewFreelance: number;
    livesWith: number;
    /** Under 18 in a crime the content calls serious (must be 0). */
    minorBreaches: number;
  };
  market: {
    attempts: number;
    byActivity: Record<string, { n: number; tiers: Tiers }>;
    spent: number;
    resale: number;
    dirty: number;
    charged: number;
    fakeIds: number;
    fakeIdUses: number;
    fakeIdCaught: number;
    addictions: number;
    livesWith: number;
    minorBreaches: number;
  };
  gambling: {
    sessions: number;
    staked: number;
    paid: number;
    byGame: Record<string, { sessions: number; staked: number; paid: number }>;
    chases: number;
    borrowed: number;
    addictions: number;
    livesWith: number;
    livesWithAddiction: number;
    underage: number;
  };
  lawsuits: {
    filed: number;
    byActivity: Record<string, number>;
    byRoute: Record<'settle' | 'trial', number>;
    won: number;
    settled: number;
    dismissed: number;
    lost: number;
    fees: number;
    awarded: number;
    costs: number;
    withoutEvidence: number;
    livesWith: number;
  };
  identity: { changes: number; byKind: Record<string, number>; withConsent: number; refused: number; underageWithoutConsent: number };
  loans: {
    taken: number;
    byKind: Record<string, { n: number; principal: number; fees: number; livesWith: number }>;
    /** Per debt kind: interest the ledger added, and the balance-years it was charged on. */
    interest: Record<string, { charged: number; balanceYears: number; rate: number }>;
    missed: number;
    sharkVisits: number;
    outstandingAtEnd: number;
    livesWith: number;
    livesWithSharkDebt: number;
  };
  invariantFailures: number;
}

export function emptyRiskReport(): RiskReport {
  return {
    crime: { attempts: 0, byActivity: {}, cash: 0, dirty: 0, charged: 0, byOutcome: { warning: 0, fine: 0, probation: 0, jail: 0 }, teenAttempts: 0, teenCharged: 0, teenSealed: 0, sentToPrison: 0, crewFreelance: 0, livesWith: 0, minorBreaches: 0 },
    market: { attempts: 0, byActivity: {}, spent: 0, resale: 0, dirty: 0, charged: 0, fakeIds: 0, fakeIdUses: 0, fakeIdCaught: 0, addictions: 0, livesWith: 0, minorBreaches: 0 },
    gambling: { sessions: 0, staked: 0, paid: 0, byGame: {}, chases: 0, borrowed: 0, addictions: 0, livesWith: 0, livesWithAddiction: 0, underage: 0 },
    lawsuits: { filed: 0, byActivity: {}, byRoute: { settle: 0, trial: 0 }, won: 0, settled: 0, dismissed: 0, lost: 0, fees: 0, awarded: 0, costs: 0, withoutEvidence: 0, livesWith: 0 },
    identity: { changes: 0, byKind: {}, withConsent: 0, refused: 0, underageWithoutConsent: 0 },
    loans: { taken: 0, byKind: {}, interest: {}, missed: 0, sharkVisits: 0, outstandingAtEnd: 0, livesWith: 0, livesWithSharkDebt: 0 },
    invariantFailures: 0,
  };
}

const LOAN_KINDS = ['bank', 'payday', 'shark'] as const;

/** Watches one life's risk and legal activities. */
export class RiskWatcher {
  private flags = new Set<string>();
  private addiction = false;
  private shark = false;
  private loanKinds = new Set<string>();

  constructor(
    private readonly r: RiskReport,
    private readonly content: ContentBundle,
  ) {}

  /** An activity was refused by the engine (an invalid typed name, say). */
  refused(plan: PastimePlan): void {
    if (this.content.pastimes[plan.pastimeId]?.mechanic === 'name') this.r.identity.refused++;
  }

  /** One activity was done: `before` and `after` are the life around it (result events not yet played), `receipt` its receipt. */
  played(before: LifeState, after: LifeState, plan: PastimePlan, receipt: PastimeReceipt): void {
    const { content, r } = this;
    const def = content.pastimes[plan.pastimeId]!;
    const adultAge = content.balance.relationships.adultAge;
    const age = before.character.age;
    const records = after.legal.record.slice(before.legal.record.length);
    const newCondition = (id: string) => after.health.conditions.some((c) => c.conditionId === id) && !before.health.conditions.some((c) => c.conditionId === id);
    const money = receipt.money;
    const tierCount = (row: { tiers: Tiers }) => row.tiers[receipt.tier]++;
    switch (def.category) {
      case 'crime': {
        const c = r.crime;
        c.attempts++;
        this.flags.add('crime');
        const row = (c.byActivity[def.id] ??= { n: 0, tiers: emptyTiers() });
        row.n++;
        tierCount(row);
        c.cash += Math.max(0, money?.change ?? 0);
        c.dirty += Math.max(0, money?.dirty?.change ?? 0);
        c.charged += records.length;
        for (const e of records) c.byOutcome[e.outcome]++;
        if (age < adultAge) {
          c.teenAttempts++;
          c.teenCharged += records.length;
          if (def.minAge >= adultAge) c.minorBreaches++;
        }
        if (records.some((e) => e.outcome === 'jail')) c.sentToPrison++;
        if (before.crime.crew) c.crewFreelance++;
        break;
      }
      case 'black_market': {
        const m = r.market;
        this.flags.add('market');
        const row = (m.byActivity[def.id] ??= { n: 0, tiers: emptyTiers() });
        m.attempts++;
        row.n++;
        tierCount(row);
        m.spent += pastimePrice(before, def, plan, content);
        m.resale += Math.max(0, (money?.change ?? 0) + pastimePrice(before, def, plan, content));
        m.dirty += Math.max(0, money?.dirty?.change ?? 0);
        m.charged += records.length;
        if (def.id === 'buy_a_fake_id' && after.flags.fake_id === true) m.fakeIds++;
        if (age < adultAge && def.minAge >= adultAge) m.minorBreaches++;
        if (newCondition('drug_addiction')) {
          m.addictions++;
          this.addiction = true;
        }
        break;
      }
      case 'gambling': {
        const g = r.gambling;
        this.flags.add('gambling');
        g.sessions++;
        // The stake is what the engine charged; what came back is the net change plus the stake.
        const stake = pastimePrice(before, def, plan, content);
        const paid = (money?.change ?? 0) + stake;
        const row = (g.byGame[def.game!] ??= { sessions: 0, staked: 0, paid: 0 });
        row.sessions++;
        row.staked += stake;
        row.paid += paid;
        g.staked += stake;
        g.paid += paid;
        if (plan.chase) {
          g.chases++;
          g.borrowed += Math.max(0, money?.debtChange ?? 0);
        }
        if (age < content.balance.relationships.adultAge) g.underage++;
        if (newCondition('gambling_addiction')) {
          g.addictions++;
          this.addiction = true;
        }
        break;
      }
      case 'lawsuits': {
        const l = r.lawsuits;
        this.flags.add('lawsuit');
        l.filed++;
        l.byActivity[def.id] = (l.byActivity[def.id] ?? 0) + 1;
        l.byRoute[plan.route ?? 'trial']++;
        const route = plan.route ?? 'trial';
        if (receipt.tier === 'neutral') l.dismissed++;
        else if (receipt.tier === 'bad' || receipt.tier === 'backfire') l.lost++;
        else if (route === 'settle') l.settled++;
        else l.won++;
        const net = money?.change ?? 0;
        if (net > 0) l.awarded += net;
        else l.costs += -net;
        break;
      }
      case 'identity': {
        const i = r.identity;
        i.changes++;
        i.byKind[def.nameChange!] = (i.byKind[def.nameChange!] ?? 0) + 1;
        if (plan.consentId) i.withConsent++;
        if (age < adultAge && !plan.consentId) i.underageWithoutConsent++;
        break;
      }
      case 'loans': {
        const l = r.loans;
        const kind = content.balance.risk.loans[def.loan!]!.kind;
        const row = (l.byKind[kind] ??= { n: 0, principal: 0, fees: 0, livesWith: 0 });
        row.n++;
        l.taken++;
        const principal = money?.debtChange ?? 0;
        row.principal += principal;
        row.fees += Math.max(0, principal - (money?.change ?? 0));
        this.loanKinds.add(kind);
        if (kind === 'shark') this.shark = true;
        break;
      }
    }
  }

  /** A year has passed: interest the ledger charged on loans, missed payments, collectors. */
  observeYear(before: LifeState, after: LifeState): void {
    const { content, r } = this;
    for (const d of before.finances.debts) {
      if (!(LOAN_KINDS as readonly string[]).includes(d.kind)) continue;
      const row = (r.loans.interest[d.kind] ??= { charged: 0, balanceYears: 0, rate: d.annualRate });
      row.charged += Math.round(d.balance * d.annualRate);
      row.balanceYears += d.balance;
      row.rate = d.annualRate;
      this.loanKinds.add(d.kind);
      if (d.kind === 'shark') this.shark = true;
    }
    for (const d of after.finances.debts) if ((LOAN_KINDS as readonly string[]).includes(d.kind) && d.missed > 0) r.loans.missed++;
    void content;
  }

  /** The life is over: what is still owed, and what the life did. */
  finish(life: LifeState): void {
    const r = this.r;
    if (this.flags.has('crime')) r.crime.livesWith++;
    if (this.flags.has('market')) r.market.livesWith++;
    if (this.flags.has('gambling')) r.gambling.livesWith++;
    if (this.flags.has('lawsuit')) r.lawsuits.livesWith++;
    if (this.addiction) r.gambling.livesWithAddiction++;
    if (this.shark) r.loans.livesWithSharkDebt++;
    for (const k of this.loanKinds) {
      const row = (r.loans.byKind[k] ??= { n: 0, principal: 0, fees: 0, livesWith: 0 });
      row.livesWith++;
    }
    if (this.loanKinds.size > 0) r.loans.livesWith++;
    r.loans.outstandingAtEnd += life.finances.debts.filter((d) => (LOAN_KINDS as readonly string[]).includes(d.kind)).reduce((s, d) => s + d.balance, 0);
    r.crime.teenSealed += life.legal.record.filter((e) => e.sealed).length;
  }
}

// ─────────────────────────────── Printing ───────────────────────────────

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 2) => (d === 0 ? 'n/a' : (n / d).toFixed(digits));
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function formatRisk(r: RiskReport, lives: number, events: { id: string; fired: number }[], content: ContentBundle): string[] {
  const fired = (prefix: string) => events.filter((e) => e.id.startsWith(prefix)).reduce((s, e) => s + e.fired, 0);
  const lines: string[] = ['', 'Risk and legal activities (Batch 2b):'];
  const c = r.crime;
  lines.push(
    `  crime: ${c.attempts} attempts in ${c.livesWith} lives (${pct(c.livesWith, lives)}); loot ${dollars(c.cash)} cash and ${dollars(c.dirty)} dirty; ${c.charged} charges (${pct(c.charged, c.attempts)} of attempts: ${OUTCOMES.map((o) => `${o} ${c.byOutcome[o]}`).join(', ')}); ${c.sentToPrison} sentenced to prison; teens ${c.teenAttempts} attempts, ${c.teenCharged} juvenile charges; crew members working alone ${c.crewFreelance}; under 18 in a serious crime: ${c.minorBreaches} (must be 0)`,
  );
  for (const [id, row] of Object.entries(c.byActivity).sort()) lines.push(`    ${id.padEnd(16)} ${String(row.n).padStart(6)}  caught ${pct(row.tiers.bad + row.tiers.backfire, row.n).padStart(6)}  paid ${pct(row.tiers.great + row.tiers.good, row.n).padStart(6)}`);
  const m = r.market;
  lines.push(
    `  black market: ${m.attempts} deals in ${m.livesWith} lives; resale ${dollars(m.resale)}, dirty ${dollars(m.dirty)}; ${m.charged} charges; fake IDs ${m.fakeIds} (used to get in ${m.fakeIdUses}, caught ${m.fakeIdCaught}); drug addictions started ${m.addictions}; under 18 in an adults-only deal: ${m.minorBreaches} (must be 0)`,
  );
  for (const [id, row] of Object.entries(m.byActivity).sort()) lines.push(`    ${id.padEnd(24)} ${String(row.n).padStart(6)}  caught ${pct(row.tiers.bad + row.tiers.backfire, row.n).padStart(6)}  paid ${pct(row.tiers.great + row.tiers.good, row.n).padStart(6)}`);
  const g = r.gambling;
  lines.push(
    `  gambling: ${g.sessions} sessions in ${g.livesWith} lives (${pct(g.livesWith, lives)}); staked ${dollars(g.staked)}, paid back ${dollars(g.paid)} (return ${per(g.paid, g.staked, 3)}; the house keeps ${pct(g.staked - g.paid, g.staked)}); chases ${g.chases}, borrowed for them ${dollars(g.borrowed)}; gambling problems started ${g.addictions} (${g.livesWithAddiction} lives); under the gambling age: ${g.underage} (must be 0)`,
  );
  for (const [game, row] of Object.entries(g.byGame).sort()) {
    const edge = content.balance.risk.games[game] ? houseEdge(content.balance.risk.games[game]!) : NaN;
    lines.push(`    ${game.padEnd(10)} ${String(row.sessions).padStart(6)} sessions  return ${per(row.paid, row.staked, 3)} (expected ${(1 - edge).toFixed(3)})`);
  }
  const l = r.lawsuits;
  lines.push(
    `  lawsuits: ${l.filed} filed in ${l.livesWith} lives (${l.byRoute.settle} settle, ${l.byRoute.trial} trial); won ${l.won}, settled ${l.settled}, dismissed ${l.dismissed}, lost ${l.lost}; awarded ${dollars(l.awarded)}, costs ${dollars(l.costs)} beyond the lawyer; sued by others: ${fired('sued_')} events; no evidence: ${l.withoutEvidence} (must be 0)`,
  );
  const i = r.identity;
  lines.push(`  name changes: ${i.changes} (${Object.entries(i.byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); a parent agreed for ${i.withConsent}; refused as invalid ${i.refused}; under 18 with no parent's agreement: ${i.underageWithoutConsent} (must be 0)`);
  const ln = r.loans;
  lines.push(
    `  loans: ${ln.taken} taken in ${ln.livesWith} lives; ${LOAN_KINDS.map((k) => {
      const row = ln.byKind[k];
      return `${k} ${row?.n ?? 0}${row ? ` (${dollars(row.principal)} borrowed, ${dollars(row.fees)} in fees)` : ''}`;
    }).join(', ')}; missed payments ${ln.missed}; loan shark collectors came ${fired('shark_')} times; loans still owed at the end ${dollars(ln.outstandingAtEnd)}`,
  );
  for (const k of LOAN_KINDS) {
    const row = ln.interest[k];
    if (row) lines.push(`    ${k.padEnd(7)} interest ${dollars(row.charged)} on ${dollars(row.balanceYears)} of balance-years: ${(row.balanceYears > 0 ? (100 * row.charged) / row.balanceYears : 0).toFixed(1)}% (the rate is ${(100 * row.rate).toFixed(1)}%)`);
  }
  return lines;
}

/** The risk and legal targets (balance/targets.yaml, risk). */
export function riskTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.risk;
  const r = report.pastimes.risk;
  const out: TargetResult[] = [];
  const add = (label: string, value: string, goal: string, met: boolean) => out.push({ label, value, short: value, goal, met });
  const zero = (label: string, n: number) => add(label, String(n), '0', n === 0);
  const waiting = (label: string, goal: string) => add(label, 'too few', goal, true);

  if (report.player === 'careful') {
    zero('crime attempts by the careful player', r.crime.attempts);
    zero('black market deals by the careful player', r.market.attempts);
    zero('payday and loan shark loans by the careful player', (r.loans.byKind.payday?.n ?? 0) + (r.loans.byKind.shark?.n ?? 0));
  }
  if (report.player === 'criminal') {
    const lives = report.lives;
    const share = lives === 0 ? 0 : r.crime.livesWith / lives;
    add('lives of the criminal player that commit a crime', share.toFixed(3), `${t.criminalLives.min ?? ''}–${t.criminalLives.max ?? ''}`, (t.criminalLives.min === undefined || share >= t.criminalLives.min) && (t.criminalLives.max === undefined || share <= t.criminalLives.max));
    const charged = r.crime.attempts === 0 ? 0 : r.crime.charged / r.crime.attempts;
    add('crime attempts that end in a charge', charged.toFixed(3), `${t.chargeShare.min ?? ''}–${t.chargeShare.max ?? ''}`, r.crime.attempts === 0 || ((t.chargeShare.min === undefined || charged >= t.chargeShare.min) && (t.chargeShare.max === undefined || charged <= t.chargeShare.max)));
  }
  const g = r.gambling;
  if (g.staked >= t.gamblingReturn.minStaked) {
    const ret = g.paid / g.staked;
    add('gambling: what comes back for every dollar staked', ret.toFixed(3), `below ${t.gamblingReturn.max}`, ret < t.gamblingReturn.max);
  } else waiting('gambling: what comes back for every dollar staked', `below ${t.gamblingReturn.max}`);
  for (const [game, row] of Object.entries(g.byGame).sort()) {
    if (game === 'lottery') continue;
    const expected = 1 - houseEdge(content.balance.risk.games[game]!);
    if (row.staked < t.gameTolerance.minStaked) continue;
    const ret = row.paid / row.staked;
    add(`${game}: observed return against its table`, ret.toFixed(3), `${expected.toFixed(3)} ± ${t.gameTolerance.within}`, Math.abs(ret - expected) <= t.gameTolerance.within);
  }
  for (const kind of LOAN_KINDS) {
    const row = r.loans.interest[kind];
    if (!row || row.balanceYears < t.interestTolerance.minBalanceYears) continue;
    const observed = row.charged / row.balanceYears;
    add(`${kind} loans: interest charged per balance-year against the rate`, observed.toFixed(4), `${row.rate.toFixed(4)} ± ${t.interestTolerance.within}`, Math.abs(observed - row.rate) <= t.interestTolerance.within);
  }
  const l = r.lawsuits;
  if (l.filed >= t.lawsuitSuccess.minFiled) {
    const win = (l.won + l.settled) / l.filed;
    const { min, max } = t.lawsuitSuccess.range;
    add('lawsuits won or settled', win.toFixed(3), `${min ?? ''}–${max ?? ''}`, (min === undefined || win >= min) && (max === undefined || win <= max));
  } else waiting('lawsuits won or settled', 'a sample of lawsuits');
  const m = r.market;
  if (m.fakeIdUses >= t.fakeIdCaught.minUses) {
    const caught = m.fakeIdCaught / m.fakeIdUses;
    const { min, max } = t.fakeIdCaught.range;
    add('uses of a fake ID that are caught', caught.toFixed(3), `${min ?? ''}–${max ?? ''}`, (min === undefined || caught >= min) && (max === undefined || caught <= max));
  } else waiting('uses of a fake ID that are caught', 'a sample of uses');
  zero('under 18 in a serious crime or an adults-only deal', r.crime.minorBreaches + r.market.minorBreaches);
  zero('gambling under the gambling age', g.underage);
  zero('name changes under 18 with no parent agreeing', r.identity.underageWithoutConsent);
  zero('lawsuits filed with no evidence', l.withoutEvidence);
  return out;
}
