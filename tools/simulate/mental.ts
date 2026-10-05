/**
 * Mental health, measured (M1): how common each condition is, when it is
 * named and by whom, who is born with ADHD or neurodivergence and how much an
 * affected parent changes that, what treatment choices people make and what
 * they do to the course, who notices and how they take it and what their
 * support does, how rare crises are and whether they lead to help, and how
 * far a diagnosis spreads as a secret. The watcher compares each year's state
 * before and after `beginYear`, so nothing here touches the engine.
 */
import type { ConditionDef, ContentBundle } from '../../src/content/schemas';
import { isMentalKind, mentalConditions, namedMental, supportScore } from '../../src/engine/mental/query';
import { whereabouts } from '../../src/engine/presence';
import type { DiagnosisPath, LifeState, MentalCare, Reaction } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

/** Severity change a year, summed over condition-years, by what you were doing about it. */
interface Course {
  years: number;
  total: number;
}
const course = (): Course => ({ years: 0, total: 0 });

export interface ConditionStats {
  /** Lives that ever had it, were ever named, recovered, and came back. */
  lives: number;
  named: number;
  recovered: number;
  relapsed: number;
  /** How it was named. */
  by: Partial<Record<DiagnosisPath, number>>;
  /** Years from starting to being named (those that were named), and the age it was named. */
  yearsToNaming: number[];
  ageNamed: number[];
  /** Born-with (neuro) conditions: the age they were named at, by lives. */
}

export interface MentalReport {
  lives: number;
  years: number;
  conditions: Record<string, ConditionStats>;
  /** Mental health conditions (depression, anxiety, PTSD): lives that ever had one, and were ever named. */
  anyMental: { lives: number; named: number };
  anyNeuro: { lives: number; named: number };
  /** Born with it: lives with an affected parent and without, and how many of each had it. */
  inherited: { withParent: { lives: number; had: number }; withoutParent: { lives: number; had: number } };
  /** What named people did about it: lives that ever tried each way, lives that stayed with none, side effects and stopping medication. */
  care: { lives: number; therapy: number; medication: number; support: number; professional: number; none: number; sideEffects: number; stoppedMedication: number; careYears: Record<MentalCare, number> };
  /** The course of a mental health condition a year (severity points), by care and by the support around you. */
  effect: { none: Course; professional: Course; supportOnly: Course; supported: Course; unsupported: Course; dismissed: Course };
  /** Noticing: lives where someone noticed, how each took it, and the chance a close person notices in a year, by where they are. */
  noticing: { livesStruggling: number; livesNoticed: number; byReaction: Record<Reaction, number>; exposure: { household: number; nearby: number; elsewhere: number }; noticed: { household: number; nearby: number; elsewhere: number } };
  /** Crises: how many, lives with one, followed by care within two years, and how many were named. */
  crisis: { lives: number; total: number; ledToCare: number; named: number; withHelperEvent: number };
  /** The diagnosis as a secret: items made, how many someone else came to know, from you, from gossip and public. */
  secret: { made: number; known: number; fromGossip: number; told: number; public: number; byKind: Record<string, number> };
  /** M1 events fired (all lives). */
  eventsFired: number;
  invariantFailures: number;
}

export function emptyMentalReport(content: ContentBundle): MentalReport {
  const conditions: Record<string, ConditionStats> = {};
  for (const [id, def] of Object.entries(content.conditions)) {
    if (isMentalKind(def.kind)) conditions[id] = { lives: 0, named: 0, recovered: 0, relapsed: 0, by: {}, yearsToNaming: [], ageNamed: [] };
  }
  return {
    lives: 0,
    years: 0,
    conditions,
    anyMental: { lives: 0, named: 0 },
    anyNeuro: { lives: 0, named: 0 },
    inherited: { withParent: { lives: 0, had: 0 }, withoutParent: { lives: 0, had: 0 } },
    care: { lives: 0, therapy: 0, medication: 0, support: 0, professional: 0, none: 0, sideEffects: 0, stoppedMedication: 0, careYears: { therapy: 0, medication: 0, support: 0 } },
    effect: { none: course(), professional: course(), supportOnly: course(), supported: course(), unsupported: course(), dismissed: course() },
    noticing: { livesStruggling: 0, livesNoticed: 0, byReaction: { supportive: 0, neutral: 0, dismissive: 0 }, exposure: { household: 0, nearby: 0, elsewhere: 0 }, noticed: { household: 0, nearby: 0, elsewhere: 0 } },
    crisis: { lives: 0, total: 0, ledToCare: 0, named: 0, withHelperEvent: 0 },
    secret: { made: 0, known: 0, fromGossip: 0, told: 0, public: 0, byKind: {} },
    eventsFired: 0,
    invariantFailures: 0,
  };
}

