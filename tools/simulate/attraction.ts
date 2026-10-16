/**
 * Romance by attraction (B1): the simulated player's use of "Find a date", the
 * rejections that come from asking someone who isn't attracted to you, and,
 * for adults attracted to the same gender, to another gender and to more than
 * one, how many ever have a partner, how many years pass before the first one
 * and how many years are spent single between 18 and 49. The target keeps
 * same-gender lives within a set distance of the others: nobody should find
 * love much harder because of who they are attracted to.
 *
 * Like the other player models, how the simulated player uses the action
 * describes the simulated player, not the game, so it lives here.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { currentPartner } from '../../src/engine/relationships';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

export const ORIENTATIONS = ['same', 'other', 'multiple'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** The years of adult life the comparison covers (ages 18 to 49, so a life must reach 50). */
export const WINDOW = { from: 18, to: 49 } as const;
const WINDOW_YEARS = WINDOW.to - WINDOW.from + 1;

export interface OrientationRow {
  /** Lives that reached 50 with this attraction at 18. */
  lives: number;
  everPartnered: number;
  /** Years from 18 to the first partner, for those who had one in the window. */
  yearsToFirst: number[];
  /** Years without a partner in the window, per life. */
  yearsSingle: number[];
}

export interface AttractionReport {
  player: string;
  lives: number;
  rows: Record<Orientation, OrientationRow>;
  /** Lives attracted to no one at 18 (left out of the rows). */
  noAttraction: number;
  /** "Ask out" by the simulated player, and the answers that were a kind no because they weren't attracted. */
  askedOut: number;
  declined: number;
  /** "Find a date" tries by way, those that brought someone new,. */
  findDate: { tries: number; byWay: Record<string, number>; candidates: number };
}

export function emptyAttractionReport(player: string): AttractionReport {
  const row = (): OrientationRow => ({ lives: 0, everPartnered: 0, yearsToFirst: [], yearsSingle: [] });
  return { player, lives: 0, rows: { same: row(), other: row(), multiple: row() }, noAttraction: 0, askedOut: 0, declined: 0, findDate: { tries: 0, byWay: { app: 0, friend: 0, night_out: 0 }, candidates: 0 } };
}

/** Who the character is attracted to, against their own gender category; null for no one. */
export function orientationOf(life: LifeState): Orientation | null {
  const { attractedTo, genderCategory } = life.character.identity;
  if (attractedTo.length === 0) return null;
  if (attractedTo.length > 1) return 'multiple';
  return attractedTo[0] === genderCategory ? 'same' : 'other';
}

const DECLINED = ['ask_out_declined_kind', 'ask_out_declined_friend', 'ask_out_declined_clear'];
const DATE_EVENTS = ['find_date_app', 'find_date_friend', 'find_date_night_out'];

/** Watches one life: who it is attracted to at 18 and when it has a partner between 18 and 49. */
export class AttractionWatcher {
  private orientation: Orientation | null | undefined;
  private lastAge = -1;
  private single = 0;
  private firstPartnerYears: number | null = null;

  constructor(private readonly report: AttractionReport) {}

  /** Call at the start of each year, after the year begins. */
  observe(life: LifeState): void {
    const age = life.character.age;
    if (age < WINDOW.from || age > WINDOW.to || age === this.lastAge) return;
    this.lastAge = age;
    if (this.orientation === undefined) this.orientation = orientationOf(life);
    if (currentPartner(life) === null) this.single++;
    else this.firstPartnerYears ??= age - WINDOW.from;
  }

