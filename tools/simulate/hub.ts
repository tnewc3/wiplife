/**
 * The Career hub, simulated and measured (C2). The multi-career player plays a sport as a child, tries others, starts a band beside
 * it, rehearses, auditions and hires bandmates, works at several roles at once (now and then all in), and some adults take performance
 * enhancers. The watcher compares each year's state before and after `beginYear`, so nothing here touches the engine.
 *
 * Reported: lives with several careers at once, the load and how often it is more than a person can carry, burnout, what gave, the
 * skill curve by years since a skill was first used (and that none ever falls under its floor), sports switching by young players,
 * band auditions by fame, bandmates' skill growth, enhancers and their tests, and the burnout relieved by leisure.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { skillFloor } from '../../src/engine/hub/skills';
import { activeRoles, ROLE_IDS } from '../../src/engine/hub/load';
import { allSports } from '../../src/engine/sports/query';
import { teamOptions } from '../../src/engine/sports/tryout';
import { currentPool } from '../../src/engine/hub/band';
import { bandFame } from '../../src/engine/hub/pool';
import { chance, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { LifeState, RoleId } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type HubAction = [LifeActionId, LifeActionParams];

export interface HubProfile {
  /** When the child first tries a sport (0 never). */
  sportAge: number;
  switches: number;
  quits: number;
  band: number;
  rehearses: number;
  pushes: number;
  enhancers: number;
}

export function rollHubProfile(rng: RngState): HubProfile {
  return {
    sportAge: pick(rng, [8, 10, 12, 13, 14]),
    switches: pick(rng, [0, 0.15, 0.3, 0.5]),
    quits: pick(rng, [0, 0.05, 0.1]),
    band: pick(rng, [0.2, 0.5, 0.8]),
    rehearses: pick(rng, [0, 0.5, 1]),
    pushes: pick(rng, [0, 0.15, 0.3]),
    enhancers: pick(rng, [0, 0, 0.1, 0.3]),
  };
}

const FAME_BUCKETS = ['0–9', '10–29', '30–59', '60+'] as const;
const bucket = (fame: number): number => (fame < 10 ? 0 : fame < 30 ? 1 : fame < 60 ? 2 : 3);
const CURVE_YEARS = 16;

export interface HubReport {
  player: string;
  lives: number;
  personYears: number;
  /** Years with a given number of roles (0 to 5 or more). */
  roleCount: number[];
  roleYears: Record<string, number>;
  multiCareerLives: number;
  loadSum: number;
  loadYears: number;
  loadBands: [number, number, number, number];
  overYears: number;
  peakLoad: number;
  burnoutSum: number;
  burnoutPeak: number;
  burnoutHigh: number;
  gave: Record<string, number>;
  /** Stress change in a year over the load, and under it. */
  stress: { overSum: number; overN: number; underSum: number; underN: number };
  /** Mean performance penalty in over years, and the lives that were job holders over the load. */
  penaltySum: number;
  skills: { curveSum: number[]; curveN: number[]; kept: number; floorExamples: string[]; first: number; faded: number; floorViolations: number; atFloor: number };
  switching: { youthSportLives: number; switchers: number; switches: number; quits: number; tryoutsWhileYoung: number };
  band: { lives: number; auditions: number; hired: number; rehearsals: number; poolSum: number[]; poolN: number[]; poolMax: number[]; members: number; growthSum: number; startedWeak: number; becameGood: number };
  enhancers: { users: number; years: number; tests: number; positives: number };
  relieved: number;
}

