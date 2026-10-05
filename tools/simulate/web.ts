/**
 * The social web, measured (E4): the ties between the people you know (how
 * many, how they begin, how many are strained or feuding, how long feuds
 * last, whether you take sides), what is known and passed on (how many items
 * of each kind, how far and how fast secrets spread, how often a story
 * twists, how often a secret comes out, and what hearing it does to how
 * people feel about you), the events the web asks of you, and the invariants
 * (checked by the run itself). The watcher compares each year's state before
 * and after `beginYear`, so nothing here touches the engine.
 */
import { KNOWLEDGE_KINDS, SECRET_KINDS, WEB_TRIGGERS, type ContentBundle } from '../../src/content/schemas';
import { tieStatus } from '../../src/engine/web/query';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

export interface KindStats {
  made: number;
  /** Items some person heard of from another person at least once. */
  gossiped: number;
  /** Items held by three or more people at some point. */
  reachedThree: number;
  /** Items that became common knowledge (a secret held by most of the circle). */
  publicNews: number;
  /** Years from an item beginning to the first time someone heard it from another person (over those that did). */
  yearsToFirstGossip: number[];
  /** The most holders at once, summed over items. */
  holdersAtMost: number;
  /** Times someone heard it from another person, and the changes in how they felt about you. */
  heard: number;
  affectionChange: number;
}

export interface WebReport {
  lives: number;
  years: number;
  ties: {
    /** Tie-years, by kind and by how the tie reads. */
    tieYears: number;
    byKind: Record<string, number>;
    byStatus: Record<string, number>;
    /** New ties by how they began, and couples that formed (or married) between people you know. */
    made: Record<string, number>;
    couples: number;
    weddings: number;
    /** Ties that ended because someone died or left your circle. */
    ended: number;
    mostInAYear: number;
  };
  feuds: {
    began: number;
    ended: number;
    /** Tie-years spent feuding, and the years feuds lasted (of those that ended). */
    years: number;
    endedYears: number;
    livesWithFeud: number;
    /** At the end of the life (or when the feud ended): you took a side, or said you'd stay out of it, or nothing. */
    sided: number;
    neutral: number;
    undecided: number;
    byKind: Record<string, number>;
    /** Ties whose feud began in an introduction, and the neutral cost you paid in affection (by the ledger of feud years). */
    neutralYears: number;
  };
  knowledge: {
    byKind: Record<string, KindStats>;
    /** Passes of a story from one person to another, and how many changed the version. */
    passes: number;
    twists: number;
    /** Things that came out (a secret someone heard from another person), by kind. */
    cameOut: Record<string, number>;
    /** The most items at once. */
    mostItems: number;
  };
  events: { total: number; byTrigger: Record<string, number>; reactions: number; maxInAYear: number; allEvents: number };
  /** A couple tie between people under the adult age, or related (must be zero). */
  badCouples: number;
  /** Ties that point at someone who isn't alive and in your circle (must be zero). */
  strayTies: number;
}

const emptyKind = (): KindStats => ({ made: 0, gossiped: 0, reachedThree: 0, publicNews: 0, yearsToFirstGossip: [], holdersAtMost: 0, heard: 0, affectionChange: 0 });

export function emptyWebReport(): WebReport {
  return {
    lives: 0,
    years: 0,
    ties: { tieYears: 0, byKind: {}, byStatus: {}, made: {}, couples: 0, weddings: 0, ended: 0, mostInAYear: 0 },
    feuds: { began: 0, ended: 0, years: 0, endedYears: 0, livesWithFeud: 0, sided: 0, neutral: 0, undecided: 0, byKind: {}, neutralYears: 0 },
    knowledge: { byKind: Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, emptyKind()])), passes: 0, twists: 0, cameOut: {}, mostItems: 0 },
    events: { total: 0, byTrigger: {}, reactions: 0, maxInAYear: 0, allEvents: 0 },
    badCouples: 0,
    strayTies: 0,
  };
}

interface Tracked {
  kind: string;
  year: number;
  gossiped: boolean;
  three: boolean;
  public: boolean;
  most: number;
}

/** Watches one life, year by year. */
export class WebWatcher {
  private readonly items = new Map<string, Tracked>();
  private readonly feudStart = new Map<string, number>();
  private hadFeud = false;
  private readonly eventTrigger: Map<string, string>;
  private readonly reactionEvents: Set<string>;

  constructor(
    private readonly report: WebReport,
    private readonly content: ContentBundle,
  ) {
    const reg = content.registries.web;
    this.eventTrigger = new Map(WEB_TRIGGERS.flatMap((t) => reg.triggers[t].events.map((id) => [id, t] as const)));
    this.reactionEvents = new Set(Object.values(reg.kinds).flatMap((k) => k.reactions));
  }

