/**
 * The lives of the people you know, measured (E3): how often they get jobs,
 * lose them, move up, date, marry, divorce, move, have children, fall ill,
 * get arrested, develop addictions and recover, set beside the player's own
 * rates in the same run; how many requests reach you and how much of your
 * year they take; how long the news feed is; that romance only ever involves
 * adults; and how long a year takes to begin. The watcher compares each
 * year's state before and after `beginYear`, so nothing here touches the
 * engine.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { produce } from 'immer';
import { beginYear, createLife } from '../../src/engine/life';
import type { LifeState, Person } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

/** Kinds whose lives are followed as "people you know" for the cohort rates (family and friends, not your own partner or children). */
const COHORT_KINDS = new Set(['friend', 'sibling', 'classmate', 'acquaintance']);

export interface PeopleReport {
  lives: number;
  /** Life-years watched, and those at the age requests reach you. */
  years: number;
  requestYears: number;
  /** Person-years by tier. */
  tiers: { close: number; near: number; far: number };
  work: {
    /** Close people of working age (18 to 64, not in your household's care...) and how many had a job. */
    workingYears: number;
    employedYears: number;
    /** Years with a job at the start of the year, and what happened in them. */
    jobYears: number;
    promoted: number;
    fired: number;
    laidOff: number;
    hired: number;
    retired: number;
    switched: number;
    /** Wealth level changes, up and down. */
    wealthUp: number;
    wealthDown: number;
  };
  love: {
    /** Adult person-years with a love life (not your partner, not the older generation). */
    singleYears: number;
    marriedYears: number;
    started: number;
    engaged: number;
    married: number;
    brokeUp: number;
    divorced: number;
    widowed: number;
  };
  moves: { adultYears: number; moves: number };
  children: { births: number; coupleYears: number };
  trouble: {
    adultYears: number;
    illnesses: number;
    seriousIllnesses: number;
    addictionsStarted: number;
    relapses: number;
    arrests: number;
    /** Arrests among adults 18 to 64, and the years behind them. */
    arrestsAdult: number;
    arrestYears: number;
    jailed: number;
    bailed: number;
    recovered: number;
    diedWithAddiction: number;
    needCare: number;
  };
  /** People first seen young (24 or under) who reached 40 or 45 while you knew them. */
  cohort: { reached40: number; marriedBy40: number; hadAddiction: number; reached45: number; marriedBy45: number; childrenOfMarried: number };
  /** The player's own rates in the same run, watched the same way. */
  player: { adultYears: number; moves: number; arrests: number; marriedYears: number; divorces: number };
  requests: { total: number; byTrigger: Record<string, number>; events: number; carded: number; maxInAYear: number };
  news: { years: number; lines: number; byKind: Record<string, number>; mostInAYear: number };
  /** Romance involving anyone under the adult age, anywhere (must be zero). */
  underageRomance: number;
  timing: { years: number; totalMs: number; maxMs: number; stepMs: Record<string, number> };
  /** Living people outside family and romance who are still in your life, counted just after the yearly pruning: the most in any year. */
  crowd: { most: number };
  /** A full circle simulated: milliseconds for one beginYear, over the runs. */
  fullCircle: { people: number; meanMs: number; maxMs: number } | null;
}

