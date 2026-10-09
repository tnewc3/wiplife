/**
 * Sports, simulated and measured (E6c). The athlete player goes after a sport
 * (the one that fits a talent it has found, or any), takes the way in its age
 * allows, hires an agent, sets its commitment and its training focus, now and
 * then asks for a trade or a new deal, and retires late by one of the routes.
 * The other players take whatever the events offer. The watcher compares each
 * year's state before and after `beginYear`, so nothing here touches the engine.
 *
 * Reported: entries per sport, how far players get with and without a talent
 * that fits, the draft, career length, injuries (and what playing through pain
 * does), contracts, trades, releases, titles, all-stars and earnings through
 * the ledger, and how careers end.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { enterBlock, openAgents } from '../../src/engine/fame/ladder';
import { hasTalentFor } from '../../src/engine/fame/query';
import { weightedPick } from '../../src/engine/random';
import { chance, pick, type RngState } from '../../src/engine/rng';
import { allSports, bestPosition, inSports, mySport } from '../../src/engine/sports/query';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type SportsAction = [LifeActionId, LifeActionParams];

/** What a simulated athlete is like (rolled once a life): describes the player, not the game. */
export interface AthleteProfile {
  startAge: number;
  followsTalent: boolean;
  commitment: 'back' | 'steady' | 'all';
  focus: 'skills' | 'conditioning' | 'film';
  asksForTrade: number;
  asksForDeal: number;
  retiresAt: number;
}

export function rollAthleteProfile(rng: RngState): AthleteProfile {
  return {
    startAge: pick(rng, [8, 10, 12, 13, 15, 17, 18]),
    followsTalent: chance(rng, 0.7),
    commitment: weightedPick(rng, [['back', 2], ['steady', 5], ['all', 3]] as const),
    focus: weightedPick(rng, [['skills', 4], ['conditioning', 4], ['film', 2]] as const),
    asksForTrade: pick(rng, [0, 0.05, 0.15]),
    asksForDeal: pick(rng, [0, 0.1, 0.3]),
    retiresAt: pick(rng, [33, 36, 38, 41]),
  };
}

export function chooseSportsActions(life: LifeState, content: ContentBundle, rng: RngState, profile: AthleteProfile): SportsAction[] {
  const out: SportsAction[] = [];
  const f = life.fame;
  const age = life.character.age;
  const ok = (id: LifeActionId, params: LifeActionParams) => isLifeActionAvailable(life, id, params, content);
  if (!f.active) {
    if (f.retired !== undefined || life.sports.retired !== undefined || life.sports.totals.seasons > 0) return out;
    if (age < profile.startAge || !chance(rng, 0.5)) return out;
    const sports = allSports(content);
    const fitting = sports.filter((s) => hasTalentFor(life, s));
    const sport = profile.followsTalent && fitting.length > 0 ? pick(rng, fitting) : pick(rng, sports);
    const routes = sport.routes.filter((r) => enterBlock(life, sport.id, r.id, content) === null);
    if (routes.length === 0) return out;
    // The way in its age allows, the lowest open to it.
    out.push(['enter_fame', { pathId: sport.id, routeId: routes[0]!.id }]);
    return out;
  }
  if (!inSports(life, content)) return out;
  const def = mySport(life, content)!;
  const agents = openAgents(life, content);
  if (agents[0] && chance(rng, 0.7) && ok('hire_agent', { agentId: agents[0].id })) out.push(['hire_agent', { agentId: agents[0].id }]);
  if (f.commitment !== profile.commitment && ok('set_commitment', { commitment: profile.commitment })) out.push(['set_commitment', { commitment: profile.commitment }]);
  if (life.sports.focus !== profile.focus && ok('set_focus', { sportFocus: profile.focus })) out.push(['set_focus', { sportFocus: profile.focus }]);
  // The position that suits it best, once.
  const best = bestPosition(life, def.sport);
  if (life.sports.position !== best.id && chance(rng, 0.2) && ok('set_position', { positionId: best.id })) out.push(['set_position', { positionId: best.id }]);
  if (life.sports.pro && life.sports.contract) {
    if (chance(rng, profile.asksForTrade) && ok('ask_trade', {})) out.push(['ask_trade', {}]);
    else if (chance(rng, profile.asksForDeal) && ok('ask_contract', {})) out.push(['ask_contract', {}]);
  }
  if (age >= profile.retiresAt && chance(rng, 0.25)) {
    const route = pick(rng, ['coaching', 'broadcast', 'normal'] as const);
    if (ok('retire_sports', { routeKey: route })) out.push(['retire_sports', { routeKey: route }]);
    else if (ok('retire_sports', { routeKey: 'normal' })) out.push(['retire_sports', { routeKey: 'normal' }]);
  }
  return out;
}