/** The M1 events: the mental health category, the web reactions to a diagnosis, and the ones that live in school and work. */
export function mentalEventIds(content: ContentBundle): Set<string> {
  const ids = new Set<string>(Object.values(content.events).filter((e) => e.category === 'mental').map((e) => e.id));
  for (const id of content.registries.web.kinds.mentalHealth.reactions) ids.add(id);
  for (const id of ['teacher_suggests_testing', 'deadline_rush', 'bad_day_at_work', 'workplace_disclosure']) if (content.events[id]) ids.add(id);
  return ids;
}

const CONDITION_KINDS = new Set(['mental', 'neuro']);

/** Watches one life, year by year. */
export class MentalWatcher {
  private readonly everMental = new Set<string>();
  private readonly everNamed = new Set<string>();
  private readonly tried = new Set<MentalCare>();
  private hadMentalNamed = false;
  private hadNeuro = false;
  private namedNeuro = false;
  private professional = false;
  private sideEffect = false;
  private stoppedMedication = false;
  private struggled = false;
  private noticed = false;
  private hadCrisis = false;
  private crises = 0;
  private readonly crisisYears: { year: number; care: boolean }[] = [];
  private readonly items = new Map<string, { gossip: boolean; known: boolean; told: boolean; public: boolean }>();

  constructor(
    private readonly report: MentalReport,
    private readonly content: ContentBundle,
  ) {}

  /** The life as it begins: who is born with what, and whether a parent has it. */
  begin(life: LifeState): void {
    const parents = Object.values(life.people).filter((p) => life.relationships[p.id]?.kind === 'parent');
    for (const id of Object.keys(this.content.balance.mentalHealth.neuro)) {
      const parentHas = parents.some((p) => p.neuro?.includes(id));
      const had = life.health.conditions.some((c) => c.conditionId === id);
      const group = parentHas ? this.report.inherited.withParent : this.report.inherited.withoutParent;
      group.lives++;
      if (had) group.had++;
    }
  }

  /** The life as one year was about to begin and right after it did. */
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const m = this.content.balance.mentalHealth;
    const year = after.currentYear;
    r.years++;

    // Conditions: when they start, are named, end and come back.
    for (const { condition, def } of mentalConditions(after, this.content)) {
      const stats = r.conditions[def.id]!;
      const had = before.health.conditions.find((c) => c.conditionId === def.id);
      if (!this.everMental.has(def.id)) {
        this.everMental.add(def.id);
        stats.lives++;
        if (def.kind === 'mental') {
          if (!this.hadMentalNamed && ![...this.everMental].some((x) => x !== def.id && this.content.conditions[x]?.kind === 'mental')) r.anyMental.lives++;
        } else if (!this.hadNeuro) {
          this.hadNeuro = true;
          r.anyNeuro.lives++;
        }
      }
      if (!had && before.health.mental.past[def.id]) stats.relapsed++;
      if (condition.diagnosed !== undefined && !this.everNamed.has(def.id)) {
        this.everNamed.add(def.id);
        stats.named++;
        if (condition.diagnosedBy) stats.by[condition.diagnosedBy] = (stats.by[condition.diagnosedBy] ?? 0) + 1;
        stats.yearsToNaming.push(condition.diagnosed - condition.since);
        stats.ageNamed.push(after.character.age);
        if (def.kind === 'mental' && !this.hadMentalNamed) {
          this.hadMentalNamed = true;
          r.anyMental.named++;
        }
        if (def.kind === 'neuro' && !this.namedNeuro) {
          this.namedNeuro = true;
          r.anyNeuro.named++;
        }
      }
    }
    for (const c of before.health.conditions) {
      const def = this.content.conditions[c.conditionId];
      if (def?.kind === 'mental' && !after.health.conditions.some((x) => x.conditionId === c.conditionId)) r.conditions[def.id]!.recovered++;
    }

    // The course, by what the person was doing about it and by who was around.
    for (const { condition, def } of mentalConditions(before, this.content)) {
      if (def.kind !== 'mental') continue;
      const now = after.health.conditions.find((c) => c.conditionId === def.id);
      const delta = (now?.severity ?? 0) - condition.severity;
      const care = condition.care ?? [];
      const prof = care.includes('therapy') || care.includes('medication');
      const add = (c: Course) => {
        c.years++;
        c.total += delta;
      };
      if (prof) add(r.effect.professional);
      else if (care.includes('support')) add(r.effect.supportOnly);
      else {
        add(r.effect.none);
        const s = supportScore(before, false, this.content);
        if (s > 0.3) add(r.effect.supported);
        else if (s < -0.3) add(r.effect.dismissed);
        else add(r.effect.unsupported);
      }
    }

