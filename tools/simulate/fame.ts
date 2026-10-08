/**
 * Fame in arts and media, simulated and measured (E6b). The star player goes
 * after a career in one of the four paths (a path that fits a talent it has
 * found, or any), lines up a project with creative choices every year, takes an
 * agent and the deals that come, sets its commitment and its scene, crosses over
 * when it can and retires late. The other players take whatever the events
 * offer, by their own rules. The watcher compares each year's state before and
 * after `beginYear`, so nothing here touches the engine.
 *
 * Reported: entries per path, the rung reached, big breaks, the effect of talent
 * on quality and on how far careers go, what commitment does to the climb, the
 * people close to you, your health and burnout, fades and comebacks, awards,
 * scandals and tabloids, fan people and stalkers, deals, crossovers, young stars,
 * and money, with famous lives set apart from the net worth target.
 */
import type { ContentBundle, FameBand } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { enterBlock, openAgents } from '../../src/engine/fame/ladder';
import { allPaths, hasTalentFor, mainPath, peakRung, workedPaths } from '../../src/engine/fame/query';
import { netWorth } from '../../src/engine/finance';
import { weightedPick } from '../../src/engine/random';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type FameAction = [LifeActionId, LifeActionParams];

/** What a simulated star is like (rolled once a life): describes the player, not the game. */
export interface StarProfile {
  /** The earliest age it starts a career. */
  startAge: number;
  /** Whether it follows a talent it has found into the path that fits. */
  followsTalent: boolean;
  style: 'commercial' | 'artistic' | 'mixed';
  bold: number;
  tourPress: number;
  commitment: 'back' | 'steady' | 'all';
  scene: 'low' | 'social' | 'entourage' | 'lavish';
  /** The yearly chance it tries a new commitment... and takes up a second path. */
  crosses: number;
  retiresAt: number;
}

export function rollStarProfile(rng: RngState): StarProfile {
  return {
    startAge: pick(rng, [9, 12, 14, 16, 18, 20, 22, 26, 30]),
    followsTalent: chance(rng, 0.7),
    style: weightedPick(rng, [['commercial', 3], ['artistic', 3], ['mixed', 4]] as const),
    bold: pick(rng, [0.15, 0.3, 0.5]),
    tourPress: pick(rng, [0.3, 0.6, 0.9]),
    commitment: weightedPick(rng, [['back', 2], ['steady', 5], ['all', 3]] as const),
    scene: weightedPick(rng, [['low', 2], ['social', 5], ['entourage', 2], ['lavish', 1]] as const),
    crosses: pick(rng, [0.1, 0.4, 0.7]),
    retiresAt: pick(rng, [55, 62, 70, 80]),
  };
}