interface SideRow {
  lives: number;
  pro: number;
  pastMiddle: number;
  top: number;
  ratingSum: number;
  seasons: number;
}

export interface SportsReport {
  player: string;
  lives: number;
  entered: number;
  bySport: Record<string, number>;
  enteredAges: number[];
  /** Entered with a talent that fits the sport, and without. */
  talent: SideRow;
  none: SideRow;
  /** Lives by the highest rung reached, per sport (index 0 is rung 1). */
  peak: Record<string, number[]>;
  seasons: { youth: number; school: number; college: number; pro: number };
  /** Years of pro play by career, and the age at the last season. */
  proCareers: number[];
  proEndAges: number[];
  drafted: { declared: number; picked: number; undrafted: number; signed: number; declined: number; firstRound: number };
  /** How the careers ended. */
  ended: { agedOut: number; stalled: number; injury: number; retired: number; coaching: number; broadcast: number; normal: number; stillPlaying: number };
  injuries: { total: number; serious: number; proSeasons: number; careerEnding: number; wornLives: number };
  /** Playing through pain: decisions, and the injuries made worse the year after against rested ones. */
  pain: { decisions: number; worse: number; rested: number; restedWorse: number };
  contracts: { signed: number; trades: number; releases: number; asked: { trade: number; granted: number } };
  titles: { lives: number; total: number; finals: number; playoffs: number; proSeasons: number };
  allStarLives: number;
  mvpLives: number;
  suspensions: number;
  /** Salary through the ledger. */
  earnings: { lives: number; total: number; byPeak: number[][] };
  underAgePros: number;
  events: Record<string, number>;
  invariantFailures: number;
}

