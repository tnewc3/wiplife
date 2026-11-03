/**
 * Drugs, simulated and measured (D1). The drugs player is a person who, as an adult, may start using (at a party or through a dealer),
 * buy from the sources open to them, use from a stash (sometimes heavily), quit and relapse, go to support groups and rehab, and some
 * deal (buying for resale and putting the takings through the crime system's fronts) or run a grow operation or a lab. The watcher
 * compares each year's state before and after `beginYear`, so nothing here touches the engine.
 *
 * Reported: use, addiction, overdose (scares, ER visits, deaths, and that none came from a first use or without a warning sign),
 * what buying came to by source (fair, taken for nothing, bad product, robbed, caught), recovery and relapse, dealing (customers,
 * income, units), production (output, raids), arrests and what the court gave, and that no one under 18 buys, deals or makes.
 */
import type { ContentBundle, DrugSource } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { chance, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { Id, LifeState } from '../../src/engine/types';
import { chooseCrimeActions } from './crime';
import type { SimulationReport, TargetResult } from './run';

type DrugAction = [LifeActionId, LifeActionParams];

/** The simulated person (chances describing the player, not the game). */
export interface DrugsProfile {
  /** The age they might start taking drugs (0 never). */
  startAge: number;
  /** How much they use when they have it (0–1 of a year's limit). */
  appetite: number;
  heavy: number;
  /** Chance each year of trying to quit when addicted, and of going to meetings or rehab. */
  quits: number;
  seeksHelp: number;
  /** Deals (from this age, 0 never), makes the product (0 never). */
  dealsAt: number;
  makesAt: number;
  hides: number;
  favorites: Id[];
}

export function rollDrugsProfile(rng: RngState, content: ContentBundle): DrugsProfile {
  const ids = Object.keys(content.drugs).sort();
  const hard = ids.filter((id) => content.drugs[id]!.severity >= 4);
  return {
    startAge: pick(rng, [0, 16, 18, 18, 21, 25, 30]),
    appetite: pick(rng, [0.05, 0.1, 0.15, 0.3, 0.6]),
    heavy: pick(rng, [0, 0.1, 0.3]),
    quits: pick(rng, [0.1, 0.25, 0.4]),
    seeksHelp: pick(rng, [0.15, 0.4, 0.7]),
    dealsAt: pick(rng, [0, 0, 0, 20, 25]),
    makesAt: pick(rng, [0, 0, 0, 0, 25, 32]),
    hides: pick(rng, [0, 0.4, 0.8]),
    favorites: [pick(rng, ids), pick(rng, ids), ...(chance(rng, 0.25) ? [pick(rng, hard)] : [])],
  };
}

const SOURCES: readonly DrugSource[] = ['dealer', 'contact', 'nightlife', 'market'];

export function chooseDrugActions(life: LifeState, content: ContentBundle, rng: RngState, p: DrugsProfile): DrugAction[] {
  const out: DrugAction[] = [];
  const age = life.character.age;
  const can = (id: LifeActionId, params: LifeActionParams) => isLifeActionAvailable(life, id, params, content);
  const push = (id: LifeActionId, params: LifeActionParams) => {
    if (can(id, params)) out.push([id, params]);
  };
  const B = content.balance.drugs;
  const adult = age >= B.ages.adult;
  // Dirty money goes through the fronts, like the criminal player.
  if (adult && life.finances.dirty > 0) out.push(...chooseCrimeActions(life, content, rng));

  if (adult && p.startAge !== 0 && age >= p.startAge) {
    if (life.drugs.dealers.length === 0 && chance(rng, 0.4)) push('meet_dealer', {});
    // Recovery first: quit what holds you.
    for (const [id, h] of Object.entries(life.drugs.habits)) {
      if (h.dependence >= B.threshold && h.quitYear === 0 && chance(rng, p.quits)) push('quit_drug', { drugId: id });
    }
  }
  if (adult && p.startAge !== 0 && age >= p.startAge) {
    // Buy for the year: favourites, from the cheapest open source that does not break the bank.
    for (const id of p.favorites) {
      const held = life.drugs.stock[id]?.units ?? 0;
      const quitting = (life.drugs.habits[id]?.quitYear ?? 0) > 0;
      if (held >= 3 || quitting || !chance(rng, p.appetite)) continue;
      const def = content.drugs[id]!;
      const open = SOURCES.filter((s) => def.sources.includes(s));
      const source = pick(rng, open);
      const units = pick(rng, [1, 3, 3, 10]);
      push('buy_drug', { drugId: id, drugSource: source, units });
    }
    // Use what you have.
    const uses = Math.round(nextInt(rng, 0, 100) / 100 * B.use.perYear * p.appetite);
    for (let i = 0; i < Math.min(uses, 8); i++) {
      const ids = Object.keys(life.drugs.stock);
      if (ids.length === 0) break;
      push('use_drug', { drugId: pick(rng, ids), dose: chance(rng, p.heavy) ? 'heavy' : 'light' });
    }
    for (const id of Object.keys(life.drugs.stock)) if (chance(rng, p.hides)) push('hide_stash', { drugId: id, on: true });
    // Help: meetings, a sponsor and rehab for those who are addicted.
    if (life.drugs.habits && Object.values(life.drugs.habits).some((h) => h.dependence >= B.threshold) && chance(rng, p.seeksHelp)) {
      push('do_activity', { pastimeId: pick(rng, B.recovery.activities) });
    }
  }
  // Dealing and making.
  if (adult && p.dealsAt !== 0 && age >= p.dealsAt) {
    const drug = p.favorites[0]!;
    if (!life.drugs.dealing) push('start_dealing', { drugId: drug });
    if (life.drugs.dealing) {
      const held = life.drugs.stock[life.drugs.dealing.drugId]?.units ?? 0;
      if (held < 40) push('buy_drug', { drugId: life.drugs.dealing.drugId, drugSource: pick(rng, SOURCES.filter((s) => content.drugs[life.drugs.dealing!.drugId]!.sources.includes(s))), units: 30, resale: true });
      if (chance(rng, 0.1)) push('set_deal_price', { dealPrice: pick(rng, ['low', 'fair', 'high'] as const) });
      if (chance(rng, 0.05)) push('stop_dealing', {});
    }
  }
  if (adult && p.makesAt !== 0 && age >= p.makesAt && life.drugs.ops.length === 0) {
    for (const t of Object.values(content.operations).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const drug = t.drugs.find((d) => can('start_operation', { defId: t.id, drugId: d }));
      if (drug && chance(rng, 0.3)) {
        push('start_operation', { defId: t.id, drugId: drug });
        break;
      }
    }
  }
  if (adult && life.drugs.ops.length > 0) {
    // What is made has to be sold: on at wholesale, or through dealing.
    for (const id of Object.keys(life.drugs.stock)) if ((life.drugs.stock[id]?.units ?? 0) >= 30 && chance(rng, 0.6)) push('sell_wholesale', { drugId: id });
  }
  return out;
}

export interface DrugsReport {
  player: string;
  lives: number;
  /** Lives that used any drug, that were addicted at some point, and that came to an overdose scare, an ER visit or a death. */
  tried: number;
  addicted: number;
  scared: number;
  visited: number;
  overdoseDeaths: number;
  deathAges: number[];
  /** Overdose events in a first use (never), and deaths with no warning sign (never). */
  firstUseOverdose: number;
  deathNoSign: number;
  /** Person-years in which someone under 18 held a stash, dealt or ran an operation (never). */
  minorTrade: number;
  uses: number;
  bought: number;
  spent: number;
  buys: Record<string, number>;
  bySource: Record<string, Record<string, number>>;
  recoveredLives: number;
  quits: number;
  relapseLives: number;
  relapses: number;
  rehabLives: number;
  dealingLives: number;
  dealingYears: number;
  sold: number;
  earned: number;
  dealingEarnedLives: number[];
  customersPeak: number;
  opLives: number;
  produced: number;
  raids: number;
  arrestLives: number;
  arrests: number;
  jailed: number;
  offenses: Record<string, number>;
  /** Drug-related events that fired. */
  hooked: number;
  peakDependence: number[];
}

export function emptyDrugsReport(player: string): DrugsReport {
  return {
    player,
    lives: 0,
    tried: 0,
    addicted: 0,
    scared: 0,
    visited: 0,
    overdoseDeaths: 0,
    deathAges: [],
    firstUseOverdose: 0,
    deathNoSign: 0,
    minorTrade: 0,
    uses: 0,
    bought: 0,
    spent: 0,
    buys: { fine: 0, ripoff: 0, bad: 0, robbed: 0, caught: 0 },
    bySource: Object.fromEntries(SOURCES.map((s) => [s, { fine: 0, ripoff: 0, bad: 0, robbed: 0, caught: 0 }])),
    recoveredLives: 0,
    quits: 0,
    relapseLives: 0,
    relapses: 0,
    rehabLives: 0,
    dealingLives: 0,
    dealingYears: 0,
    sold: 0,
    earned: 0,
    dealingEarnedLives: [],
    customersPeak: 0,
    opLives: 0,
    produced: 0,
    raids: 0,
    arrestLives: 0,
    arrests: 0,
    jailed: 0,
    offenses: {},
    hooked: 0,
    peakDependence: [],
  };
}

const DRUG_OFFENSES = (content: ContentBundle): string[] => {
  const l = content.balance.drugs.legal;
  return [...new Set([...l.possession, l.intent, l.dealing, l.trafficking, l.manufacturing, 'drug_possession', 'drug_dealing'])];
};

export class DrugsWatcher {
  private dealingYearsThis = 0;
  private lastSigns = 0;
  constructor(private readonly report: DrugsReport, private readonly content: ContentBundle) {}

  acted(actionId: LifeActionId, before: LifeState, after: LifeState): void {
    const r = this.report;
    if (actionId === 'buy_drug') {
      const last = after.drugs.last;
      if (last?.action === 'buy' && last.kind in r.buys) {
        r.buys[last.kind]!++;
        // The source is whichever the action asked for; the last result only names the kind, so read the stock change instead.
        void before;
      }
    }
  }

  /** Records the source of a buy (called by the player with the params it used). */
  bought(source: DrugSource, after: LifeState): void {
    const kind = after.drugs.last?.kind;
    const row = this.report.bySource[source];
    if (row && kind && kind in row) row[kind]!++;
  }

  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const age = after.character.age;
    const B = this.content.balance.drugs;
    const d = after.drugs;
    if (age < B.ages.adult && (Object.keys(d.stock).length > 0 || d.dealing !== null || d.ops.length > 0)) r.minorTrade++;
    if (d.dealing) {
      r.dealingYears++;
      this.dealingYearsThis++;
      r.customersPeak = Math.max(r.customersPeak, d.dealing.customers);
    }
    // A first use is never an overdose: a new warning sign that names a drug used only once so far.
    if (d.signs.count > this.lastSigns && d.signs.drug !== undefined && (d.habits[d.signs.drug]?.total ?? 0) <= 1) r.firstUseOverdose++;
    this.lastSigns = d.signs.count;
    void before;
  }

  finish(life: LifeState): void {
    const r = this.report;
    const d = life.drugs;
    r.lives++;
    const tried = Object.values(d.habits).some((h) => h.total > 0);
    if (tried) r.tried++;
    const peak = Object.values(d.habits).reduce((m, h) => Math.max(m, h.peak), 0);
    const addicted = peak >= this.content.balance.drugs.threshold;
    if (addicted) {
      r.addicted++;
      r.peakDependence.push(Math.round(peak));
    }
    if (d.totals.scares > 0) r.scared++;
    if (d.totals.visits > 0) r.visited++;
    if (d.totals.overdoseDeaths > 0) {
      r.overdoseDeaths++;
      r.deathAges.push(life.death?.age ?? life.character.age);
      if (d.signs.count === 0) r.deathNoSign++;
    }
    r.uses += d.totals.uses;
    r.bought += d.totals.bought;
    r.spent += d.totals.spent;
    r.quits += d.totals.quits;
    r.relapses += d.totals.relapses;
    if (d.totals.relapses > 0) r.relapseLives++;
    if (d.totals.recoveries > 0) r.recoveredLives++;
    r.hooked += d.totals.hooked;
    if (this.dealingYearsThis > 0) {
      r.dealingLives++;
      r.dealingEarnedLives.push(d.totals.earned);
    }
    r.sold += d.totals.sold;
    r.earned += d.totals.earned;
    if (d.totals.produced > 0 || d.ops.length > 0 || d.totals.raids > 0) r.opLives++;
    r.produced += d.totals.produced;
    r.raids += d.totals.raids;
    if (d.totals.arrests > 0) r.arrestLives++;
    r.arrests += d.totals.arrests;
    const ids = DRUG_OFFENSES(this.content);
    for (const rec of life.legal.record) {
      if (!ids.includes(rec.offenseId)) continue;
      r.offenses[rec.offenseId] = (r.offenses[rec.offenseId] ?? 0) + 1;
      if (rec.outcome === 'jail') r.jailed++;
    }
  }
}