  /** The life as one year was about to begin and right after it did (events picked). */
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const { adultAge } = this.content.balance.relationships;
    const year = after.currentYear;
    r.years++;

    // Ties.
    const ties = Object.entries(after.web.ties);
    r.ties.tieYears += ties.length;
    r.ties.mostInAYear = Math.max(r.ties.mostInAYear, ties.length);
    for (const [key, t] of ties) {
      r.ties.byKind[t.kind] = (r.ties.byKind[t.kind] ?? 0) + 1;
      const status = tieStatus(t, this.content);
      r.ties.byStatus[status] = (r.ties.byStatus[status] ?? 0) + 1;
      const was = before.web.ties[key];
      if (!was) {
        r.ties.made[t.origin] = (r.ties.made[t.origin] ?? 0) + 1;
        if (t.kind === 'dating' && t.origin !== 'family') r.ties.couples++;
      } else if (was.kind === 'dating' && t.kind === 'married') r.ties.weddings++;
      // Feuds.
      if (t.feud) {
        r.feuds.years++;
        if (t.feud.side === undefined && t.feud.since < year) r.feuds.neutralYears++;
        if (!was?.feud) {
          r.feuds.began++;
          r.feuds.byKind[t.kind] = (r.feuds.byKind[t.kind] ?? 0) + 1;
          this.feudStart.set(key, t.feud.since);
          this.hadFeud = true;
        }
      } else if (was?.feud) {
        this.endFeud(key, year, was.feud.side !== undefined, was.feud.neutral === true);
      }
      // The rules the engine enforces, seen from outside.
      const pa = after.people[t.a];
      const pb = after.people[t.b];
      if (!pa || !pb || !pa.alive || !pb.alive || after.relationships[t.a]?.status === 'ended' || after.relationships[t.b]?.status === 'ended') r.strayTies++;
      if ((t.kind === 'dating' || t.kind === 'married') && pa && pb && (year - pa.birthYear < adultAge || year - pb.birthYear < adultAge)) r.badCouples++;
    }
    for (const key of Object.keys(before.web.ties)) {
      if (!after.web.ties[key]) {
        r.ties.ended++;
        if (this.feudStart.has(key)) {
          const was = before.web.ties[key]!;
          this.endFeud(key, year, was.feud?.side !== undefined, was.feud?.neutral === true, false);
        }
      }
    }

    // Knowledge.
    const k = r.knowledge;
    k.mostItems = Math.max(k.mostItems, after.web.items.length);
    for (const item of after.web.items) {
      const stats = k.byKind[item.kind]!;
      let tr = this.items.get(item.id);
      if (!tr) {
        tr = { kind: item.kind, year: item.year, gossiped: false, three: false, public: false, most: 0 };
        this.items.set(item.id, tr);
        stats.made++;
      }
      const prev = before.web.items.find((i) => i.id === item.id);
      const holders = Object.entries(item.holders);
      tr.most = Math.max(tr.most, holders.length);
      if (holders.length >= 3 && !tr.three) {
        tr.three = true;
        stats.reachedThree++;
      }
      if (item.public && !tr.public) {
        tr.public = true;
        stats.publicNews++;
      }
      for (const [hid, h] of holders) {
        if (h.since !== year || h.from === 'you' || h.from === 'saw') continue;
        if (prev?.holders[hid]) continue;
        // Someone heard it from another person this year.
        k.passes++;
        stats.heard++;
        const teller = item.holders[h.from];
        if (teller && teller.version !== h.version) k.twists++;
        if (!tr.gossiped) {
          tr.gossiped = true;
          stats.gossiped++;
          stats.yearsToFirstGossip.push(year - item.year);
          k.cameOut[item.kind] = (k.cameOut[item.kind] ?? 0) + 1;
        }
        if (item.subject === 'you') {
          const a0 = before.relationships[hid]?.affection;
          const a1 = after.relationships[hid]?.affection;
          if (a0 !== undefined && a1 !== undefined) stats.affectionChange += a1 - a0;
        }
      }
    }
    // Items that left the web are done: fold their numbers in.
    for (const [id, tr] of this.items) {
      if (!after.web.items.some((i) => i.id === id)) {
        k.byKind[tr.kind]!.holdersAtMost += tr.most;
        this.items.delete(id);
      }
    }