export function emptyPeopleReport(): PeopleReport {
  return {
    lives: 0,
    years: 0,
    requestYears: 0,
    tiers: { close: 0, near: 0, far: 0 },
    work: { workingYears: 0, employedYears: 0, jobYears: 0, promoted: 0, fired: 0, laidOff: 0, hired: 0, retired: 0, switched: 0, wealthUp: 0, wealthDown: 0 },
    love: { singleYears: 0, marriedYears: 0, started: 0, engaged: 0, married: 0, brokeUp: 0, divorced: 0, widowed: 0 },
    moves: { adultYears: 0, moves: 0 },
    children: { births: 0, coupleYears: 0 },
    trouble: { adultYears: 0, illnesses: 0, seriousIllnesses: 0, addictionsStarted: 0, relapses: 0, arrests: 0, arrestsAdult: 0, arrestYears: 0, jailed: 0, bailed: 0, recovered: 0, diedWithAddiction: 0, needCare: 0 },
    cohort: { reached40: 0, marriedBy40: 0, hadAddiction: 0, reached45: 0, marriedBy45: 0, childrenOfMarried: 0 },
    player: { adultYears: 0, moves: 0, arrests: 0, marriedYears: 0, divorces: 0 },
    requests: { total: 0, byTrigger: {}, events: 0, carded: 0, maxInAYear: 0 },
    news: { years: 0, lines: 0, byKind: {}, mostInAYear: 0 },
    underageRomance: 0,
    timing: { years: 0, totalMs: 0, maxMs: 0, stepMs: {} },
    crowd: { most: 0 },
    fullCircle: null,
  };
}

const WEALTH = ['poor', 'working', 'middle', 'affluent', 'rich'];

interface Tracked {
  firstAge: number;
  kind: string;
  everMarried: boolean;
  everAddiction: boolean;
  reached40: boolean;
  reached45: boolean;
  children: number;
}

/** Watches one life, year by year. */
export class PeopleWatcher {
  private readonly tracked = new Map<string, Tracked>();
  private prevCity: string | undefined;
  private prevRecord = 0;
  private prevMarried: string | null = null;
  private readonly requestEvents: Map<string, string>;

  constructor(
    private readonly report: PeopleReport,
    private readonly content: ContentBundle,
  ) {
    this.requestEvents = new Map(
      Object.entries(content.registries.people.requests).flatMap(([trigger, r]) => r.events.map((id) => [id, trigger] as const)),
    );
  }

  /** The life, as one year was about to begin and right after it did (events picked). */
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const bal = this.content.balance.people;
    const { adultAge } = this.content.balance.relationships;
    const year = after.currentYear;
    const age = after.character.age;
    r.years++;
    if (age >= bal.requests.minAge) r.requestYears++;

    // The player's own rates, the same way.
    if (age >= adultAge && age < 65) {
      r.player.adultYears++;
      if (this.prevCity !== undefined && before.character.cityId !== this.prevCity) r.player.moves++;
      if (before.legal.record.length > this.prevRecord) r.player.arrests += before.legal.record.length - this.prevRecord;
    }
    this.prevCity = after.character.cityId;
    this.prevRecord = after.legal.record.length;
    const spouse = Object.values(before.relationships).find((rel) => rel.kind === 'spouse' && rel.status === 'active' && before.people[rel.personId]?.alive);
    if (spouse) r.player.marriedYears++;
    if (this.prevMarried !== null && !spouse && before.relationships[this.prevMarried]?.kind === 'ex' && before.people[this.prevMarried]?.alive) r.player.divorces++;
    this.prevMarried = spouse ? spouse.personId : null;