export function chooseFameActions(life: LifeState, content: ContentBundle, rng: RngState, profile: StarProfile): FameAction[] {
  const out: FameAction[] = [];
  const f = life.fame;
  const age = life.character.age;
  const ok = (id: LifeActionId, params: LifeActionParams) => isLifeActionAvailable(life, id, params, content);
  if (!f.active) {
    if (f.retired !== undefined) {
      if (chance(rng, 0.04) && ok('return_fame', {})) out.push(['return_fame', {}]);
      return out;
    }
    if (age < profile.startAge || !chance(rng, 0.5)) return out;
    const paths = allPaths(content);
    const fitting = paths.filter((p) => hasTalentFor(life, p));
    const path = profile.followsTalent && fitting.length > 0 ? pick(rng, fitting) : pick(rng, paths);
    const routes = path.routes.filter((r) => enterBlock(life, path.id, r.id, content) === null);
    if (routes.length === 0) return out;
    const route = pick(rng, routes);
    out.push(['enter_fame', { pathId: path.id, routeId: route.id }]);
    return out;
  }
  // An agent, if one will have you.
  const agents = openAgents(life, content);
  if (agents[0] && chance(rng, 0.7) && ok('hire_agent', { agentId: agents[0].id })) out.push(['hire_agent', { agentId: agents[0].id }]);
  // The setting it lives by, and the scene it keeps.
  if (f.commitment !== profile.commitment && ok('set_commitment', { commitment: profile.commitment })) out.push(['set_commitment', { commitment: profile.commitment }]);
  const rung = mainPath(life)?.rung ?? 1;
  const scene = rung >= 5 ? profile.scene : rung >= 3 ? (profile.scene === 'lavish' ? 'entourage' : profile.scene) : 'low';
  if (f.scene !== scene && ok('set_scene', { scene })) out.push(['set_scene', { scene }]);
  // A second path, once it can.
  if (f.second === null && chance(rng, profile.crosses)) {
    const options = allPaths(content).filter((p) => ok('cross_over', { pathId: p.id }));
    if (options.length > 0) out.push(['cross_over', { pathId: pick(rng, options).id }]);
  }
  // This year's project, with its creative choices.
  const paths = workedPaths(life);
  const pathId = paths.length > 1 && chance(rng, 0.4) ? paths[1]! : paths[0]!;
  const def = content.famePaths[pathId];
  const path = f.paths[pathId];
  if (def && path) {
    const kinds = def.kinds.filter((k) => k.minRung <= path.rung);
    const kind = kinds.length > 0 ? (chance(rng, 0.6) ? kinds[kinds.length - 1]! : pick(rng, kinds)) : undefined;
    const style = profile.style === 'mixed' ? pick(rng, ['commercial', 'artistic'] as const) : profile.style;
    const plan = {
      pathId,
      kindId: kind?.id ?? '',
      style,
      risk: chance(rng, profile.bold) ? ('bold' as const) : ('safe' as const),
      tour: path.rung >= def.tour.minRung && chance(rng, profile.tourPress),
      press: path.rung >= def.press.minRung && chance(rng, profile.tourPress),
    };
    if (kind && ok('plan_project', plan)) out.push(['plan_project', plan]);
  }
  // Now and then it walks out on a contract.
  if (f.contract && chance(rng, 0.03) && ok('break_contract', {})) out.push(['break_contract', {}]);
  if (age >= profile.retiresAt && chance(rng, 0.2) && ok('retire_fame', {})) out.push(['retire_fame', {}]);
  return out;
}

export interface CommitmentRow {
  years: number;
  /** Fame points released work won (before any wall) on the first three rungs, and the releases counted. */
  fameGained: number;
  releaseYears: number;
  /** Affection lost by the people close to you (your partner and children), and health and stress changes, summed over the years. */
  closeAffection: number;
  closeYears: number;
  health: number;
  burnouts: number;
}

export interface FameReport {
  /** Net worth at the target age of the famous lives set apart from the net worth target. */
  famousAtTarget?: number[];
  player: string;
  lives: number;
  reached30: number;
  entered: number;
  byPath: Record<string, number>;
  enteredAges: number[];
  /** Entered with a talent that fits the path, and without. */
  talent: { lives: number; pastMiddle: number; topRung: number; qualitySum: number; projects: number };
  none: { lives: number; pastMiddle: number; topRung: number; qualitySum: number; projects: number };
  /** Lives by the highest rung reached in their main path (index 0 is rung 1), per path. */
  peak: Record<string, number[]>;
  careerYears: number;
  projectYears: number;
  breaks: number;
  breakLives: number;
  /** A big break that took someone with no fitting talent above the ceiling: must be none. */
  breakOverCeiling: number;
  bands: Record<FameBand, number>;
  /** Releases where critics and fans were 20 or more points apart, and where each liked it more. */
  disagree: { releases: number; far: number };
  bySetting: { commercial: { critic: number; fan: number; n: number }; artistic: { critic: number; fan: number; n: number } };
  byRisk: { safe: number[]; bold: number[] };
  commitment: Record<'back' | 'steady' | 'all', CommitmentRow>;
  fades: number;
  fadeLives: number;
  comebacks: number;
  comebackLives: number;
  retiredLives: number;
  nominations: number;
  wins: number;
  winLives: number;
  scandals: number;
  tabloidLives: number;
  secretsOut: number;
  fanPeople: { super: number; hater: number; critic: number };
  stalkerLives: number;
  stalkerReported: number;
  stalkerOrdered: number;
  stalkerCharged: number;
  crossoverLives: number;
  contracts: { lives: number; signed: number; broken: number; byParent: number };
  agentLives: number;
  burnouts: number;
  /** Fame earnings through the ledger. */
  income: { gross: number; ledgerYears: number };
  rungIncome: number[];
  rungYears: number[];
  /** Lives that reached a rung where crossing over opens, and the net worth at death of those and of the others who entered. */
  famousWealth: number[];
  otherWealth: number[];
  /** Under 18 in the business, and what must never happen to them. */
  minors: { lives: number; allIn: number; stalked: number; parentDeals: number; unsignedDeals: number };
  events: Record<string, number>;
  invariantFailures: number;
}