export function formatDrugs(r: DrugsReport, content: ContentBundle): string[] {
  const share = (n: number, d: number) => (d === 0 ? '–' : `${((n / d) * 100).toFixed(1)}%`);
  const mean = (xs: number[]) => (xs.length === 0 ? '–' : (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(0));
  const median = (xs: number[]) => (xs.length === 0 ? '–' : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!.toFixed(0));
  const lines: string[] = ['', 'Drugs (D1):'];
  lines.push(`  lives: ${r.lives}; used a drug ${r.tried} (${share(r.tried, r.lives)}); addicted at some point ${r.addicted} (${share(r.addicted, r.tried)} of users); times hooked ${r.hooked}`);
  lines.push(`  uses ${r.uses}; units bought ${r.bought}; spent $${r.spent}; peak dependence of the addicted: mean ${mean(r.peakDependence)}, median ${median(r.peakDependence)}`);
  lines.push(`  buying: ${Object.entries(r.buys).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  for (const s of SOURCES) {
    const row = r.bySource[s]!;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    lines.push(`    ${s}: ${total} buys; ${Object.entries(row).map(([k, n]) => `${k} ${share(n, total)}`).join(', ')}`);
  }
  lines.push(`  overdose: ${r.scared} lives with a scare (${share(r.scared, r.tried)} of users), ${r.visited} with an ER visit (${share(r.visited, r.tried)}), ${r.overdoseDeaths} deaths (${share(r.overdoseDeaths, r.tried)} of users; mean age ${mean(r.deathAges)})`);
  lines.push(`  overdoses in a first use: ${r.firstUseOverdose}; deaths with no warning sign: ${r.deathNoSign}; person-years of a minor holding, dealing or making: ${r.minorTrade}`);
  lines.push(`  recovery: ${r.quits} quits; ${r.recoveredLives} lives recovered (${share(r.recoveredLives, r.addicted)} of the addicted); ${r.relapseLives} lives relapsed (${share(r.relapseLives, r.addicted)}), ${r.relapses} relapses`);
  lines.push(`  dealing: ${r.dealingLives} lives (${share(r.dealingLives, r.lives)}), ${r.dealingYears} years; ${r.sold} units sold, $${r.earned} dirty money earned; mean per dealing life $${mean(r.dealingEarnedLives)}, median $${median(r.dealingEarnedLives)}; most customers ${r.customersPeak}`);
  lines.push(`  production: ${r.opLives} lives with an operation; ${r.produced} units made; ${r.raids} raids`);
  lines.push(`  the law: ${r.arrestLives} lives arrested (${share(r.arrestLives, r.lives)}), ${r.arrests} arrests, ${r.jailed} prison terms; offenses ${Object.entries(r.offenses).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  void content;
  return lines;
}

export function drugsTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.drugs;
  const r = report.drugs;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const whole = (n: number) => n.toFixed(0);
  range('person-years of anyone under 18 holding, dealing or making', r.minorTrade, t.minorTrade, whole);
  range('overdoses in a first use', r.firstUseOverdose, t.firstUseOverdose, whole);
  range('overdose deaths with no warning sign', r.deathNoSign, t.deathNoSign, whole);
  if (report.player !== 'drugs') return out;
  range('lives that used a drug', share(r.tried, r.lives), t.used);
  range('users who became addicted', share(r.addicted, r.tried), t.addicted);
  range('users who died of an overdose', share(r.overdoseDeaths, r.tried), t.overdoseDeaths);
  range('users who had a scare or an ER visit', share(r.scared + r.visited, r.tried), t.scares);
  range('the addicted who recovered', share(r.recoveredLives, r.addicted), t.recovered);
  range('the addicted who relapsed', share(r.relapseLives, r.addicted), t.relapsed);
  range('lives that dealt', share(r.dealingLives, r.lives), t.dealers);
  range('mean dirty money a dealing life earned', r.dealingEarnedLives.length === 0 ? 0 : r.dealingEarnedLives.reduce((s, x) => s + x, 0) / r.dealingEarnedLives.length, t.dealingIncome, whole);
  range('lives arrested for drugs', share(r.arrestLives, r.lives), t.arrested);
  return out;
}