    // The people you know.
    for (const id of Object.keys(after.people).sort()) {
      const p = after.people[id]!;
      const pb = before.people[id];
      const rel = after.relationships[id];
      if (!rel || !p.life) continue;
      const pAge = year - p.birthYear;
      const life = p.life;
      // Romance involving anyone under the adult age: never.
      if (life.partner && (pAge < adultAge || life.partner.since - p.birthYear < adultAge || life.partner.since - life.partner.birthYear < adultAge)) r.underageRomance++;
      if (['partner', 'fiance', 'spouse'].includes(rel.kind) && pAge < adultAge) r.underageRomance++;

      this.track(id, p, pAge, rel.kind, rel.status !== 'ended');
      if (!pb || !pb.alive) continue;
      if (!pb.life || rel.status === 'ended') continue;
      if (!p.alive) {
        if (pb.life.troubles.some((t) => t.kind === 'addiction')) r.trouble.diedWithAddiction++;
        continue;
      }
      const lb = pb.life;
      r.tiers[life.tier]++;

      // Work.
      const kind = rel.kind;
      const works = life.tier === 'close' && pAge >= adultAge && pAge < 65 && !p.child && kind !== 'coworker' && kind !== 'boss';
      if (works) {
        r.work.workingYears++;
        if (p.occupation !== undefined) r.work.employedYears++;
      }
      if (life.tier === 'close' && !p.child && kind !== 'coworker' && kind !== 'boss' && pAge >= adultAge) {
        if (pb.occupation !== undefined) {
          r.work.jobYears++;
          if (p.occupation === pb.occupation && life.level > lb.level) r.work.promoted++;
          else if (p.occupation === undefined && life.jobLost?.year === year) {
            if (life.jobLost.how === 'fired') r.work.fired++;
            else r.work.laidOff++;
          } else if (p.occupation === undefined && life.retired && !lb.retired) r.work.retired++;
          else if (p.occupation !== undefined && p.occupation !== pb.occupation) r.work.switched++;
        } else if (p.occupation !== undefined) {
          r.work.hired++;
        }
        const dw = WEALTH.indexOf(p.wealthLevel) - WEALTH.indexOf(pb.wealthLevel);
        if (dw > 0) r.work.wealthUp++;
        if (dw < 0) r.work.wealthDown++;
      }

      // Love and children.
      const loves = pAge >= adultAge && !['partner', 'fiance', 'spouse', 'ex', 'parent', 'stepparent', 'grandparent', 'relative'].includes(kind);
      if (loves) {
        if (lb.partner?.status === 'married') r.love.marriedYears++;
        else r.love.singleYears++;
        if (!lb.partner && life.partner) r.love.started++;
        if (lb.partner?.status === 'dating' && life.partner?.status === 'engaged') r.love.engaged++;
        if (lb.partner && lb.partner.status !== 'married' && life.partner?.status === 'married') r.love.married++;
        if (lb.partner && !life.partner && life.ended?.year === year) {
          if (life.ended.how === 'broke_up') r.love.brokeUp++;
          else if (life.ended.how === 'divorced') r.love.divorced++;
          else r.love.widowed++;
        }
        if (life.partner) r.children.coupleYears++;
        if (life.children.length > lb.children.length) r.children.births += life.children.length - lb.children.length;
      }

      // Moving.
      if (pAge >= adultAge && pAge < 65 && !p.child && !['partner', 'fiance', 'spouse'].includes(kind)) {
        r.moves.adultYears++;
        if (p.cityId !== pb.cityId) r.moves.moves++;
      }

      // Trouble.
      if (pAge >= adultAge) {
        r.trouble.adultYears++;
        for (const t of life.troubles) {
          const was = lb.troubles.find((x) => x.kind === t.kind && x.refId === t.refId);
          if (was) {
            if (t.kind === 'crime' && t.stage === 'bailed' && was.stage === 'held') r.trouble.bailed++;
            if (t.kind === 'crime' && t.stage === 'jail' && was.stage !== 'jail') r.trouble.jailed++;
            continue;
          }
          if (t.kind === 'illness') {
            r.trouble.illnesses++;
            if (t.severity >= bal.trouble.serious) r.trouble.seriousIllnesses++;
          } else if (t.kind === 'addiction') {
            if (lb.recovered.some((x) => x.refId === t.refId)) r.trouble.relapses++;
            else r.trouble.addictionsStarted++;
          } else {
            r.trouble.arrests++;
          }
        }
        if (life.recovered.length > lb.recovered.length) r.trouble.recovered++;
        if (lb.care === undefined && life.care === 'needed') r.trouble.needCare++;
      }
      if (pAge >= adultAge && pAge < 65) {
        r.trouble.arrestYears++;
        if (life.troubles.some((t) => t.kind === 'crime' && t.since === year)) r.trouble.arrestsAdult++;
      }
    }