export function emptyFameReport(player: string, content: ContentBundle): FameReport {
  const row = (): CommitmentRow => ({ years: 0, fameGained: 0, releaseYears: 0, closeAffection: 0, closeYears: 0, health: 0, burnouts: 0 });
  const side = () => ({ lives: 0, pastMiddle: 0, topRung: 0, qualitySum: 0, projects: 0 });
  const ladder = Math.max(...allPaths(content).map((p) => p.rungs.length));
  return {
    player,
    lives: 0,
    reached30: 0,
    entered: 0,
    byPath: {},
    enteredAges: [],
    talent: side(),
    none: side(),
    peak: Object.fromEntries(allPaths(content).map((p) => [p.id, Array.from({ length: p.rungs.length }, () => 0)])),
    careerYears: 0,
    projectYears: 0,
    breaks: 0,
    breakLives: 0,
    breakOverCeiling: 0,
    bands: { flop: 0, solid: 0, hit: 0, acclaimed: 0, cult: 0, crowd: 0 },
    disagree: { releases: 0, far: 0 },
    bySetting: { commercial: { critic: 0, fan: 0, n: 0 }, artistic: { critic: 0, fan: 0, n: 0 } },
    byRisk: { safe: [], bold: [] },
    commitment: { back: row(), steady: row(), all: row() },
    fades: 0,
    fadeLives: 0,
    comebacks: 0,
    comebackLives: 0,
    retiredLives: 0,
    nominations: 0,
    wins: 0,
    winLives: 0,
    scandals: 0,
    tabloidLives: 0,
    secretsOut: 0,
    fanPeople: { super: 0, hater: 0, critic: 0 },
    stalkerLives: 0,
    stalkerReported: 0,
    stalkerOrdered: 0,
    stalkerCharged: 0,
    crossoverLives: 0,
    contracts: { lives: 0, signed: 0, broken: 0, byParent: 0 },
    agentLives: 0,
    burnouts: 0,
    income: { gross: 0, ledgerYears: 0 },
    rungIncome: Array.from({ length: ladder }, () => 0),
    rungYears: Array.from({ length: ladder }, () => 0),
    famousWealth: [],
    otherWealth: [],
    minors: { lives: 0, allIn: 0, stalked: 0, parentDeals: 0, unsignedDeals: 0 },
    events: {},
    invariantFailures: 0,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return xs.length < 2 ? 0 : Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
};

/** The people close to you whose affection fame's toll is measured on: your partner and your children. */
function closeAffection(life: LifeState): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, rel] of Object.entries(life.relationships)) {
    if (rel.status !== 'active' || life.people[id]?.alive !== true) continue;
    if (['partner', 'fiance', 'spouse', 'child', 'stepchild'].includes(rel.kind)) out.set(id, rel.affection);
  }
  return out;
}

/** Watches one life. */
export class FameWatcher {
  private everIn = false;
  private everBreak = false;
  private everFade = false;
  private everComeback = false;
  private everWin = false;
  private everTabloid = false;
  private everStalker = false;
  private everCross = false;
  private everContract = false;
  private everAgent = false;
  private enteredMinor = false;
  private dealOpen = false;
  private stage: string | undefined;
  private brokeSeen = false;
  private stalkerSeen = new Set<string>();
  private lastTotals: Record<string, number> = {};
  private enteredAt = 0;
  private enteredPath = '';
  private enteredTalent = false;
  private fanSeen = new Set<string>();

  constructor(
    private readonly r: FameReport,
    private readonly content: ContentBundle,
  ) {}