    // Care.
    for (const { condition, def } of namedMental(after, this.content)) {
      for (const c of condition.care ?? []) {
        r.care.careYears[c]++;
        this.tried.add(c);
      }
      if (condition.treated) this.professional = true;
      void def;
    }
    for (const { condition } of mentalConditions(before, this.content)) {
      if ((condition.care ?? []).includes('medication') && !(after.health.conditions.find((c) => c.conditionId === condition.conditionId)?.care ?? []).includes('medication') && after.health.conditions.some((c) => c.conditionId === condition.conditionId)) {
        this.stoppedMedication = true;
      }
    }
    if (after.health.mental.sideEffectYear === year) this.sideEffect = true;

    // Noticing: how bad it is, who is around to notice and where they are, who did, and how they took it.
    const worst = Math.max(0, ...mentalConditions(before, this.content).filter((h) => h.def.kind === 'mental').map((h) => h.condition.severity));
    if (worst >= m.notice.minSeverity) {
      this.struggled = true;
      for (const id of Object.keys(before.relationships)) {
        const rel = before.relationships[id]!;
        const person = before.people[id];
        if (!person?.alive || rel.status !== 'active' || before.health.mental.noticed[id] || year - person.birthYear < m.notice.minAge) continue;
        if (!['parent', 'stepparent', 'sibling', 'grandparent', 'partner', 'fiance', 'spouse', 'friend'].includes(rel.kind)) continue;
        const where = whereabouts(before, id, this.content);
        const bucket = where === 'household' ? 'household' : where === 'city' ? 'nearby' : 'elsewhere';
        r.noticing.exposure[bucket]++;
        const n = after.health.mental.noticed[id];
        if (n && n.year === year && !n.told && n.since === year) {
          r.noticing.noticed[bucket]++;
          r.noticing.byReaction[n.reaction]++;
          this.noticed = true;
        }
      }
    }

    // Crises (they happen while an event is played, so each shows up as the next year begins).
    if (before.health.mental.crises > this.crises) {
      this.crises = before.health.mental.crises;
      const y = before.health.mental.crisisYear ?? year - 1;
      r.crisis.total++;
      this.crisisYears.push({ year: y, care: false });
      if (!this.hadCrisis) {
        this.hadCrisis = true;
        r.crisis.lives++;
      }
      if (before.health.conditions.some((c) => c.diagnosedBy === 'crisis' && c.diagnosed === y)) r.crisis.named++;
    }
    // A crisis led to care when, within two years of it, a condition is in professional care.
    for (const c of this.crisisYears) {
      if (!c.care && year - c.year <= 2 && after.health.conditions.some((x) => x.treated)) {
        c.care = true;
        r.crisis.ledToCare++;
      }
    }

    // The diagnosis as a secret.
    for (const item of after.web.items) {
      if (item.kind !== 'mentalHealth') continue;
      let t = this.items.get(item.id);
      if (!t) {
        t = { gossip: false, known: false, told: false, public: false };
        this.items.set(item.id, t);
        r.secret.made++;
        r.secret.byKind[item.truth] = (r.secret.byKind[item.truth] ?? 0) + 1;
      }
      const holders = Object.values(item.holders);
      if (!t.known && holders.length > 0) {
        t.known = true;
        r.secret.known++;
      }
      if (!t.gossip && holders.some((h) => h.from !== 'you' && h.from !== 'saw')) {
        t.gossip = true;
        r.secret.fromGossip++;
      }
      if (!t.told && holders.some((h) => h.from === 'you')) {
        t.told = true;
        r.secret.told++;
      }
      if (!t.public && item.public) {
        t.public = true;
        r.secret.public++;
      }
    }
  }

  /** The life is over: what it added up to. */
  finish(life: LifeState): void {
    const r = this.report;
    r.lives++;
    if (this.struggled) r.noticing.livesStruggling++;
    if (this.noticed) r.noticing.livesNoticed++;
    if (this.hadMentalNamed) {
      r.care.lives++;
      if (this.tried.has('therapy')) r.care.therapy++;
      if (this.tried.has('medication')) r.care.medication++;
      if (this.tried.has('support')) r.care.support++;
      if (this.professional) r.care.professional++;
      else r.care.none++;
      if (this.sideEffect) r.care.sideEffects++;
      if (this.stoppedMedication) r.care.stoppedMedication++;
    }
    // A crisis in the last year of the life (never seen as another year began).
    if (life.health.mental.crises > this.crises) {
      r.crisis.total += life.health.mental.crises - this.crises;
      if (!this.hadCrisis) r.crisis.lives++;
    }
    this.items.clear();
  }
}