    // Requests that became cards, and the news.
    const asked = after.pending.filter((e) => this.requestEvents.has(e.eventId));
    r.requests.total += asked.length;
    r.requests.carded += asked.length;
    r.requests.events += after.pending.length;
    r.requests.maxInAYear = Math.max(r.requests.maxInAYear, asked.length);
    for (const e of asked) {
      const trigger = this.requestEvents.get(e.eventId)!;
      r.requests.byTrigger[trigger] = (r.requests.byTrigger[trigger] ?? 0) + 1;
    }
    const news = after.news.find((n) => n.year === year);
    if (news) {
      r.news.years++;
      r.news.lines += news.lines.length;
      r.news.mostInAYear = Math.max(r.news.mostInAYear, news.lines.length);
      for (const line of news.lines) r.news.byKind[line.kind] = (r.news.byKind[line.kind] ?? 0) + 1;
    }
  }

  /** `stepped`: they are still in your life (a person who faded out isn't followed, so what happens to them later isn't known). */
  private track(id: string, p: Person, age: number, kind: string, stepped: boolean): void {
    let t = this.tracked.get(id);
    if (!t) {
      t = { firstAge: age, kind, everMarried: false, everAddiction: false, reached40: false, reached45: false, children: 0 };
      this.tracked.set(id, t);
    }
    const life = p.life!;
    if (life.partner?.status === 'married' || life.ended?.how === 'divorced' || life.ended?.how === 'widowed') t.everMarried = true;
    if (life.troubles.some((x) => x.kind === 'addiction') || life.recovered.length > 0) t.everAddiction = true;
    t.children = Math.max(t.children, life.children.length);
    if (stepped && p.alive && age >= 40) t.reached40 = true;
    if (stepped && p.alive && age >= 45) t.reached45 = true;
  }

  /** The life is over: the cohort of people first seen young. */
  finish(): void {
    const c = this.report.cohort;
    for (const t of this.tracked.values()) {
      if (!COHORT_KINDS.has(t.kind) || t.firstAge > 24) continue;
      if (t.reached40) {
        c.reached40++;
        if (t.everMarried) c.marriedBy40++;
        if (t.everAddiction) c.hadAddiction++;
      }
      if (t.reached45) {
        c.reached45++;
        if (t.everMarried) {
          c.marriedBy45++;
          c.childrenOfMarried += t.children;
        }
      }
    }
    this.report.lives++;
  }
}

/** People outside family and romance who are still in your life (your boss stays while you work): what the pruning keeps within `maxPeople`. */
function crowdSize(life: LifeState): number {
  let n = 0;
  for (const rel of Object.values(life.relationships)) {
    if (rel.status !== 'active' || !life.people[rel.personId]?.alive) continue;
    if (FAMILY.has(rel.kind) || ROMANTIC.has(rel.kind)) continue;
    if (rel.kind === 'boss' && life.career.job !== null) continue;
    n++;
  }
  return n;
}
const FAMILY = new Set(['parent', 'stepparent', 'grandparent', 'relative', 'sibling', 'child', 'stepchild']);
const ROMANTIC = new Set(['partner', 'fiance', 'spouse', 'ex']);

/** Timing for beginYear: wraps the pipeline's steps so each one's time is kept. */
export class PipelineTimer {
  constructor(private readonly report: PeopleReport) {}

  /** Runs `fn` (a beginYear call) and records how long it took. */
  time<T>(fn: () => T): T {
    const t0 = performance.now();
    const out = fn();
    const ms = performance.now() - t0;
    const timing = this.report.timing;
    timing.years++;
    timing.totalMs += ms;
    timing.maxMs = Math.max(timing.maxMs, ms);
    return out;
  }

  /** The pipeline's steps, each timed into the report. */
  steps<T extends { id: string; run: (state: never, content: never) => void }>(steps: readonly T[]): T[] {
    return steps.map((step) => ({
      ...step,
      run: (state: never, content: never) => {
        const t0 = performance.now();
        step.run(state, content);
        this.report.timing.stepMs[step.id] = (this.report.timing.stepMs[step.id] ?? 0) + (performance.now() - t0);
        // The People list is pruned by the relationships step: count it right after.
        if (step.id === 'relationships') this.report.crowd.most = Math.max(this.report.crowd.most, crowdSize(state as unknown as LifeState));
      },
    }));
  }
}