export function emptyHubReport(player: string): HubReport {
  const zeros = (n: number) => Array.from({ length: n }, () => 0);
  return {
    player,
    lives: 0,
    personYears: 0,
    roleCount: zeros(6),
    roleYears: Object.fromEntries(ROLE_IDS.map((r) => [r, 0])),
    multiCareerLives: 0,
    loadSum: 0,
    loadYears: 0,
    loadBands: [0, 0, 0, 0],
    overYears: 0,
    peakLoad: 0,
    burnoutSum: 0,
    burnoutPeak: 0,
    burnoutHigh: 0,
    gave: { grades: 0, job: 0, bench: 0, band: 0 },
    stress: { overSum: 0, overN: 0, underSum: 0, underN: 0 },
    penaltySum: 0,
    skills: { curveSum: zeros(CURVE_YEARS), curveN: zeros(CURVE_YEARS), kept: 0, floorExamples: [], first: 0, faded: 0, floorViolations: 0, atFloor: 0 },
    switching: { youthSportLives: 0, switchers: 0, switches: 0, quits: 0, tryoutsWhileYoung: 0 },
    band: { lives: 0, auditions: 0, hired: 0, rehearsals: 0, poolSum: zeros(4), poolN: zeros(4), poolMax: zeros(4), members: 0, growthSum: 0, startedWeak: 0, becameGood: 0 },
    enhancers: { users: 0, years: 0, tests: 0, positives: 0 },
    relieved: 0,
  };
}

export class HubWatcher {
  private multi = false;
  private youthSport = false;
  private switched = false;
  private hadBand = false;
  /** Year a skill was first seen, by key. */
  private seen = new Map<string, number>();
  private levels = new Map<string, number>();
  private series = new Map<string, [number, number][]>();
  private usedYears = new Map<string, number>();
  private members = new Map<string, { first: number; last: number }>();
  private usedEnhancers = false;
  private lastTotals = { rehearsals: 0, auditions: 0, hired: 0, sportSwitches: 0 };
  private lastGave = 0;
  constructor(private readonly report: HubReport, private readonly content: ContentBundle) {}

  /** Called after the player takes an action. */
  acted(actionId: LifeActionId, after: LifeState): void {
    const r = this.report;
    if (actionId === 'quit_sport') r.switching.quits++;
    if (actionId === 'find_members') {
      const pool = currentPool(after);
      if (!pool) return;
      const b = bucket(bandFame(after));
      for (const c of pool.candidates) {
        r.band.poolSum[b]! += c.skill;
        r.band.poolN[b]!++;
        r.band.poolMax[b] = Math.max(r.band.poolMax[b]!, c.skill);
      }
    }
  }

  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const h = after.hub;
    r.personYears++;
    const roles = activeRoles(after, this.content);
    r.roleCount[Math.min(5, roles.length)]!++;
    for (const role of roles) r.roleYears[role]!++;
    if (roles.length >= 2) this.multi = true;
    if (roles.length > 0) {
      r.loadYears++;
      r.loadSum += h.load;
      r.peakLoad = Math.max(r.peakLoad, h.load);
      const c = this.content.balance.careers.hub.comfortable;
      const band = h.load < c * 0.55 ? 0 : h.load < c * 0.9 ? 1 : h.load <= c ? 2 : 3;
      r.loadBands[band]!++;
      const dStress = after.character.stats.stress - before.character.stats.stress;
      if (h.load > c) {
        r.overYears++;
        r.stress.overSum += dStress;
        r.stress.overN++;
      } else {
        r.stress.underSum += dStress;
        r.stress.underN++;
      }
      r.burnoutSum += h.burnout;
      r.burnoutPeak = Math.max(r.burnoutPeak, h.burnout);
      if (h.burnout >= 60) r.burnoutHigh++;
    }
    if (h.gave && h.gave.year === after.currentYear && this.lastGave !== after.currentYear) {
      r.gave[h.gave.what]!++;
      this.lastGave = after.currentYear;
    }

    // Sports switching by young players.
    if (after.character.age < this.content.balance.careers.hub.youthAge && after.sports.sport !== null && after.fame.active) {
      if (!this.youthSport) r.switching.youthSportLives++;
      this.youthSport = true;
    }
    const switches = h.totals.sportSwitches;
    if (switches > this.lastTotals.sportSwitches) {
      r.switching.switches += switches - this.lastTotals.sportSwitches;
      if (!this.switched) r.switching.switchers++;
      this.switched = true;
    }
    this.lastTotals.sportSwitches = switches;