  finish(life: LifeState): void {
    const r = this.report;
    r.lives++;
    for (const record of life.inputLog) {
      if (record.kind !== 'action') continue;
      const id = (record.payload as { actionId?: string }).actionId;
      if (id === 'ask_out') r.askedOut++;
      if (id === 'find_date') {
        r.findDate.tries++;
        const way = (record.payload as { params?: { dateWay?: string } }).params?.dateWay;
        if (way) r.findDate.byWay[way] = (r.findDate.byWay[way] ?? 0) + 1;
      }
    }
    for (const id of DECLINED) r.declined += life.eventLog[id]?.count ?? 0;
    for (const id of DATE_EVENTS) r.findDate.candidates += life.eventLog[id]?.count ?? 0;
    if (this.orientation === null) r.noAttraction++;
    // Only lives observed through every year of the window count.
    if (this.orientation === undefined || this.orientation === null || this.lastAge < WINDOW.to) return;
    const row = r.rows[this.orientation];
    row.lives++;
    if (this.firstPartnerYears !== null) {
      row.everPartnered++;
      row.yearsToFirst.push(this.firstPartnerYears);
    }
    row.yearsSingle.push(this.single);
  }
}

/**
 * How the simulated player looks for a date: a single adult tries about every other year, and, still single after
 * a try, sometimes tries once more the same year (the odds fall with each try, as in the game).
 */
export function chooseDateActions(life: LifeState, content: ContentBundle, rng: RngState): [LifeActionId, LifeActionParams][] {
  const age = life.character.age;
  if (age < content.balance.relationships.adultAge || age > 50 || currentPartner(life) !== null) return [];
  const taken: [LifeActionId, LifeActionParams][] = [];
  const tries = [0.5, 0.3];
  for (const p of tries) {
    if (!chance(rng, p)) break;
    const ways = (['app', 'friend', 'night_out'] as const).filter((dateWay) => isLifeActionAvailable(life, 'find_date', { dateWay }, content));
    if (ways.length === 0) break;
    taken.push(['find_date', { dateWay: pick(rng, ways) }]);
  }
  return taken;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);

export function formatAttraction(r: AttractionReport): string[] {
  const lines = ['', `Romance by attraction (B1) — ${r.player} player:`];
  lines.push(`  lives ${r.lives}; attracted to no one ${r.noAttraction}`);
  lines.push(`  asked out ${r.askedOut} times; kindly turned down by someone not attracted ${r.declined} times (${pct(r.declined, r.askedOut)} of asks)`);
  const f = r.findDate;
  lines.push(`  find a date: ${f.tries} tries (${Object.entries(f.byWay).map(([w, n]) => `${w} ${n}`).join(', ')}); ${f.candidates} brought someone new (${pct(f.candidates, f.tries)})`);
  lines.push(`  ages ${WINDOW.from}–${WINDOW.to}, lives that reach 50, by who they are attracted to:`);
  for (const o of ORIENTATIONS) {
    const row = r.rows[o];
    lines.push(
      `    ${o.padEnd(8)} lives ${String(row.lives).padStart(5)}  ever had a partner ${pct(row.everPartnered, row.lives).padStart(6)}  mean years until the first ${mean(row.yearsToFirst).toFixed(1).padStart(5)}  mean years single ${mean(row.yearsSingle).toFixed(1).padStart(5)} of ${WINDOW_YEARS}`,
    );
  }
  return lines;
}

export function attractionTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  if (report.player !== 'careful') return [];
  const t = content.balance.targets.attraction;
  const rows = report.attraction.rows;
  const out: TargetResult[] = [];
  const add = (label: string, value: number, goal: number, enough: boolean, fmt: (n: number) => string) =>
    out.push({ label: enough ? label : `${label} (too few lives to judge)`, value: fmt(value), short: fmt(value), goal: `within ${fmt(goal)}`, met: !enough || Math.abs(value) <= goal });
  const others = { lives: rows.other.lives, everPartnered: rows.other.everPartnered, single: rows.other.yearsSingle };
  for (const o of ['same', 'multiple'] as const) {
    const row = rows[o];
    const enough = row.lives >= t.minSample && others.lives >= t.minSample;
    add(`${o}-gender-attracted lives that ever have a partner, less other-gender-attracted lives'`, share(row.everPartnered, row.lives) - share(others.everPartnered, others.lives), t.everPartneredGap, enough, (n) => `${n >= 0 ? '+' : ''}${(100 * n).toFixed(1)} points`);
    add(`${o}-gender-attracted mean years single, less other-gender-attracted lives'`, mean(row.yearsSingle) - mean(others.single), t.yearsSingleGap, enough, (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)} years`);
  }
  return out;
}