/**
 * How long a year takes to begin with a full circle simulated: a life at 35
 * with `people` people around it (family, friends, coworkers; the circle is
 * capped by the People list), each one given a full life summary by the first
 * year. Times `years` beginYear calls on fresh copies and returns the mean
 * and the slowest, in milliseconds.
 */
export function measureFullCircle(content: ContentBundle, people: number, years: number): { people: number; meanMs: number; maxMs: number } {
  let life = createLife({ mode: 'random', seed: 'circle', birthYear: 2000 }, content);
  // Grow up to 35 without events getting in the way: only the date and age matter for the step.
  life = produce(life, (d) => {
    d.currentYear = d.birthYear + 35;
    d.character.age = 35;
    d.character.lifeStage = 'adult';
    const kinds = ['friend', 'friend', 'coworker', 'acquaintance', 'sibling', 'relative'] as const;
    const base = Object.values(d.people)[0]!;
    for (let i = 0; i < people; i++) {
      const id = `p${1000 + i}`;
      const kind = kinds[i % kinds.length]!;
      const age = 22 + (i % 40);
      d.people[id] = { ...JSON.parse(JSON.stringify(base)), id, name: { first: `Name${i}`, last: 'Circle' }, birthYear: d.currentYear - age, alive: true, tags: [kind], cityId: d.character.cityId };
      delete d.people[id]!.child;
      delete d.people[id]!.priorChildren;
      d.relationships[id] = { personId: id, kind, status: 'active', affection: 40 + (i % 50), trust: 50, memories: [], since: d.currentYear - 3 };
    }
  });
  // One year first, untimed: the first call pays for compiling the code, which isn't what a phone spends each year.
  beginYear(life, content);
  const times: number[] = [];
  for (let i = 0; i < years; i++) {
    const t0 = performance.now();
    const next = beginYear(life, content);
    times.push(performance.now() - t0);
    // Every run starts from the same circle one year on, so the work is the same each time.
    life = produce(life, (d) => {
      d.rng = next.rng;
      d.people = next.people;
      d.news = [];
    });
  }
  return { people, meanMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) };
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const pct2 = (x: number) => `${(100 * x).toFixed(2)}%`;
const per = (n: number, d: number) => (d > 0 ? n / d : 0);