    // Skills: the curve by years since first use, and that none is under the floor of its own peak.
    const fade = this.content.balance.skills.fade;
    const mark = (key: string, level: number, peak: number, last: number) => {
      if (!this.seen.has(key)) {
        this.seen.set(key, after.currentYear);
        r.skills.first++;
      }
      const idx = Math.min(CURVE_YEARS - 1, after.currentYear - this.seen.get(key)!);
      const series = this.series.get(key) ?? [];
      series.push([idx, level]);
      this.series.set(key, series);
      if (last === after.currentYear) this.usedYears.set(key, (this.usedYears.get(key) ?? 0) + 1);
      const prev = this.levels.get(key);
      if (prev !== undefined && level < prev - 0.001) r.skills.faded++;
      this.levels.set(key, level);
      if (level + 0.001 < skillFloor(peak, this.content)) {
        r.skills.floorViolations++;
        if (r.skills.floorExamples.length < 5) r.skills.floorExamples.push(`${key} level ${level} peak ${peak} last ${last} year ${after.currentYear}`);
      }
      if (after.currentYear - last >= fade.idleYears && level <= skillFloor(peak, this.content) + 0.001) r.skills.atFloor++;
    };
    for (const [key, rec] of Object.entries(h.skills)) mark(key, rec.level, rec.peak, rec.last);
    for (const [pathId, path] of Object.entries(after.fame.paths)) {
      for (const [skillId, level] of Object.entries(path.skills ?? {})) {
        const m = h.marks[`${pathId}.${skillId}`];
        if (m) mark(`${pathId}.${skillId}`, level, Math.max(level, m.peak), m.last);
      }
    }

    // The band.
    const band = after.fame.band;
    if (band) {
      if (!this.hadBand) r.band.lives++;
      this.hadBand = true;
      for (const m of band.members) {
        const seen = this.members.get(m.id);
        if (!seen) this.members.set(m.id, { first: m.skill, last: m.skill });
        else seen.last = m.skill;
      }
    }
    const t = h.totals;
    r.band.rehearsals += t.rehearsals - this.lastTotals.rehearsals;
    r.band.auditions += t.auditions - this.lastTotals.auditions;
    r.band.hired += t.hired - this.lastTotals.hired;
    this.lastTotals = { ...this.lastTotals, rehearsals: t.rehearsals, auditions: t.auditions, hired: t.hired };
    if (h.enhancers.on && !this.usedEnhancers) {
      r.enhancers.users++;
      this.usedEnhancers = true;
    }
    if (h.enhancers.on) r.enhancers.years++;
  }

  finish(life: LifeState): void {
    const r = this.report;
    r.lives++;
    if (this.multi) r.multiCareerLives++;
    for (const m of this.members.values()) {
      r.band.members++;
      r.band.growthSum += m.last - m.first;
      if (m.first < 30) {
        r.band.startedWeak++;
        if (m.last >= 50) r.band.becameGood++;
      }
    }
    // The skill curve counts the skills that were used in three or more years (a skill tried once and dropped only fades).
    for (const [key, series] of this.series) {
      if ((this.usedYears.get(key) ?? 0) >= 3) {
        r.skills.kept++;
        for (const [idx, level] of series) {
          r.skills.curveSum[idx]! += level;
          r.skills.curveN[idx]!++;
        }
      }
    }
    r.enhancers.tests += life.hub.enhancers.tests;
    r.enhancers.positives += life.hub.enhancers.positives;
    r.relieved += life.hub.totals.relieved;
  }
}