const per = (n: number, d: number) => (d > 0 ? n / d : Number.NaN);
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const mean = (c: Course) => (c.years > 0 ? c.total / c.years : Number.NaN);
const median = (xs: number[]) => (xs.length === 0 ? Number.NaN : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);
const fx = (x: number, d = 1) => (Number.isNaN(x) ? '—' : x.toFixed(d));

/** The mental health report, as text. */
export function formatMental(m: MentalReport, content: ContentBundle, events: SimulationReport['events']): string[] {
  const lines: string[] = [];
  const ids = new Set(mentalEventIds(content));
  const fired = events.filter((e) => ids.has(e.id)).reduce((n, e) => n + e.fired, 0);
  lines.push(`Mental health (M1; ${m.lives} lives, ${m.years} life-years)`);
  lines.push('  prevalence and naming, by condition (lives that ever had it; named; how; years from starting to being named, median; age named, median; recovered; came back):');
  for (const [id, s] of Object.entries(m.conditions)) {
    const def = content.conditions[id] as ConditionDef;
    const by = Object.entries(s.by).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
    lines.push(
      `    ${id.padEnd(18)} ${pct(s.lives, m.lives).padStart(6)} of lives (${s.lives}); named ${pct(s.named, s.lives)} (${by}); ${fx(median(s.yearsToNaming))} years to naming, age ${fx(median(s.ageNamed), 0)}` +
        (def.kind === 'mental' ? `; recovered ${pct(s.recovered, s.lives)}, came back ${s.relapsed}` : '; born with it'),
    );
  }
  lines.push(`  any mental health condition: ${pct(m.anyMental.lives, m.lives)} of lives, ${pct(m.anyMental.named, m.anyMental.lives)} of those named; neurodivergence or ADHD: ${pct(m.anyNeuro.lives, m.lives)}, ${pct(m.anyNeuro.named, m.anyNeuro.lives)} named`);
  const iw = m.inherited.withParent;
  const io = m.inherited.withoutParent;
  lines.push(`  born with ADHD or neurodivergence: ${pct(iw.had, iw.lives)} of ${iw.lives} (condition, life) pairs with an affected parent, ${pct(io.had, io.lives)} of ${io.lives} without (${fx(per(iw.had / Math.max(1, iw.lives), io.had / Math.max(1, io.lives)), 1)} times as likely)`);
  const c = m.care;
  lines.push(
    `  what named people did (${c.lives} lives): therapy ${pct(c.therapy, c.lives)}, medication ${pct(c.medication, c.lives)}, leaned on people ${pct(c.support, c.lives)}; in professional care ${pct(c.professional, c.lives)}, never ${pct(c.none, c.lives)}; side effects in ${pct(c.sideEffects, c.lives)}; stopped medication in ${pct(c.stoppedMedication, c.lives)}; care-years: therapy ${c.careYears.therapy}, medication ${c.careYears.medication}, support ${c.careYears.support}`,
  );
  const e = m.effect;
  lines.push(
    `  how the year goes (severity points a year, mean): in therapy or on medication ${fx(mean(e.professional), 2)} over ${e.professional.years} condition-years; leaning on people only ${fx(mean(e.supportOnly), 2)} (${e.supportOnly.years}); no care ${fx(mean(e.none), 2)} (${e.none.years}); and with no care, supported by those who noticed ${fx(mean(e.supported), 2)} (${e.supported.years}), nobody noticing ${fx(mean(e.unsupported), 2)} (${e.unsupported.years}), dismissed ${fx(mean(e.dismissed), 2)} (${e.dismissed.years})`,
  );
  const n = m.noticing;
  const rate = (b: 'household' | 'nearby' | 'elsewhere') => per(n.noticed[b], n.exposure[b]);
  lines.push(
    `  noticing: someone noticed in ${pct(n.livesNoticed, n.livesStruggling)} of ${n.livesStruggling} lives that struggled; how they took it: supportive ${n.byReaction.supportive}, unsure ${n.byReaction.neutral}, dismissive ${n.byReaction.dismissive}; the chance a close person notices in a year: living with you ${fx(100 * rate('household'), 1)}%, nearby ${fx(100 * rate('nearby'), 1)}%, far away ${fx(100 * rate('elsewhere'), 1)}%`,
  );
  const k = m.crisis;
  lines.push(`  crises: ${k.total} in ${pct(k.lives, m.anyMental.lives)} of the ${m.anyMental.lives} lives with a mental health condition; ${pct(k.ledToCare, k.total)} followed by professional care; ${pct(k.named, k.total)} named something`);
  const s = m.secret;
  lines.push(
    `  the diagnosis as a secret: ${s.made} items; someone besides you knew in ${pct(s.known, s.made)}; heard from another person in ${pct(s.fromGossip, s.made)}; you told someone in ${pct(s.told, s.made)}; common knowledge ${pct(s.public, s.made)}; ${Object.entries(s.byKind).map(([a, b]) => `${a} ${b}`).join(', ')}`,
  );
  lines.push(`  events: ${fired} mental health events fired (${pct(fired, events.reduce((x, y) => x + y.fired, 0))} of all events)`);
  return lines;
}