/** The people report, as text. */
export function formatPeople(p: PeopleReport, content: ContentBundle, divorces = p.player.divorces): string[] {
  const lines: string[] = [];
  const w = p.work;
  const l = p.love;
  const t = p.trouble;
  lines.push(`People's own lives (E3; careful player): ${p.lives} lives, ${p.years} life-years, person-years: close ${p.tiers.close}, near ${p.tiers.near}, far ${p.tiers.far}`);
  lines.push(
    `  work (close people, ${w.workingYears} working-age years): ${pct(w.employedYears, w.workingYears)} had a job; per year worked (${w.jobYears}): promoted ${pct(w.promoted, w.jobYears)}, fired ${pct(w.fired, w.jobYears)}, laid off ${pct(w.laidOff, w.jobYears)}, changed track ${pct(w.switched, w.jobYears)}; hired ${w.hired}, retired ${w.retired}; wealth level up ${w.wealthUp}, down ${w.wealthDown}`,
  );
  lines.push(
    `  love (${l.singleYears + l.marriedYears} adult person-years, ${l.marriedYears} married): started dating ${l.started}, engaged ${l.engaged}, married ${l.married}, broke up ${l.brokeUp}, divorced ${l.divorced} (${pct2(per(l.divorced, l.marriedYears))} of married years; you: ${pct2(per(divorces, p.player.marriedYears))}), widowed ${l.widowed}`,
  );
  lines.push(
    `  married by 40: ${pct(p.cohort.marriedBy40, p.cohort.reached40)} of ${p.cohort.reached40} people first seen young; children of those who married and reached 45: ${per(p.cohort.childrenOfMarried, p.cohort.marriedBy45).toFixed(2)} (${p.cohort.marriedBy45} people); births ${p.children.births} in ${p.children.coupleYears} couple-years`,
  );
  lines.push(`  moves: ${pct2(per(p.moves.moves, p.moves.adultYears))} of adult years (you: ${pct2(per(p.player.moves, p.player.adultYears))})`);
  lines.push(
    `  trouble (${t.adultYears} adult person-years): illnesses ${t.illnesses} (${pct2(per(t.illnesses, t.adultYears))}; serious ${t.seriousIllnesses}), addictions ${t.addictionsStarted} (relapses ${t.relapses}, recovered ${t.recovered}, died with one ${t.diedWithAddiction}), arrests ${t.arrests} (${pct2(per(t.arrestsAdult, t.arrestYears))} of adult years 18-64; your record entries: ${pct2(per(p.player.arrests, p.player.adultYears))}), bailed ${t.bailed}, jailed ${t.jailed}, needing care ${t.needCare}`,
  );
  lines.push(`  people who had an addiction, of those first seen young who reached 40: ${pct(p.cohort.hadAddiction, p.cohort.reached40)}`);
  const triggers = Object.entries(p.requests.byTrigger)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  lines.push(
    `  requests that became cards: ${p.requests.total} (${per(p.requests.total, p.requestYears).toFixed(2)} a year from age ${content.balance.people.requests.minAge}; ${pct(p.requests.total, p.requests.events)} of all events; most in a year ${p.requests.maxInAYear}): ${triggers || 'none'}`,
  );
  const kinds = Object.entries(p.news.byKind)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .slice(0, 12)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  lines.push(`  news: ${p.news.years} years with news (${pct(p.news.years, p.years)} of years), ${per(p.news.lines, p.news.years).toFixed(2)} lines in those, most in a year ${p.news.mostInAYear}; commonest: ${kinds}`);
  lines.push(`  the People list: at most ${p.crowd.most} people outside family and romance after the yearly pruning (cap ${content.balance.relationships.prune.maxPeople})`);
  lines.push(`  romance involving anyone under ${content.balance.relationships.adultAge}: ${p.underageRomance}`);
  const tm = p.timing;
  const steps = Object.entries(tm.stepMs)
    .map(([id, ms]) => `${id} ${(ms / Math.max(1, tm.years)).toFixed(3)}`)
    .join(', ');
  lines.push(`  beginYear: ${(tm.totalMs / Math.max(1, tm.years)).toFixed(2)} ms on average over ${tm.years} years (slowest ${tm.maxMs.toFixed(1)} ms); by step, ms a year: ${steps}`);
  if (p.fullCircle) lines.push(`  beginYear with a full circle of ${p.fullCircle.people} people simulated: ${p.fullCircle.meanMs.toFixed(2)} ms on average (slowest ${p.fullCircle.maxMs.toFixed(1)} ms)`);
  return lines;
}