export function emptySportsReport(player: string, content: ContentBundle): SportsReport {
  const side = (): SideRow => ({ lives: 0, pro: 0, pastMiddle: 0, top: 0, ratingSum: 0, seasons: 0 });
  const sports = allSports(content);
  return {
    player,
    lives: 0,
    entered: 0,
    bySport: {},
    enteredAges: [],
    talent: side(),
    none: side(),
    peak: Object.fromEntries(sports.map((s) => [s.id, Array.from({ length: s.rungs.length }, () => 0)])),
    seasons: { youth: 0, school: 0, college: 0, pro: 0 },
    proCareers: [],
    proEndAges: [],
    drafted: { declared: 0, picked: 0, undrafted: 0, signed: 0, declined: 0, firstRound: 0 },
    ended: { agedOut: 0, stalled: 0, injury: 0, retired: 0, coaching: 0, broadcast: 0, normal: 0, stillPlaying: 0 },
    injuries: { total: 0, serious: 0, proSeasons: 0, careerEnding: 0, wornLives: 0 },
    pain: { decisions: 0, worse: 0, rested: 0, restedWorse: 0 },
    contracts: { signed: 0, trades: 0, releases: 0, asked: { trade: 0, granted: 0 } },
    titles: { lives: 0, total: 0, finals: 0, playoffs: 0, proSeasons: 0 },
    allStarLives: 0,
    mvpLives: 0,
    suspensions: 0,
    earnings: { lives: 0, total: 0, byPeak: Array.from({ length: 8 }, () => []) },
    underAgePros: 0,
    events: {},
    invariantFailures: 0,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
};

/** Watches one life. */
export class SportsWatcher {
  private entered = false;
  private sport = '';
  private talent = false;
  private lastTotals = { titles: 0, finals: 0, playoffs: 0, trades: 0, releases: 0, injuries: 0, serious: 0, playedThrough: 0, allStars: 0, suspensions: 0, proSeasons: 0 };
  private proYears = 0;
  private lastProAge = 0;
  private everTitle = false;
  private everMvp = false;
  private ended = false;
  private signedPro = false;
  private pendingPain: { had: boolean; rested: boolean; severity: number } | null = null;
  private seenDraft = 0;
  private wornSeen = false;
  private askedTrade = false;

  constructor(
    private readonly r: SportsReport,
    private readonly content: ContentBundle,
  ) {}

  /** The player took an action (between years). */
  acted(actionId: LifeActionId, before: LifeState): void {
    if (actionId === 'ask_trade' && before.sports.contract) {
      this.askedTrade = true;
      this.r.contracts.asked.trade++;
    }
  }

  observe(before: LifeState, after: LifeState): void {
    const { r } = this;
    const s = after.sports;
    const f = after.fame;
    const adultAge = this.content.balance.relationships.adultAge;
    if ((s.pro || s.contract) && after.character.age < adultAge) r.underAgePros++;
    for (const p of after.pending) {
      const def = this.content.events[p.eventId];
      if (def && def.category.startsWith('sports')) r.events[p.eventId] = (r.events[p.eventId] ?? 0) + 1;
    }
    if (!this.entered && f.active && inSports(after, this.content)) {
      this.entered = true;
      this.sport = f.main ?? '';
      const def = this.content.famePaths[this.sport];
      this.talent = def ? hasTalentFor(after, def) : false;
      r.entered++;
      r.enteredAges.push(after.character.age);
      r.bySport[this.sport] = (r.bySport[this.sport] ?? 0) + 1;
      (this.talent ? r.talent : r.none).lives++;
    }
    if (!this.entered) return;
    const t = s.totals;
    const moved = (key: keyof typeof this.lastTotals) => t[key] - this.lastTotals[key];
    const season = s.seasons.at(-1);
    const played = season !== undefined && season.year === after.currentYear;
    if (played && season) {
      r.seasons[season.level]++;
      const side = this.talent ? r.talent : r.none;
      side.ratingSum += season.rating;
      side.seasons++;
      if (season.level === 'pro') {
        r.injuries.proSeasons++;
        this.proYears++;
        this.lastProAge = after.character.age;
        r.titles.proSeasons++;
      }
    }
    // Titles, finals and playoff runs are counted for pro play only.
    if (played && season && season.level === 'pro') {
      r.titles.total += moved('titles');
      r.titles.finals += moved('finals');
      r.titles.playoffs += moved('playoffs');
      if (moved('titles') > 0) this.everTitle = true;
    }
    r.injuries.total += moved('injuries');
    r.injuries.serious += moved('serious');
    r.contracts.trades += moved('trades');
    r.contracts.releases += moved('releases');
    r.suspensions += moved('suspensions');
    if (this.askedTrade && moved('trades') > 0) r.contracts.asked.granted++;
    if (this.askedTrade && (before.sports.ask === null || after.currentYear !== before.currentYear)) this.askedTrade = false;

    // Pro: the first deal.
    if (s.pro && !this.signedPro) {
      this.signedPro = true;
      r.drafted.signed++;
    }
    // The draft.
    const d = s.draft;
    if (d && d.year === after.currentYear && this.seenDraft !== d.year) {
      this.seenDraft = d.year;
      r.drafted.declared++;
      if (d.pick > 0) {
        r.drafted.picked++;
        if (d.round === 1) r.drafted.firstRound++;
      } else {
        r.drafted.undrafted++;
      }
    }
    // Playing through pain: the pain flag in the state a year starts from, and what became of the injury.
    if (before.sports.pain || before.sports.rest) {
      const def = mySport(before, this.content);
      const hurt = def ? before.health.conditions.filter((c) => def.sport.injuries.some((i) => i.id === c.conditionId)) : [];
      this.pendingPain = { had: before.sports.pain, rested: before.sports.rest, severity: Math.max(0, ...hurt.map((c) => c.severity)) };
    }
    if (this.pendingPain) {
      const def = mySport(after, this.content);
      const now = def ? Math.max(0, ...after.health.conditions.filter((c) => def.sport.injuries.some((i) => i.id === c.conditionId)).map((c) => c.severity)) : 0;
      if (this.pendingPain.had) {
        r.pain.decisions++;
        if (now > this.pendingPain.severity || s.retired?.year === after.currentYear) r.pain.worse++;
      } else if (this.pendingPain.rested) {
        r.pain.rested++;
        if (now > this.pendingPain.severity) r.pain.restedWorse++;
      }
      this.pendingPain = null;
    }
    if (s.retired && !this.ended) {
      this.ended = true;
      if (after.flags.sports_career_ended_by_injury === true) r.ended.injury++;
      else if (s.agedOut === after.currentYear) r.ended.agedOut++;
      else if (s.retired.route === null && !s.contract && s.unsigned >= this.content.balance.sports.contract.unsigned) r.ended.stalled++;
      else r.ended.retired++;
      if (s.retired.route) r.ended[s.retired.route]++;
    }
    if (after.health.conditions.some((c) => c.conditionId === 'worn_joints') && !this.wornSeen) {
      this.wornSeen = true;
      r.injuries.wornLives++;
    }
    // The MVP-level award.
    if (f.awards.some((a) => this.content.fameAwards[a.awardId]?.path === this.sport && (this.content.fameAwards[a.awardId]?.minRung ?? 0) >= 5 && a.won)) this.everMvp = true;
    this.lastTotals = {
      titles: t.titles,
      finals: t.finals,
      playoffs: t.playoffs,
      trades: t.trades,
      releases: t.releases,
      injuries: t.injuries,
      serious: t.serious,
      playedThrough: t.playedThrough,
      allStars: t.allStars,
      suspensions: t.suspensions,
      proSeasons: t.proSeasons,
    };
  }

  finish(life: LifeState): void {
    const { r } = this;
    r.lives++;
    if (!this.entered) return;
    const def = this.content.famePaths[this.sport];
    if (!def) return;
    const s = life.sports;
    const high = life.fame.paths[this.sport]?.peak ?? 1;
    r.peak[def.id]![Math.min(def.rungs.length, Math.max(1, high)) - 1]!++;
    const side = this.talent ? r.talent : r.none;
    if (s.pro) side.pro++;
    if (high > Math.ceil(def.rungs.length / 2)) side.pastMiddle++;
    if (high >= def.rungs.length) side.top++;
    if (s.totals.proSeasons > 0) {
      r.proCareers.push(s.totals.proSeasons);
      r.proEndAges.push(this.lastProAge);
      r.earnings.lives++;
      r.earnings.total += s.totals.earned;
      r.earnings.byPeak[Math.min(7, Math.max(0, high - 1))]!.push(s.totals.earned);
    }
    if (this.everTitle) r.titles.lives++;
    if (s.totals.allStars > 0) r.allStarLives++;
    if (this.everMvp) r.mvpLives++;
    if (life.flags.sports_career_ended_by_injury === true) r.injuries.careerEnding++;
    if (!s.retired && life.fame.active && life.fame.main === this.sport) r.ended.stillPlaying++;
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 1) => (d === 0 ? '0' : (n / d).toFixed(digits));
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function formatSports(r: SportsReport, content: ContentBundle): string[] {
  const lines: string[] = ['', `Sports (E6c) — ${r.player} player:`];
  lines.push(`  lives ${r.lives}; started a sport: ${r.entered} (${pct(r.entered, r.lives)} of lives); median age on starting ${median(r.enteredAges)}`);
  if (r.entered === 0) return lines;
  lines.push(`  by sport: ${Object.entries(r.bySport).map(([id, n]) => `${content.famePaths[id]!.name} ${n}`).join(', ')}`);
  for (const def of allSports(content)) {
    const counts = r.peak[def.id]!;
    const total = sum(counts);
    if (total === 0) continue;
    lines.push(`  ${def.name} — highest rung: ${def.rungs.map((rung, i) => `${rung.title} ${pct(counts[i]!, total)}`).join('; ')}`);
  }
  const row = (label: string, s: SideRow) => `${s.lives} ${label}: turned pro ${pct(s.pro, s.lives)}, past the middle of the ladder ${pct(s.pastMiddle, s.lives)}, legend ${pct(s.top, s.lives)}, mean rating ${per(s.ratingSum, s.seasons)}`;
  lines.push(`  talent: ${row('careers with a fitting talent', r.talent)}`);
  lines.push(`          ${row('without', r.none)}`);
  lines.push(`  seasons played: youth ${r.seasons.youth}, school ${r.seasons.school}, college ${r.seasons.college}, pro ${r.seasons.pro}`);
  lines.push(
    `  draft: ${r.drafted.declared} declared; ${r.drafted.picked} picked (${r.drafted.firstRound} in the first round), ${r.drafted.undrafted} undrafted; ${r.drafted.signed} signed a first pro deal (${pct(r.drafted.signed, r.entered)} of careers)`,
  );
  lines.push(
    `  pro careers: ${r.proCareers.length}; years in the pros mean ${per(sum(r.proCareers), r.proCareers.length)}, median ${median(r.proCareers)}, 90th percentile ${percentile(r.proCareers, 0.9)}; last season at a mean age of ${per(sum(r.proEndAges), r.proEndAges.length)}`,
  );
  lines.push(
    `  how careers ended: aged out ${r.ended.agedOut}, shut out ${r.ended.stalled}, injury ${r.ended.injury}, retired ${r.ended.retired}; routes: coaching ${r.ended.coaching}, broadcasting ${r.ended.broadcast}, normal career ${r.ended.normal}; still playing at death ${r.ended.stillPlaying}`,
  );
  lines.push(
    `  injuries: ${r.injuries.total} (${per(100 * r.injuries.total, Math.max(1, r.seasons.youth + r.seasons.school + r.seasons.college + r.seasons.pro), 1)} per 100 seasons), serious ${r.injuries.serious}, career-ending ${r.injuries.careerEnding}, worn joints in ${r.injuries.wornLives} lives`,
  );
  lines.push(`  playing through pain: ${r.pain.decisions} times, the injury was worse or the career over the year after ${pct(r.pain.worse, r.pain.decisions)} of the time; resting: ${r.pain.rested} times, worse ${pct(r.pain.restedWorse, r.pain.rested)}`);
  lines.push(
    `  contracts: trades ${r.contracts.trades}, releases ${r.contracts.releases}; asked for a trade ${r.contracts.asked.trade} times, ${r.contracts.asked.granted} granted; suspensions ${r.suspensions}`,
  );
  lines.push(
    `  pro titles: ${r.titles.lives} lives won one (${pct(r.titles.lives, r.proCareers.length)} of pro careers), ${r.titles.total} in all; finals reached ${r.titles.finals}; playoffs reached in ${pct(r.titles.playoffs, r.seasons.pro)} of pro seasons; all-stars ${pct(r.allStarLives, r.proCareers.length)}, MVP-level award ${pct(r.mvpLives, r.proCareers.length)} of pro careers`,
  );
  lines.push(
    `  earnings: ${r.earnings.lives} pro careers earned ${dollars(r.earnings.total)} in salary; median career ${dollars(median(r.earnings.byPeak.flat()))}; by highest rung: ${r.earnings.byPeak.map((v, i) => (v.length === 0 ? '' : `${i + 1}: ${dollars(median(v))} (${v.length})`)).filter(Boolean).join(', ')}`,
  );
  lines.push(`  under 18 in the pros or under a pro contract: ${r.underAgePros}`);
  lines.push(`  sports events: ${sum(Object.values(r.events))} in ${Object.keys(r.events).length} kinds; invariant failures about sports: ${r.invariantFailures}`);
  return lines;
}

/** The E6c targets (balance/targets.yaml, sports). */
export function sportsTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.sports;
  const r = report.sports;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('anyone under 18 in the pros or under a pro contract', r.underAgePros, t.underAgePros, (n) => n.toFixed(0));
  if (report.player !== 'athlete') return out;
  range('lives that start a sport', share(r.entered, r.lives), t.entered);
  range('careers with a fitting talent that turned pro', share(r.talent.pro, r.talent.lives), t.talentPro);
  range('careers without a fitting talent that turned pro', share(r.none.pro, r.none.lives), t.noTalentPro);
  range('careers with a fitting talent that went past the middle of the ladder', share(r.talent.pastMiddle, r.talent.lives), t.talentPastMiddle);
  range('careers without a fitting talent that went past the middle of the ladder', share(r.none.pastMiddle, r.none.lives), t.noTalentPastMiddle);
  range('careers that reached the top rung', share(r.talent.top + r.none.top, r.entered), t.legend);
  range('mean years in the pros', mean(r.proCareers), t.proYears, (n) => n.toFixed(1));
  range('mean age at the last pro season', mean(r.proEndAges), t.endAge, (n) => n.toFixed(1));
  range('injuries per 100 seasons', share(100 * r.injuries.total, r.seasons.youth + r.seasons.school + r.seasons.college + r.seasons.pro), t.injuriesPer100, (n) => n.toFixed(1));
  range('pro careers ended by an injury', share(r.ended.injury, r.proCareers.length), t.injuryEnded);
  range('playing through pain: share made worse the year after, as a multiple of resting', share(share(r.pain.worse, r.pain.decisions), Math.max(0.01, share(r.pain.restedWorse, r.pain.rested))), t.painRisk, (n) => n.toFixed(2));
  range('pro careers with a title', share(r.titles.lives, r.proCareers.length), t.titleLives);
  range('pro careers with an all-star season', share(r.allStarLives, r.proCareers.length), t.allStarLives);
  range('median pro career earnings', median(r.earnings.byPeak.flat()), t.medianEarnings, (n) => dollars(n));
  range('pro careers that reached a first deal after the draft or a signing', share(r.drafted.signed, r.entered), t.signedShare);
  return out;
}