  /** The year that has just begun (`before` is the state before `beginYear`, `after` the state after). */
  observe(before: LifeState, after: LifeState): void {
    const { r } = this;
    const f = after.fame;
    const adultAge = this.content.balance.relationships.adultAge;
    const independence = this.content.balance.economy.independenceAge;
    const age = after.character.age;
    if ((f.active || f.retired !== undefined) && age < adultAge && f.stalker) r.minors.stalked++;
    if (f.active && age < independence && f.commitment === 'all') r.minors.allIn++;
    if (f.active && !this.everIn) {
      this.everIn = true;
      this.enteredAt = age;
      this.enteredPath = f.main ?? '';
      const def = f.main ? this.content.famePaths[f.main] : undefined;
      this.enteredTalent = def ? hasTalentFor(after, def) : false;
      r.entered++;
      r.enteredAges.push(age);
      r.byPath[this.enteredPath] = (r.byPath[this.enteredPath] ?? 0) + 1;
      (this.enteredTalent ? r.talent : r.none).lives++;
      if (age < independence) {
        this.enteredMinor = true;
        r.minors.lives++;
      }
    }
    for (const p of after.pending) {
      const def = this.content.events[p.eventId];
      if (def && def.category.startsWith('fame')) r.events[p.eventId] = (r.events[p.eventId] ?? 0) + 1;
    }
    if (!before.fame.active && !f.active) return;
    // Totals that moved this year.
    const t = f.totals;
    const moved = (key: keyof typeof t) => t[key] - (this.lastTotals[key] ?? 0);
    const book = (): void => {
      this.lastTotals = { ...t };
    };
    if (before.fame.active) {
      const main = mainPath(before);
      const mainAfter = mainPath(after);
      const setting = before.fame.commitment;
      const row = r.commitment[setting];
      r.careerYears++;
      row.years++;
      if (main) {
        r.rungYears[main.rung - 1] = (r.rungYears[main.rung - 1] ?? 0) + 1;
        r.rungIncome[main.rung - 1] = (r.rungIncome[main.rung - 1] ?? 0) + f.income.gross;
      }
      r.income.gross += f.income.gross;
      if (f.income.year === after.currentYear) r.income.ledgerYears++;
      const project = f.projects.at(-1);
      const released = project !== undefined && project.year === after.currentYear;
      if (released && project) {
        r.projectYears++;
        r.bands[project.band]++;
        r.disagree.releases++;
        if (Math.abs(project.critics - project.fans) >= 20) r.disagree.far++;
        const s = r.bySetting[project.style];
        s.critic += project.critics;
        s.fan += project.fans;
        s.n++;
        r.byRisk[project.risk].push((project.critics + project.fans) / 2);
        const side = this.enteredTalent ? r.talent : r.none;
        side.qualitySum += project.quality;
        side.projects++;
        // Climb: the fame a release won on the first three rungs, before the wall at the next rung holds it back (higher up the same effort buys less).
        if (main && main.rung <= 3) {
          row.releaseYears++;
          row.fameGained += project.gain;
        }
      }
      // The toll: affection among those close to you, health, burnout.
      const wasClose = closeAffection(before);
      const nowClose = closeAffection(after);
      if (released) {
        for (const [id, was] of wasClose) {
          const now = nowClose.get(id);
          if (now !== undefined) {
            row.closeAffection += was - now;
            row.closeYears++;
          }
        }
        row.health += before.character.stats.health - after.character.stats.health;
      }
      row.burnouts += moved('burnouts');
    }
    r.breaks += moved('breaks');
    if (moved('breaks') > 0) {
      this.everBreak = true;
      // No break may take someone past the ceiling their talent allows.
      const id = after.fame.main;
      const def = id ? this.content.famePaths[id] : undefined;
      if (def && id) {
        const p = after.fame.paths[id];
        const cap = hasTalentFor(after, def) ? def.rungs.length : Math.max(2, Math.round(def.rungs.length * this.content.balance.fame.bigBreak.ceiling.none));
        if (p && before.fame.paths[id] && p.rung > cap && p.rung - before.fame.paths[id]!.rung > 1) r.breakOverCeiling++;
      }
    }
    if (moved('fades') > 0) {
      r.fades += moved('fades');
      this.everFade = true;
    }
    if (moved('comebacks') > 0) {
      r.comebacks += moved('comebacks');
      this.everComeback = true;
    }
    r.nominations += moved('nominations');
    if (moved('wins') > 0) {
      r.wins += moved('wins');
      this.everWin = true;
    }
    if (moved('scandals') > 0) {
      r.scandals += moved('scandals');
      this.everTabloid = true;
    }
    r.burnouts += moved('burnouts');
    if (f.stalker && !this.stalkerSeen.has(f.stalker.id)) {
      this.stalkerSeen.add(f.stalker.id);
      this.everStalker = true;
    }
    // The stages a stalker moves through, seen in the state a year starts from and in the state it begins with.
    for (const s of [before.fame.stalker?.stage, f.stalker?.stage]) {
      if (s !== this.stage) {
        if (s === 'reported') r.stalkerReported++;
        if (s === 'ordered') r.stalkerOrdered++;
        if (s === 'charged') r.stalkerCharged++;
        this.stage = s;
      }
    }
    if (f.second !== null && !this.everCross) {
      this.everCross = true;
    }
    // Deals and agents are signed between years or in events, so they show in the state a year starts from.
    const deal = before.fame.contract;
    if (deal && !this.dealOpen) {
      this.dealOpen = true;
      r.contracts.signed++;
      this.everContract = true;
      if (deal.byParent) r.contracts.byParent++;
      if (deal.byParent) r.minors.parentDeals++;
      else if (deal.since - before.birthYear < independence) r.minors.unsignedDeals++;
    } else if (!deal) {
      this.dealOpen = false;
    }
    if (before.flags.fame_broke_contract === true && !this.brokeSeen) {
      this.brokeSeen = true;
      r.contracts.broken++;
    }
    if (before.fame.agent) this.everAgent = true;
    for (const type of ['super', 'hater', 'critic'] as const) {
      for (const id of f.people[type]) {
        if (!this.fanSeen.has(id)) {
          this.fanSeen.add(id);
          r.fanPeople[type]++;
        }
      }
    }
    const headline = f.headlines.find((h) => h.year === after.currentYear);
    if (headline && !['scandal'].includes(headline.kind)) r.secretsOut++;
    book();
  }