/** Each E3 target in balance/targets.yaml, measured on this report. */
export function peopleTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const p = sim.people;
  const t = content.balance.targets.people;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const range = (r: { min: number; max: number }, f: (x: number) => string) => `${f(r.min)}–${f(r.max)}`;
  const num = (x: number) => x.toFixed(2);
  const add = (label: string, value: number, shown: string, r: { min: number; max: number }, f: (x: number) => string) =>
    out.push({ label, value: shown, short: shown, goal: range(r, f), met: value >= r.min && value <= r.max });

  const employed = per(p.work.employedYears, p.work.workingYears);
  add('close people of working age with a job', employed, pct1(employed), t.employed, pct1);

  const c = sim.careers;
  const ratio = (people: number, player: number) => (player > 0 ? people / player : Number.NaN);
  const addRatio = (label: string, people: number, player: number, r: { min: number; max: number }, shown: (a: number, b: number) => string) => {
    const x = ratio(people, player);
    out.push({ label, value: `${shown(people, player)} → ${Number.isNaN(x) ? 'n/a' : num(x)}×`, short: Number.isNaN(x) ? 'n/a' : num(x), goal: `${num(r.min)}–${num(r.max)}× yours`, met: !Number.isNaN(x) && x >= r.min && x <= r.max });
  };
  const playerJob = (n: number) => per(n, c.jobYears);
  const peopleJob = (n: number) => per(n, p.work.jobYears);
  const two = (a: number, b: number) => `${pct2(a)} vs ${pct2(b)}`;
  addRatio('promotions per year worked, people ÷ you', peopleJob(p.work.promoted), playerJob(c.promotions), t.ratio.promotion, two);
  addRatio('firings per year worked, people ÷ you', peopleJob(p.work.fired), playerJob(c.firings), t.ratio.firing, two);
  addRatio('layoffs per year worked, people ÷ you', peopleJob(p.work.laidOff), playerJob(c.layoffs), t.ratio.layoff, two);

  const rel = sim.relationships;
  addRatio('married by 40, people ÷ you', per(p.cohort.marriedBy40, p.cohort.reached40), per(rel.marriedBy40, rel.reached40), t.ratio.marriedBy40, two);
  addRatio('divorces per married year, people ÷ you', per(p.love.divorced, p.love.marriedYears), per(rel.divorces, p.player.marriedYears), t.ratio.divorce, two);
  addRatio('moves per adult year, people ÷ you', per(p.moves.moves, p.moves.adultYears), per(p.player.moves, p.player.adultYears), t.ratio.moves, two);
  addRatio('arrests per adult year, people ÷ your record entries', per(p.trouble.arrestsAdult, p.trouble.arrestYears), per(p.player.arrests, p.player.adultYears), t.ratio.arrests, two);

  const kids = per(p.cohort.childrenOfMarried, p.cohort.marriedBy45);
  add('children of the people who married (reaching 45)', kids, num(kids), t.childrenPerMarried, num);
  const illness = per(p.trouble.illnesses, p.trouble.adultYears);
  add('adults starting an illness in a year', illness, pct2(illness), t.illness, pct2);
  const addiction = per(p.cohort.hadAddiction, p.cohort.reached40);
  add('people who had an addiction (reaching 40)', addiction, pct1(addiction), t.addiction, pct1);
  const ended = p.trouble.recovered + p.trouble.diedWithAddiction;
  const recovery = per(p.trouble.recovered, ended);
  add('addictions that ended in recovery rather than death', recovery, pct1(recovery), t.recovery, pct1);
  const cap = content.balance.relationships.prune.maxPeople;
  out.push({ label: 'people outside family and romance, after the yearly pruning', value: String(p.crowd.most), short: String(p.crowd.most), goal: `at most ${cap}`, met: p.crowd.most <= cap });
  out.push({ label: 'romance involving anyone under 18', value: String(p.underageRomance), short: String(p.underageRomance), goal: String(t.underageRomance), met: p.underageRomance === t.underageRomance });
  const perYear = per(p.requests.total, p.requestYears);
  add('requests that become cards, a year', perYear, num(perYear), t.requestsPerYear, num);
  const share = per(p.requests.total, p.requests.events);
  out.push({ label: 'requests as a share of all events', value: pct1(share), short: pct1(share), goal: `at most ${pct1(t.maxRequestShare)}`, met: share <= t.maxRequestShare });
  const lines = per(p.news.lines, p.news.years);
  add('news lines in a year that has news', lines, num(lines), t.newsPerYear, num);
  const ms = per(p.timing.totalMs, p.timing.years);
  out.push({ label: 'beginYear time, average', value: `${ms.toFixed(2)} ms`, short: `${ms.toFixed(1)}ms`, goal: `at most ${t.maxBeginYearMs} ms`, met: ms <= t.maxBeginYearMs });
  if (p.fullCircle) {
    out.push({ label: `beginYear time, full circle of ${p.fullCircle.people}`, value: `${p.fullCircle.meanMs.toFixed(2)} ms`, short: `${p.fullCircle.meanMs.toFixed(1)}ms`, goal: `at most ${t.maxBeginYearMs} ms`, met: p.fullCircle.meanMs <= t.maxBeginYearMs });
  }
  return out;
}