/** Each M1 target in balance/targets.yaml, measured on this report. */
export function mentalTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const m = sim.mental;
  const t = content.balance.targets.mental;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(2);
  const add = (label: string, value: number, r: { min?: number; max?: number }, f: (x: number) => string) => {
    const lo = r.min ?? -Infinity;
    const hi = r.max ?? Infinity;
    const goal = r.min !== undefined && r.max !== undefined ? `${f(r.min)}–${f(r.max)}` : r.min !== undefined ? `at least ${f(r.min)}` : `at most ${f(hi)}`;
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal, met: !Number.isNaN(value) && value >= lo && value <= hi });
  };
  add('lives with a mental health condition that were ever named', per(m.anyMental.named, m.anyMental.lives), t.namedShare, pct1);
  add('lives with ADHD or neurodivergence that were ever named', per(m.anyNeuro.named, m.anyNeuro.lives), t.neuroNamedShare, pct1);
  const years = Object.values(m.conditions).flatMap((s, i) => (content.conditions[Object.keys(m.conditions)[i]!]?.kind === 'mental' ? s.yearsToNaming : []));
  add('years from a mental health condition starting to being named (median)', median(years), t.yearsToNaming, num);
  const iw = m.inherited.withParent;
  const io = m.inherited.withoutParent;
  add('born with ADHD or neurodivergence: times as likely with an affected parent', per(iw.had / Math.max(1, iw.lives), io.had / Math.max(1, io.lives)), t.inheritance, num);
  const mental = Object.entries(m.conditions).filter(([id]) => content.conditions[id]?.kind === 'mental').map(([, s]) => s);
  const recovered = mental.reduce((n, s) => n + s.recovered, 0);
  add('mental health conditions that were recovered from', per(recovered, mental.reduce((n, s) => n + s.lives, 0)), t.recovered, pct1);
  add('recoveries followed by the condition coming back', per(mental.reduce((n, s) => n + s.relapsed, 0), recovered), t.relapse, pct1);
  add('named lives that ever used professional care', per(m.care.professional, m.care.lives), t.careUptake, pct1);
  add('severity a year in professional care, less with no care (negative is better)', mean(m.effect.professional) - mean(m.effect.none), t.careEffect, num);
  add('severity a year with supportive noticers, less when dismissed (no care)', mean(m.effect.supported) - mean(m.effect.dismissed), t.supportEffect, num);
  add('lives that struggled in which someone noticed', per(m.noticing.livesNoticed, m.noticing.livesStruggling), t.noticed, pct1);
  const r = (b: 'household' | 'nearby' | 'elsewhere') => per(m.noticing.noticed[b], m.noticing.exposure[b]);
  add('noticing, living with you as a multiple of far away', r('household') / r('elsewhere'), t.householdNotice, num);
  add('noticings that are dismissive', per(m.noticing.byReaction.dismissive, m.noticing.byReaction.supportive + m.noticing.byReaction.neutral + m.noticing.byReaction.dismissive), t.dismissive, pct1);
  add('lives with a mental health condition that had a crisis', per(m.crisis.lives, m.anyMental.lives), t.crisisLives, pct1);
  add('crises followed by professional care', per(m.crisis.ledToCare, m.crisis.total), t.crisisToCare, pct1);
  add('diagnoses that someone besides you came to know', per(m.secret.known, m.secret.made), t.secretKnown, pct1);
  const ids = mentalEventIds(content);
  const fired = sim.events.filter((e) => ids.has(e.id)).reduce((n, e) => n + e.fired, 0);
  add('mental health events as a share of all events', per(fired, sim.totalEventsFired), t.eventShare, pct1);
  out.push({ label: 'conditions named before diagnosis (unnamed ones on the Health page)', value: String(m.invariantFailures), short: String(m.invariantFailures), goal: '0', met: m.invariantFailures === 0 });
  void CONDITION_KINDS;
  return out;
}