  finish(life: LifeState): void {
    const { r } = this;
    r.lives++;
    if (life.character.age >= 30) r.reached30++;
    const f = life.fame;
    if (!this.everIn) return;
    const peak = peakRung(life);
    const main = f.main ?? this.enteredPath;
    const def = this.content.famePaths[this.enteredPath];
    const mainP = f.paths[main];
    const high = mainP?.peak ?? peak;
    if (def) {
      r.peak[def.id]![Math.min(def.rungs.length, Math.max(1, high)) - 1]!++;
      const side = this.enteredTalent ? r.talent : r.none;
      if (high > Math.ceil(def.rungs.length / 2)) side.pastMiddle++;
      if (high >= def.rungs.length) side.topRung++;
    }
    if (this.everBreak) r.breakLives++;
    if (this.everFade) r.fadeLives++;
    if (this.everComeback) r.comebackLives++;
    if (this.everWin) r.winLives++;
    if (this.everTabloid) r.tabloidLives++;
    if (this.everStalker) r.stalkerLives++;
    if (this.everCross) r.crossoverLives++;
    if (this.everContract) r.contracts.lives++;
    if (this.everAgent) r.agentLives++;
    if (f.retired !== undefined) r.retiredLives++;
    if (this.enteredMinor) void this.enteredAt;
    const famous = high >= this.content.balance.fame.crossover.rung;
    (famous ? r.famousWealth : r.otherWealth).push(netWorth(life));
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 1) => (d === 0 ? '0' : (n / d).toFixed(digits));
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export function formatFame(r: FameReport, content: ContentBundle): string[] {
  const lines: string[] = ['', `Fame in arts and media (E6b) — ${r.player} player:`];
  lines.push(`  lives ${r.lives}; reached 30: ${r.reached30}; started a career: ${r.entered} (${pct(r.entered, r.lives)} of lives); median age on starting ${median(r.enteredAges)}`);
  if (r.entered === 0) return lines;
  lines.push(`  by path: ${Object.entries(r.byPath).map(([id, n]) => `${content.famePaths[id]!.name} ${n}`).join(', ')}`);
  for (const def of allPaths(content)) {
    const counts = r.peak[def.id]!;
    const total = sum(counts);
    if (total === 0) continue;
    lines.push(`  ${def.name} — highest rung: ${def.rungs.map((rung, i) => `${rung.title} ${pct(counts[i]!, total)}`).join('; ')}`);
  }
  lines.push(`  talent: ${r.talent.lives} careers with a fitting talent (past the middle of the ladder ${pct(r.talent.pastMiddle, r.talent.lives)}, top rung ${pct(r.talent.topRung, r.talent.lives)}, mean quality ${per(r.talent.qualitySum, r.talent.projects)}); ${r.none.lives} without (past the middle ${pct(r.none.pastMiddle, r.none.lives)}, top rung ${pct(r.none.topRung, r.none.lives)}, mean quality ${per(r.none.qualitySum, r.none.projects)})`);
  lines.push(`  years in the business ${r.careerYears} (${per(r.careerYears, r.entered)} a career); projects ${r.projectYears}; reception: ${Object.entries(r.bands).map(([b, n]) => `${b} ${pct(n, r.projectYears)}`).join(', ')}`);
  lines.push(`  critics and fans 20+ points apart on ${pct(r.disagree.far, r.disagree.releases)} of releases; commercial work: critics ${per(r.bySetting.commercial.critic, r.bySetting.commercial.n)}, fans ${per(r.bySetting.commercial.fan, r.bySetting.commercial.n)}; artistic work: critics ${per(r.bySetting.artistic.critic, r.bySetting.artistic.n)}, fans ${per(r.bySetting.artistic.fan, r.bySetting.artistic.n)}; spread of reception: safe ${per(sd(r.byRisk.safe), 1)}, bold ${per(sd(r.byRisk.bold), 1)}`);
  lines.push(`  big breaks: ${r.breaks} in ${r.breakLives} careers (${pct(r.breakLives, r.entered)}), ${per(r.breaks, r.careerYears, 3)} a career year; over the talent ceiling: ${r.breakOverCeiling}`);
  for (const id of ['back', 'steady', 'all'] as const) {
    const c = r.commitment[id];
    lines.push(
      `  ${id.padEnd(6)} ${c.years} years: fame gained a release year ${per(c.fameGained, c.releaseYears, 2)}; affection lost by partner and children ${per(c.closeAffection, c.closeYears, 2)} a release year; health lost ${per(c.health, c.releaseYears, 2)}; burnouts ${per(c.burnouts, c.years, 3)} a year`,
    );
  }
  lines.push(`  fades ${r.fades} (${pct(r.fadeLives, r.entered)} of careers), comebacks ${r.comebacks} (${pct(r.comebackLives, r.entered)}), retired ${pct(r.retiredLives, r.entered)}`);
  lines.push(`  awards: ${r.nominations} nominations, ${r.wins} wins (${pct(r.winLives, r.entered)} of careers won one)`);
  lines.push(`  tabloids: ${pct(r.tabloidLives, r.entered)} of careers had a story (${r.scandals} in all, ${r.secretsOut} were secrets from the social web)`);
  lines.push(`  fan people: superfans ${r.fanPeople.super}, haters ${r.fanPeople.hater}, critics ${r.fanPeople.critic}; stalkers in ${pct(r.stalkerLives, r.entered)} of careers (reported ${r.stalkerReported}, order ${r.stalkerOrdered}, charged ${r.stalkerCharged})`);
  lines.push(`  crossed into a second path: ${pct(r.crossoverLives, r.entered)}; agents: ${pct(r.agentLives, r.entered)}; deals: ${r.contracts.signed} signed in ${r.contracts.lives} careers, ${r.contracts.broken} broken, ${r.contracts.byParent} signed by a parent`);
  lines.push(`  young stars: ${r.minors.lives} careers began under 18; all in under 18: ${r.minors.allIn}; stalked under 18: ${r.minors.stalked}; deals signed by a parent ${r.minors.parentDeals}, not by a parent ${r.minors.unsignedDeals}`);
  lines.push(`  money: ${dollars(r.income.gross / Math.max(1, r.careerYears))} a career year through the ledger (${r.income.ledgerYears} years); by rung: ${r.rungIncome.map((v, i) => `${i + 1}: ${dollars(v / Math.max(1, r.rungYears[i]!))}`).join(', ')}`);
  lines.push(`  net worth at death: famous lives (rung ${content.balance.fame.crossover.rung}+) median ${dollars(median(r.famousWealth))} (${r.famousWealth.length} lives), the other careers ${dollars(median(r.otherWealth))} (${r.otherWealth.length} lives)`);
  lines.push(`  fame events: ${sum(Object.values(r.events))} in ${Object.keys(r.events).length} kinds; invariant failures about fame: ${r.invariantFailures}`);
  return lines;
}

/** The E6b targets (balance/targets.yaml, fame). */
export function fameTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.fame;
  const r = report.fame;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('young stars who went all in or were stalked', r.minors.allIn + r.minors.stalked, t.minorsHarmed, (n) => n.toFixed(0));
  range('deals for young stars not signed by a parent', r.minors.unsignedDeals, t.unsignedMinorDeals, (n) => n.toFixed(0));
  range('big breaks over the ceiling for someone without a fitting talent', r.breakOverCeiling, t.breakOverCeiling, (n) => n.toFixed(0));
  if (report.player !== 'star') return out;
  range('lives that start a career', share(r.entered, r.lives), t.entered);
  range('careers with a big break', share(r.breakLives, r.entered), t.breakLives);
  range('big breaks a career year', share(r.breaks, r.careerYears), t.breaksPerYear, (n) => n.toFixed(4));
  range('careers without a fitting talent that went past the middle of the ladder', share(r.none.pastMiddle, r.none.lives), t.noTalentPastMiddle);
  range('careers with a fitting talent that went past the middle of the ladder', share(r.talent.pastMiddle, r.talent.lives), t.talentPastMiddle);
  range('careers that reached the top rung', share(r.talent.topRung + r.none.topRung, r.entered), t.topRung);
  range('mean quality of work: fitting talent minus none', mean2(r.talent.qualitySum, r.talent.projects) - mean2(r.none.qualitySum, r.none.projects), t.talentQualityGap, (n) => n.toFixed(1));
  range('releases where critics and fans were 20+ points apart', share(r.disagree.far, r.disagree.releases), t.disagree);
  const back = r.commitment.back;
  const all = r.commitment.all;
  range('fame gained a release year, all in as a multiple of holding back', share(all.fameGained / Math.max(1, all.releaseYears), Math.max(0.01, back.fameGained / Math.max(1, back.releaseYears))), t.allInClimb, (n) => n.toFixed(2));
  range('affection lost by partner and children, all in minus holding back', all.closeAffection / Math.max(1, all.closeYears) - back.closeAffection / Math.max(1, back.closeYears), t.allInStrain, (n) => n.toFixed(2));
  range('burnouts a year, all in as a multiple of steady', share(all.burnouts / Math.max(1, all.years), Math.max(0.0005, r.commitment.steady.burnouts / Math.max(1, r.commitment.steady.years))), t.allInBurnout, (n) => n.toFixed(1));
  range('careers with a rung lost to fading', share(r.fadeLives, r.entered), t.fadeLives);
  range('careers with a comeback', share(r.comebackLives, r.entered), t.comebackLives);
  range('careers that won an award', share(r.winLives, r.entered), t.winLives);
  range('careers with a tabloid story', share(r.tabloidLives, r.entered), t.tabloidLives);
  range('careers with a stalker', share(r.stalkerLives, r.entered), t.stalkerLives);
  range('careers that crossed into a second path', share(r.crossoverLives, r.entered), t.crossoverLives);
  range('famous lives’ net worth at death as a multiple of the other careers’', share(median(r.famousWealth), Math.max(1, median(r.otherWealth))), t.famousWealthRatio, (n) => n.toFixed(2));
  return out;
}

const mean2 = (sumQ: number, n: number) => (n === 0 ? 0 : sumQ / n);