/** What the multi-career player does between years. */
export function chooseHubActions(life: LifeState, content: ContentBundle, rng: RngState, p: HubProfile): HubAction[] {
  const out: HubAction[] = [];
  const age = life.character.age;
  const f = life.fame;
  const youth = age < content.balance.careers.hub.youthAge;
  const sports = allSports(content);

  // A child tries a sport; a young player may switch or quit.
  const tryFor = (sportId: string): HubAction | null => {
    const def = sports.find((s) => s.id === sportId);
    if (!def) return null;
    const options = teamOptions(life, def, content).filter((o) => o.block === null && o.level !== 'pro');
    if (options.length === 0) return null;
    return ['try_out', { pathId: sportId, teamKey: pick(rng, options).key }];
  };
  if (youth && age >= p.sportAge) {
    if (life.sports.sport === null || !f.active) {
      const action = tryFor(pick(rng, sports).id);
      if (action) out.push(action);
    } else if (f.main === life.sports.sport) {
      if (chance(rng, p.switches)) {
        const others = sports.filter((s) => s.id !== life.sports.sport);
        const action = tryFor(pick(rng, others).id);
        if (action) out.push(action);
      } else if (chance(rng, p.quits)) out.push(['quit_sport', {}]);
    }
  }

  // A band beside it.
  if (age >= 13 && chance(rng, p.band)) {
    if (!f.active && age >= 14) out.push(['enter_fame', { pathId: 'music', routeId: 'band' }]);
    else if (f.active && f.second === null && f.main !== null && content.famePaths[f.main]?.sport !== undefined) out.push(['cross_over', { pathId: 'music' }]);
    if (f.active && f.band === null && (f.paths.music !== undefined)) out.push(['form_band', { bandName: pick(rng, ['The Night Shift', 'Slow Burn', 'Static Bloom', 'Loud Neighbours', 'Paper Planes', 'Low Tide']) }]);
  }
  if (f.band) {
    if (f.band.leader === 'you') {
      {
        const open = (content.famePaths[f.band.path]?.instruments ?? []).find((i) => !f.band!.members.some((m) => m.part === i.id) && i.id !== f.band!.part);
        // Auditions, then the best of those who came (the list is sorted best first).
        if (open && chance(rng, 0.6)) out.push(['find_members', { part: open.id }], ['hire_member', { index: 0 }]);
      }
    }
    const budget = content.balance.skills.band.sessions[life.hub.commit.band ?? 'steady'];
    const sessions = Math.round(budget * p.rehearses);
    for (let i = 0; i < sessions; i++) out.push(['rehearse', {}]);
  }

  // How hard it works at each role, now and then.
  if (chance(rng, 0.25)) {
    const roles = activeRoles(life, content);
    if (roles.length > 0) out.push(['set_role_commit', { roleId: pick(rng, roles) as RoleId, commitment: pick(rng, ['back', 'steady', 'steady', 'all'] as const) }]);
  }

  // Adults on a gig beside everything else.
  if (age >= 18 && life.career.job === null && !life.career.gig && chance(rng, p.pushes)) out.push(['start_gig', {}]);

  // Enhancers for an adult who plays.
  if (life.hub.enhancers.on) {
    if (chance(rng, 0.2)) out.push(['stop_enhancers', {}]);
  } else if (age >= 18 && chance(rng, p.enhancers)) out.push(['start_enhancers', {}]);
  void nextInt;
  // A hire waits for its audition: it is checked when it is taken.
  return out.filter(([id, params]) => id === 'hire_member' || isLifeActionAvailable(life, id, params, content));
}