    // The events the web asked of you.
    const webCards = after.pending.filter((e) => this.eventTrigger.has(e.eventId) || this.reactionEvents.has(e.eventId));
    r.events.total += webCards.length;
    r.events.allEvents += after.pending.length;
    r.events.maxInAYear = Math.max(r.events.maxInAYear, webCards.length);
    for (const e of webCards) {
      const trigger = this.eventTrigger.get(e.eventId);
      if (trigger) r.events.byTrigger[trigger] = (r.events.byTrigger[trigger] ?? 0) + 1;
      else r.events.reactions++;
    }
  }

  private endFeud(key: string, year: number, sided: boolean, neutral: boolean, ended = true): void {
    const f = this.report.feuds;
    const start = this.feudStart.get(key);
    this.feudStart.delete(key);
    if (ended && start !== undefined) {
      f.ended++;
      f.endedYears += year - start;
    }
    if (sided) f.sided++;
    else if (neutral) f.neutral++;
    else f.undecided++;
  }

  /** The life is over: items and feuds still going are folded in. */
  finish(life: LifeState): void {
    const k = this.report.knowledge;
    for (const tr of this.items.values()) k.byKind[tr.kind]!.holdersAtMost += tr.most;
    this.items.clear();
    for (const [key] of this.feudStart) {
      const t = life.web.ties[key];
      if (t?.feud) {
        if (t.feud.side !== undefined) this.report.feuds.sided++;
        else if (t.feud.neutral) this.report.feuds.neutral++;
        else this.report.feuds.undecided++;
      }
    }
    this.feudStart.clear();
    if (this.hadFeud) this.report.feuds.livesWithFeud++;
    this.report.lives++;
  }
}

const per = (n: number, d: number) => (d > 0 ? n / d : 0);
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const median = (xs: number[]) => (xs.length === 0 ? Number.NaN : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);

/** The web report, as text. */
export function formatWeb(w: WebReport, content: ContentBundle): string[] {
  const lines: string[] = [];
  const f = w.feuds;
  const k = w.knowledge;
  const status = Object.entries(w.ties.byStatus).map(([s, n]) => `${s} ${pct(n, w.ties.tieYears)}`).join(', ');
  const kinds = Object.entries(w.ties.byKind).sort(([a], [b]) => (a < b ? -1 : 1)).map(([s, n]) => `${s} ${(n / Math.max(1, w.years)).toFixed(1)}`).join(', ');
  lines.push(`The social web (E4; careful player): ${w.lives} lives, ${w.years} life-years, ${per(w.ties.tieYears, w.years).toFixed(1)} ties at a time on average (most ${w.ties.mostInAYear}); by kind, ties at a time: ${kinds}`);
  lines.push(`  how the ties read (tie-years): ${status}; new ties by how they began: ${Object.entries(w.ties.made).map(([o, n]) => `${o} ${n}`).join(', ') || 'none'}; couples among the people you know ${w.ties.couples} (${w.ties.weddings} married); ended with a death or someone leaving ${w.ties.ended}`);
  lines.push(
    `  feuds: ${f.began} began (${per(f.began, w.lives).toFixed(2)} a life; ${pct(f.livesWithFeud, w.lives)} of lives had one), ${f.ended} ended after ${per(f.endedYears, f.ended).toFixed(1)} years on average; ${pct(f.years, w.ties.tieYears)} of tie-years are feuding; by kind: ${Object.entries(f.byKind).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`,
  );
  lines.push(`  you and feuds: took a side in ${pct(f.sided, f.sided + f.neutral + f.undecided)}, said you'd stay out of it in ${pct(f.neutral, f.sided + f.neutral + f.undecided)}, decided nothing in ${pct(f.undecided, f.sided + f.neutral + f.undecided)}; ${f.neutralYears} feud-years without a side taken (each costs you with both)`);
  lines.push(`  what is known: at most ${k.mostItems} items at once; ${k.passes} passes from one person to another, ${pct(k.twists, k.passes)} twisting the story`);
  for (const kind of KNOWLEDGE_KINDS) {
    const s = k.byKind[kind]!;
    if (s.made === 0) continue;
    const secret = (SECRET_KINDS as readonly string[]).includes(kind);
    lines.push(
      `    ${kind}${secret ? ' (secret)' : ''}: ${s.made} items, gossiped on in ${pct(s.gossiped, s.made)} (median ${Number.isNaN(median(s.yearsToFirstGossip)) ? '—' : median(s.yearsToFirstGossip)} years to the first telling), reached three people ${pct(s.reachedThree, s.made)}, common knowledge ${pct(s.publicNews, s.made)}, most holders ${per(s.holdersAtMost, s.made).toFixed(1)} on average, how people felt about you on hearing it: ${(per(s.affectionChange, s.heard)).toFixed(1)} affection over ${s.heard} tellings`,
    );
  }
  lines.push(
    `  events the web asked of you: ${w.events.total} (${per(w.events.total, w.years).toFixed(2)} a year; ${pct(w.events.total, w.events.allEvents)} of all events; most in a year ${w.events.maxInAYear}; ${w.events.reactions} of them someone reacting to what they heard): ${Object.entries(w.events.byTrigger).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`,
  );
  lines.push(`  couple ties under ${content.balance.relationships.adultAge} or between relatives: ${w.badCouples}; ties pointing at someone gone: ${w.strayTies}`);
  return lines;
}

/** Each E4 target in balance/targets.yaml, measured on this report. */
export function webTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const w = sim.web;
  const t = content.balance.targets.web;
  const out: TargetResult[] = [];
  const num = (x: number) => x.toFixed(2);
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const range = (r: { min: number; max: number }, f: (x: number) => string) => `${f(r.min)}–${f(r.max)}`;
  const add = (label: string, value: number, r: { min: number; max: number }, f: (x: number) => string) =>
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal: range(r, f), met: !Number.isNaN(value) && value >= r.min && value <= r.max });

  add('ties at a time', per(w.ties.tieYears, w.years), t.tiesAtATime, num);
  add('feuds that begin, a life', per(w.feuds.began, w.lives), t.feudsPerLife, num);
  add('tie-years that are feuding', per(w.feuds.years, w.ties.tieYears), t.feudingShare, pct1);
  add('years a feud lasts before it ends', per(w.feuds.endedYears, w.feuds.ended), t.feudYears, num);
  add('feuds that end (of those that began)', per(w.feuds.ended, w.feuds.began), t.feudsEnded, pct1);
  const secrets = (SECRET_KINDS as readonly string[]).map((s) => w.knowledge.byKind[s]!);
  const made = secrets.reduce((n, s) => n + s.made, 0);
  add('secrets that someone heard from another person', per(secrets.reduce((n, s) => n + s.gossiped, 0), made), t.secretsOut, pct1);
  add('years from a secret beginning to its first telling (median)', median(secrets.flatMap((s) => s.yearsToFirstGossip)), t.secretYears, num);
  const news = KNOWLEDGE_KINDS.filter((kind) => !(SECRET_KINDS as readonly string[]).includes(kind)).map((kind) => w.knowledge.byKind[kind]!);
  add('news that someone heard from another person', per(news.reduce((n, s) => n + s.gossiped, 0), news.reduce((n, s) => n + s.made, 0)), t.newsOut, pct1);
  add('stories that twist when passed on', per(w.knowledge.twists, w.knowledge.passes), t.twistRate, pct1);
  const perYear = per(w.events.total, w.years);
  add('web events that reach you, a year', perYear, t.eventsPerYear, num);
  const share = per(w.events.total, w.events.allEvents);
  out.push({ label: 'web events as a share of all events', value: pct1(share), short: pct1(share), goal: `at most ${pct1(t.maxEventShare)}`, met: share <= t.maxEventShare });
  out.push({ label: 'couple ties under 18 or between relatives', value: String(w.badCouples), short: String(w.badCouples), goal: '0', met: w.badCouples === 0 });
  out.push({ label: 'ties pointing at someone gone', value: String(w.strayTies), short: String(w.strayTies), goal: '0', met: w.strayTies === 0 });
  const ms = per(sim.people.timing.totalMs, sim.people.timing.years);
  const webMs = per(sim.people.timing.stepMs.web ?? 0, sim.people.timing.years);
  out.push({ label: 'beginYear time, average (all steps)', value: `${ms.toFixed(2)} ms`, short: `${ms.toFixed(1)}ms`, goal: `at most ${t.maxBeginYearMs} ms`, met: ms <= t.maxBeginYearMs });
  out.push({ label: 'the web step alone, average', value: `${webMs.toFixed(3)} ms`, short: `${webMs.toFixed(2)}ms`, goal: `at most ${t.maxWebStepMs} ms`, met: webMs <= t.maxWebStepMs });
  if (sim.people.fullCircle) {
    out.push({ label: `beginYear time, full circle of ${sim.people.fullCircle.people}`, value: `${sim.people.fullCircle.meanMs.toFixed(2)} ms`, short: `${sim.people.fullCircle.meanMs.toFixed(1)}ms`, goal: `at most ${t.maxBeginYearMs} ms`, met: sim.people.fullCircle.meanMs <= t.maxBeginYearMs });
  }
  return out;
}