export function formatHub(r: HubReport, content: ContentBundle): string[] {
  const share = (n: number, d: number) => (d === 0 ? '–' : `${((n / d) * 100).toFixed(1)}%`);
  const mean = (n: number, d: number, digits = 1) => (d === 0 ? '–' : (n / d).toFixed(digits));
  const lines: string[] = [];
  lines.push('', 'Career hub (C2):');
  lines.push(`  lives: ${r.lives}; person-years watched ${r.personYears}`);
  lines.push(`  years by number of roles: ${r.roleCount.map((n, i) => `${i === 5 ? '5+' : i}: ${n}`).join(', ')}`);
  lines.push(`  roles (person-years): ${ROLE_IDS.map((id) => `${id} ${r.roleYears[id]}`).join(', ')}`);
  lines.push(`  lives with two or more careers in a year: ${r.multiCareerLives} (${share(r.multiCareerLives, r.lives)})`);
  lines.push(`  load: mean ${mean(r.loadSum, r.loadYears)} over ${r.loadYears} years with a role; peak ${r.peakLoad}; comfortable ${content.balance.careers.hub.comfortable}`);
  lines.push(`  years by load: light ${r.loadBands[0]}, steady ${r.loadBands[1]}, heavy ${r.loadBands[2]}, more than they can carry ${r.loadBands[3]} (${share(r.overYears, r.loadYears)})`);
  lines.push(`  burnout: mean ${mean(r.burnoutSum, r.loadYears)}, peak ${r.burnoutPeak}, years at 60 or more ${r.burnoutHigh} (${share(r.burnoutHigh, r.loadYears)})`);
  lines.push(`  Stress change in a year: over the load ${mean(r.stress.overSum, r.stress.overN, 2)}, under it ${mean(r.stress.underSum, r.stress.underN, 2)}`);
  lines.push(`  what gave under the load: grades ${r.gave.grades}, job ${r.gave.job}, benched ${r.gave.bench}, band ${r.gave.band}`);
  lines.push(`  burnout lowered by leisure and rest: ${r.relieved} points in all`);
  const curve = r.skills.curveSum.map((s, i) => (r.skills.curveN[i]! === 0 ? null : `${i}y ${(s / r.skills.curveN[i]!).toFixed(0)}`)).filter((x) => x !== null);
  lines.push(`  skills: ${r.skills.first} started, ${r.skills.kept} used in three or more years; mean level of those by years since first used: ${curve.join(', ')}`);
  lines.push(`  skill years that faded ${r.skills.faded}; skills resting at their floor ${r.skills.atFloor}; years under the floor of their own peak ${r.skills.floorViolations}`);
  for (const example of r.skills.floorExamples) lines.push(`    under the floor: ${example}`);
  lines.push(`  young players: ${r.switching.youthSportLives} played a sport; ${r.switching.switchers} switched (${share(r.switching.switchers, r.switching.youthSportLives)}); ${r.switching.switches} switches, ${r.switching.quits} quits`);
  lines.push(`  bands: ${r.band.lives} lives (${share(r.band.lives, r.lives)}); auditions held ${r.band.auditions}, hired ${r.band.hired}, rehearsals ${r.band.rehearsals}`);
  lines.push(`  audition pool by your fame: ${FAME_BUCKETS.map((b, i) => `${b} mean ${mean(r.band.poolSum[i]!, r.band.poolN[i]!, 0)} best ${r.band.poolMax[i]}`).join('; ')}`);
  lines.push(`  bandmates: ${r.band.members}; mean skill gained ${mean(r.band.growthSum, r.band.members)}; of ${r.band.startedWeak} who began under 30, ${r.band.becameGood} reached 50`);
  lines.push(`  enhancers: ${r.enhancers.users} lives, ${r.enhancers.years} years; ${r.enhancers.tests} tests, ${r.enhancers.positives} positive`);
  return lines;
}

export function hubTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.hub;
  const r = report.hub;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('skill years under the floor of their own peak', r.skills.floorViolations, t.floorViolations, (n) => n.toFixed(0));
  if (report.player !== 'hub') return out;
  range('lives with two or more careers in a year', share(r.multiCareerLives, r.lives), t.multiCareerLives);
  range('years over the load they can carry', share(r.overYears, r.loadYears), t.overLoadYears);
  range('mean burnout in years with a role', share(r.burnoutSum, r.loadYears), t.meanBurnout, (n) => n.toFixed(1));
  range('young players who play a sport and switch', share(r.switching.switchers, r.switching.youthSportLives), t.youthSwitchers);
  range('lives with a band', share(r.band.lives, r.lives), t.bands);
  range('mean skill a bandmate gains', share(r.band.growthSum, r.band.members), t.memberGrowth, (n) => n.toFixed(1));
  range('enhancer users who failed a test', share(r.enhancers.positives, Math.max(1, r.enhancers.users)), t.testedPositive);
  return out;
}
