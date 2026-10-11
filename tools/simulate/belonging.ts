/**
 * Belonging, simulated (W2): the player model's joining and leaving of groups,
 * and what the run measures about them: who belongs to what (by type), how
 * far people rise, the people a group brings, what it costs against what
 * people earn, faith (what families give, how often it is kept and how often it
 * changes, and what a change does to happiness and values), and what long
 * membership does to values and reputation against people who belong to
 * nothing. It also checks, life by life, what must always hold: every
 * membership is in your city and open to your age, nobody under 16 is
 * committed, a faith has a strength and no faith has none, and groups never
 * cost more than the share of a year's income the balance allows. Like the
 * other player models, these chances describe the simulated player, not the
 * game, so they live here and not in the balance files.
 */
import { GROUP_TYPES, VALUE_IDS, type ContentBundle, type GroupType, type ValueId } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { cityGroups } from '../../src/engine/belonging/cities';
import { joinBlock } from '../../src/engine/belonging/groups';
import { instanceOf } from '../../src/engine/belonging/query';
import { weightedPick } from '../../src/engine/random';
import { chance, type RngState } from '../../src/engine/rng';
import type { Id, LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

/** What a simulated player does about groups, fixed for the life. */
export interface BelongingProfile {
  /** The yearly chance of looking for a group to join when they belong to fewer than two. */
  joinChance: number;
  /** The chance they commit rather than drop in. */
  committed: number;
  /** What they look for. */
  types: readonly (readonly [GroupType, number])[];
}

export function rollBelongingProfile(rng: RngState): BelongingProfile {
  return {
    joinChance: weightedPick(rng, [[0, 5], [0.02, 3], [0.06, 2]] as const),
    committed: weightedPick(rng, [[0.2, 3], [0.5, 3], [0.8, 2]] as const),
    types: [
      ['club', weightedPick(rng, [[1, 2], [3, 2]] as const)],
      ['faith', weightedPick(rng, [[0.5, 2], [3, 2]] as const)],
      ['service', weightedPick(rng, [[0.5, 2], [2, 2]] as const)],
      ['civic', weightedPick(rng, [[0.5, 2], [1.5, 2]] as const)],
    ],
  };
}

/** What the simulated player does about groups this year. */
export function chooseBelongingActions(life: LifeState, content: ContentBundle, rng: RngState, profile: BelongingProfile): [LifeActionId, LifeActionParams][] {
  const out: [LifeActionId, LifeActionParams][] = [];
  const b = life.belonging;
  const age = life.character.age;
  if (age >= 18 && b.memberships.length < 2 && chance(rng, profile.joinChance)) {
    const options = cityGroups(life, life.character.cityId, content).flatMap((g) => {
      const def = content.groups[g.defId]!;
      const w = profile.types.find(([t]) => t === def.type)![1] * def.weight * (def.religion !== undefined && def.religion === b.faith.id ? 4 : def.religion !== undefined ? 0.2 : 1);
      return joinBlock(life, g.id, 'casual', content) === null && w > 0 ? [[g.id, w] as const] : [];
    });
    if (options.length > 0) out.push(['join_group', { groupId: weightedPick(rng, options), level: chance(rng, profile.committed) ? 'committed' : 'casual' }]);
  }
  for (const m of b.memberships) {
    if (m.standing < 30 && chance(rng, 0.25)) out.push(['leave_group', { groupId: m.groupId }]);
    else if (m.commitment === 'casual' && age >= 18 && chance(rng, 0.04)) out.push(['set_group_commitment', { groupId: m.groupId, level: 'committed' }]);
  }
  return out;
}

// ── The report ─────────────────────────────────────────────────────────────

const zeroBy = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export interface BelongingReport {
  lives: number;
  reached: { 18: number; 30: number; 50: number };
  /** Lives that reached 30 and belonged to at least one group at some time, by the types they belonged to. */
  members: { any: number; byType: Record<GroupType, number> };
  /** Memberships begun, by type and how: chosen at some age, or taken along as a child. */
  joins: { byType: Record<GroupType, number>; takenAlong: number; fromEvent: number; fromAction: number };
  /** Memberships ended, by how. */
  ends: { left: number; moved: number; drifted: number; agedOut: number };
  /** Member-years by type and commitment. */
  years: Record<GroupType, { casual: number; committed: number }>;
  /** Role progress: memberships by the highest rung reached (0 is a plain member), and lives that led a group. */
  roles: { total: number; rung: Record<string, number>; promotions: number; leaders: number; livesRose: number; livesLed: number };
  /** The people there: living people in a membership when it ends or the life does, and ties among them. */
  people: { memberships: number; people: number; ties: number };
  /** Memberships that lasted at least ten years (counted when they end or the life does). */
  longMemberships: number;
  /** What groups cost against what people earn, over the years someone belonged to something and earned. */
  giving: { years: number; given: number; gross: number; maxShare: number };
  /** Faith. */
  faith: {
    /** Lives with a faith at birth, by faith (or none). */
    atBirth: Record<string, number>;
    /** Lives that took the household's faith, of lives whose household had one. */
    kept: { raised: number; kept30: number; reach30: number };
    /** Lives with a faith at 30; at death. */
    at30: number;
    /** Lives that reached 50 whose faith changed at least once, and changes by kind. */
    changedLives: number;
    changes: Record<'find' | 'lose' | 'convert' | 'return', number>;
    /** Happiness (the mean over the three years after a change minus the three before) and the move in values. */
    effect: Record<'find' | 'lose' | 'convert' | 'return', { n: number; happiness: number; tradition: number; independence: number }>;
    /** Latent pulls: lives born with one, surfaced, acted on. */
    latent: { born: number; surfaced: number; acted: number };
    /** Mean strength of belief at 30, 50 and 70 among those with a faith. */
    strength: Record<30 | 50 | 70, { n: number; sum: number }>;
    /** Interfaith: years living with a partner of another faith (not none on either side). */
    interfaithYears: number;
  };
  /** Values and reputation: the move from birth to death for people who belonged a long time against people who never belonged. */
  effects: {
    long: { lives: number; values: Record<ValueId, number>; reputation: number };
    never: { lives: number; values: Record<ValueId, number>; reputation: number };
    /** Mean community standing (0–100) at 50, long members against never-members. */
    community: { long: { n: number; sum: number }; never: { n: number; sum: number } };
  };
  /** Group news in the gossip web. */
  news: Record<'groupScandal' | 'groupHonor', { items: number; told: number }>;
  /** The belonging events that fired (per id), for the review. */
  events: Record<string, number>;
  violations: { city: number; age: number; committedChild: number; faithStrength: number; givingCap: number };
  messages: string[];
}

export function emptyBelongingReport(content: ContentBundle): BelongingReport {
  const faithIds = ['none', ...Object.keys(content.registries.belonging.faiths).sort()];
  return {
    lives: 0,
    reached: { 18: 0, 30: 0, 50: 0 },
    members: { any: 0, byType: zeroBy(GROUP_TYPES) },
    joins: { byType: zeroBy(GROUP_TYPES), takenAlong: 0, fromEvent: 0, fromAction: 0 },
    ends: { left: 0, moved: 0, drifted: 0, agedOut: 0 },
    years: Object.fromEntries(GROUP_TYPES.map((t) => [t, { casual: 0, committed: 0 }])) as BelongingReport['years'],
    roles: { total: 0, rung: {}, promotions: 0, leaders: 0, livesRose: 0, livesLed: 0 },
    people: { memberships: 0, people: 0, ties: 0 },
    longMemberships: 0,
    giving: { years: 0, given: 0, gross: 0, maxShare: 0 },
    faith: {
      atBirth: Object.fromEntries(faithIds.map((f) => [f, 0])),
      kept: { raised: 0, kept30: 0, reach30: 0 },
      at30: 0,
      changedLives: 0,
      changes: { find: 0, lose: 0, convert: 0, return: 0 },
      effect: Object.fromEntries((['find', 'lose', 'convert', 'return'] as const).map((k) => [k, { n: 0, happiness: 0, tradition: 0, independence: 0 }])) as BelongingReport['faith']['effect'],
      latent: { born: 0, surfaced: 0, acted: 0 },
      strength: { 30: { n: 0, sum: 0 }, 50: { n: 0, sum: 0 }, 70: { n: 0, sum: 0 } },
      interfaithYears: 0,
    },
    effects: {
      long: { lives: 0, values: zeroBy(VALUE_IDS), reputation: 0 },
      never: { lives: 0, values: zeroBy(VALUE_IDS), reputation: 0 },
      community: { long: { n: 0, sum: 0 }, never: { n: 0, sum: 0 } },
    },
    news: { groupScandal: { items: 0, told: 0 }, groupHonor: { items: 0, told: 0 } },
    events: {},
    violations: { city: 0, age: 0, committedChild: 0, faithStrength: 0, givingCap: 0 },
    messages: [],
  };
}

const BELONGING_CATEGORIES = new Set(['belonging', 'joining', 'faith', 'faithhome']);

/** A belonging event: one of its categories, a self-discovery event about faith, or a reaction to group news. */
function isBelongingEvent(id: string, content: ContentBundle): boolean {
  const def = content.events[id];
  return !!def && (BELONGING_CATEGORIES.has(def.category) || id.startsWith('discovery_faith') || id.startsWith('resurface_faith') || id.startsWith('rumor_group'));
}

export class BelongingWatcher {
  private first: LifeState | null = null;
  /** The life as last observed (events between years change it, so comparing a year's before and after misses them). */
  private prev: LifeState | null = null;
  private pastSeen = 0;
  private happiness: Record<number, number> = {};
  private readonly yearsIn: Record<string, number> = {};
  private maxRung: Record<string, number> = {};
  private committedYears = 0;
  private anyYears = 0;
  private everMember = false;
  private types = new Set<GroupType>();
  private changes: { year: number; kind: 'find' | 'lose' | 'convert' | 'return'; tradition: number; independence: number }[] = [];
  private roseOrLed = { rose: false, led: false };
  private actionJoins = new Set<string>();
  private latentSurfaced = false;
  private reputationStart = 0;

  constructor(
    private readonly report: BelongingReport,
    private readonly content: ContentBundle,
  ) {}

  private fail(kind: keyof BelongingReport['violations'], life: LifeState, message: string): void {
    this.report.violations[kind]++;
    if (this.report.messages.length < 8) this.report.messages.push(`${life.seed}: ${message}`);
  }

  /** A join the player did through the Groups screen's action. */
  joined(groupId: Id): void {
    this.actionJoins.add(groupId);
  }

  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const c = this.content;
    if (this.first === null) {
      this.first = before;
      this.prev = before;
      this.pastSeen = before.belonging.past.length;
      this.reputationStart = before.character.hidden.reputation;
      const f = before.belonging.faith;
      r.faith.atBirth[f.id ?? 'none'] = (r.faith.atBirth[f.id ?? 'none'] ?? 0) + 1;
      if (before.belonging.household.faith !== null) r.faith.kept.raised++;
      if (before.character.latent.faith) r.faith.latent.born++;
    }
    this.happiness[after.currentYear] = after.character.stats.happiness;
    // (Compared with the life as it was last looked at, so what events and actions did between years counts.)
    before = this.prev ?? before;
    this.prev = after;
    const b0 = before.belonging;
    const b1 = after.belonging;
    // Joins.
    for (const m of b1.memberships) {
      if (b0.memberships.some((x) => x.groupId === m.groupId)) continue;
      const g = instanceOf(after, m.groupId);
      const def = g && c.groups[g.defId];
      if (!g || !def) continue;
      r.joins.byType[def.type]++;
      if (m.family) r.joins.takenAlong++;
      else if (this.actionJoins.has(m.groupId)) r.joins.fromAction++;
      else r.joins.fromEvent++;
      this.actionJoins.delete(m.groupId);
      this.everMember = true;
      this.types.add(def.type);
      this.yearsIn[m.groupId] = 0;
    }
    // Ends.
    for (const past of b1.past.slice(this.pastSeen)) {
      const def = c.groups[past.defId];
      if (def?.maxAge !== undefined && after.character.age > def.maxAge) r.ends.agedOut++;
      else r.ends[past.how]++;
      this.endMembership(after, past.groupId, past.topRung);
    }
    this.pastSeen = b1.past.length;
    // Years, roles and checks.
    for (const m of b1.memberships) {
      const g = instanceOf(after, m.groupId);
      const def = g && c.groups[g.defId];
      if (!g || !def) continue;
      r.years[def.type][m.commitment]++;
      this.yearsIn[m.groupId] = (this.yearsIn[m.groupId] ?? 0) + 1;
      this.anyYears++;
      if (m.commitment === 'committed') this.committedYears++;
      const was = b0.memberships.find((x) => x.groupId === m.groupId);
      if (was && m.rung > was.rung) {
        r.roles.promotions++;
        this.roseOrLed.rose = true;
        if (m.rung >= def.ladder.length - 1) this.roseOrLed.led = true;
      }
      this.maxRung[m.groupId] = Math.max(this.maxRung[m.groupId] ?? 0, m.rung);
      if (g.cityId !== after.character.cityId) this.fail('city', after, `${m.groupId} is in ${g.cityId}, not ${after.character.cityId}`);
      const age = after.character.age;
      if (age < def.minAge || (def.maxAge !== undefined && age > def.maxAge)) this.fail('age', after, `${m.groupId} is not open at ${age}`);
      if (m.commitment === 'committed' && age < 16) this.fail('committedChild', after, `committed at ${age}`);
    }
    // Faith.
    const f0 = b0.faith;
    const f1 = b1.faith;
    if (f1.id === null ? f1.strength !== 0 : f1.strength < 1) this.fail('faithStrength', after, `faith ${f1.id} with strength ${f1.strength}`);
    if (f0.id !== f1.id && f1.changes > f0.changes) {
      const kind = f1.id === null ? 'lose' : f1.id === f1.raised && f0.id !== null ? 'return' : f0.id === null ? (f1.id === f1.raised ? 'return' : 'find') : 'convert';
      this.changes.push({ year: after.currentYear, kind, tradition: b1.values.tradition - b0.values.tradition, independence: b1.values.independence - b0.values.independence });
      r.faith.changes[kind]++;
    }
    if (!before.character.latent.faith && after.character.latent.faith) r.faith.latent.born++;
    if (after.discovery.surfaced.faith && !this.latentSurfaced) {
      this.latentSurfaced = true;
      r.faith.latent.surfaced++;
    }
    if (before.character.latent.faith && !after.character.latent.faith) r.faith.latent.acted++;
    const partner = after.housing.partnerId !== undefined ? after.people[after.housing.partnerId] : undefined;
    if (partner && f1.id !== null) {
      const theirs = partner.faith?.id;
      if (theirs !== undefined && theirs !== null && theirs !== f1.id) r.faith.interfaithYears++;
    }
    // Money.
    const ledger = after.finances.lastLedger;
    if (ledger && ledger.year === after.currentYear && b1.memberships.length > 0 && ledger.gross > 0) {
      r.giving.years++;
      r.giving.given += ledger.giving;
      r.giving.gross += ledger.gross;
      r.giving.maxShare = Math.max(r.giving.maxShare, ledger.giving / ledger.gross);
      if (ledger.giving > c.balance.belonging.groups.cost.incomeCap * ledger.gross + 1) this.fail('givingCap', after, `giving ${ledger.giving} of ${ledger.gross}`);
    }
  }

  private endMembership(life: LifeState, groupId: Id, topRung: number): void {
    const r = this.report;
    const g = life.belonging.groups[groupId];
    r.people.memberships++;
    if (g) {
      const living = g.people.filter((id) => life.people[id]?.alive);
      r.people.people += living.length;
      for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
        const key = living[i]! < living[j]! ? `${living[i]}|${living[j]}` : `${living[j]}|${living[i]}`;
        if (life.web.ties[key]) r.people.ties++;
      }
    }
    if ((this.yearsIn[groupId] ?? 0) >= 10) r.longMemberships++;
    r.roles.total++;
    const key = String(Math.min(topRung, 3));
    r.roles.rung[key] = (r.roles.rung[key] ?? 0) + 1;
  }

  finish(life: LifeState): void {
    const r = this.report;
    const c = this.content;
    r.lives++;
    const age = life.character.age;
    const b = life.belonging;
    for (const m of b.memberships) this.endMembership(life, m.groupId, this.maxRung[m.groupId] ?? m.rung);
    if (age >= 18) r.reached[18]++;
    if (age >= 30) {
      r.reached[30]++;
      if (this.everMember) {
        r.members.any++;
        for (const t of this.types) r.members.byType[t]++;
      }
      if (b.faith.id !== null) {
        r.faith.at30++;
        r.faith.strength[30].n++;
        r.faith.strength[30].sum += b.faith.strength;
      }
    }
    if (age >= 50) {
      r.reached[50]++;
      if (b.faith.changes > 0) r.faith.changedLives++;
    }
    if (this.everMember) {
      if (this.roseOrLed.rose) r.roles.livesRose++;
      if (this.roseOrLed.led) r.roles.livesLed++;
    }
    // Strength at 50 and 70 (the value at the end of the life stands in for the age reached, so only lives that got that far count).
    if (age >= 50 && b.faith.id !== null) {
      r.faith.strength[50].n++;
      r.faith.strength[50].sum += b.faith.strength;
    }
    if (age >= 70 && b.faith.id !== null) {
      r.faith.strength[70].n++;
      r.faith.strength[70].sum += b.faith.strength;
    }
    if (this.first && this.first.belonging.household.faith !== null && age >= 30) {
      r.faith.kept.reach30++;
      if (b.faith.id === this.first.belonging.household.faith) r.faith.kept.kept30++;
    }
    // What a change did.
    for (const ch of this.changes) {
      const around = (from: number, to: number) => {
        const vals = [];
        for (let y = from; y <= to; y++) if (this.happiness[y] !== undefined) vals.push(this.happiness[y]!);
        return vals.length === 0 ? null : vals.reduce((a, x) => a + x, 0) / vals.length;
      };
      const pre = around(ch.year - 3, ch.year - 1);
      const post = around(ch.year + 1, ch.year + 3);
      const e = r.faith.effect[ch.kind];
      e.n++;
      if (pre !== null && post !== null) e.happiness += post - pre;
      e.tradition += ch.tradition;
      e.independence += ch.independence;
    }
    // Values and reputation: long members against people who never belonged.
    if (this.first && age >= 40) {
      const start = this.first.belonging.values;
      const long = this.committedYears >= 10 || this.anyYears >= 15;
      const never = !this.everMember;
      const bucket = long ? r.effects.long : never ? r.effects.never : null;
      if (bucket) {
        bucket.lives++;
        for (const v of VALUE_IDS) bucket.values[v] += b.values[v] - start[v];
        bucket.reputation += life.character.hidden.reputation - this.reputationStart;
        const com = long ? r.effects.community.long : r.effects.community.never;
        com.n++;
        com.sum += b.community;
      }
    }
    // The belonging events that fired.
    for (const [id, log] of Object.entries(life.eventLog)) if (isBelongingEvent(id, c)) r.events[id] = (r.events[id] ?? 0) + log.count;
    for (const item of life.web.items) {
      if (item.kind === 'groupScandal' || item.kind === 'groupHonor') {
        r.news[item.kind].items++;
        if (Object.values(item.holders).filter((h) => h.from !== 'saw').length > 0) r.news[item.kind].told++;
      }
    }
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const mean = (sum: number, n: number, digits = 1) => (n > 0 ? (sum / n).toFixed(digits) : 'n/a');

export function formatBelonging(r: BelongingReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'Belonging (W2):'];
  lines.push(`  ${r.lives} lives; reached 18: ${r.reached[18]}, 30: ${r.reached[30]}, 50: ${r.reached[50]}`);
  lines.push(`  groups: ${pct(r.members.any, r.reached[30])} of lives reaching 30 belonged to one at some time (${GROUP_TYPES.map((t) => `${t} ${pct(r.members.byType[t], r.reached[30])}`).join(', ')})`);
  lines.push(`    memberships begun: ${GROUP_TYPES.map((t) => `${t} ${r.joins.byType[t]}`).join(', ')}; taken along as a child ${r.joins.takenAlong}, through an event ${r.joins.fromEvent}, through the Groups screen ${r.joins.fromAction}`);
  lines.push(`    ended: left ${r.ends.left}, moved away ${r.ends.moved}, drifted ${r.ends.drifted}, too old for a youth group ${r.ends.agedOut}`);
  lines.push(`    member-years (casual / committed): ${GROUP_TYPES.map((t) => `${t} ${r.years[t].casual}/${r.years[t].committed}`).join(', ')}`);
  const ro = r.roles;
  lines.push(`  roles: ${ro.total} memberships ended or ongoing; highest role reached (0 is a plain member): ${Object.entries(ro.rung).sort().map(([k, v]) => `${k}${k === '3' ? '+' : ''} ${v}`).join(', ')}; promotions ${ro.promotions}; ${pct(ro.livesRose, r.members.any)} of members rose, ${pct(ro.livesLed, r.members.any)} led a group`);
  lines.push(`  people: ${mean(r.people.people, r.people.memberships)} people known per membership; ${mean(r.people.ties, r.people.memberships)} ties between them; ${pct(r.longMemberships, ro.total)} of memberships lasted ten years or more`);
  lines.push(`  giving: ${pct(r.giving.given, r.giving.gross)} of the income of member-years (${r.giving.years} years), at most ${(100 * r.giving.maxShare).toFixed(1)}% in a year`);
  const f = r.faith;
  lines.push(`  faith at birth: ${Object.entries(f.atBirth).map(([k, v]) => `${k} ${pct(v, r.lives)}`).join(', ')}`);
  lines.push(`    kept the household's faith to 30: ${pct(f.kept.kept30, f.kept.reach30)} of ${f.kept.reach30} lives raised in one; ${pct(f.at30, r.reached[30])} have a faith at 30; mean strength at 30 ${mean(f.strength[30].sum, f.strength[30].n)}, at 50 ${mean(f.strength[50].sum, f.strength[50].n)}, at 70 ${mean(f.strength[70].sum, f.strength[70].n)}`);
  lines.push(`    changes: ${pct(f.changedLives, r.reached[50])} of lives reaching 50 changed faith at least once (found ${f.changes.find}, lost ${f.changes.lose}, converted ${f.changes.convert}, returned ${f.changes.return}); a hidden pull: born with ${f.latent.born}, surfaced ${f.latent.surfaced}, acted on ${f.latent.acted}; interfaith years ${f.interfaithYears}`);
  for (const k of ['find', 'lose', 'convert', 'return'] as const) {
    const e = f.effect[k];
    lines.push(`      ${k.padEnd(8)} n ${String(e.n).padStart(4)}  happiness (3 years after minus 3 before) ${mean(e.happiness, e.n)}  tradition ${mean(e.tradition, e.n)}  independence ${mean(e.independence, e.n)}`);
  }
  const ef = r.effects;
  lines.push(`  values and reputation from birth to 40 or later: long members (${ef.long.lives} lives) against people who never belonged (${ef.never.lives}):`);
  for (const v of VALUE_IDS) lines.push(`    ${v.padEnd(13)} ${mean(ef.long.values[v], ef.long.lives)} against ${mean(ef.never.values[v], ef.never.lives)}`);
  lines.push(`    reputation ${mean(ef.long.reputation, ef.long.lives)} against ${mean(ef.never.reputation, ef.never.lives)}; community standing ${mean(ef.community.long.sum, ef.community.long.n)} against ${mean(ef.community.never.sum, ef.community.never.n)}`);
  lines.push(`  group news in the gossip web: scandals ${r.news.groupScandal.items} (passed on ${r.news.groupScandal.told}), honors ${r.news.groupHonor.items} (passed on ${r.news.groupHonor.told})`);
  const ids = Object.keys(content.events).filter((id) => isBelongingEvent(id, content));
  const never = ids.filter((id) => !r.events[id]).sort();
  const total = Object.values(r.events).reduce((a, b) => a + b, 0);
  lines.push(`  events: ${total} belonging events fired in all; ${ids.length - never.length} of ${ids.length} fired at least once`);
  if (never.length > 0) lines.push(`    never fired (${never.length}): ${never.slice(0, 40).join(', ')}${never.length > 40 ? ', ...' : ''}`);
  const x = r.violations;
  lines.push(`  must be zero: a membership outside your city ${x.city}, outside its ages ${x.age}, a committed child ${x.committedChild}, a faith without belief or belief without a faith ${x.faithStrength}, giving above the income cap ${x.givingCap}`);
  for (const m of r.messages) lines.push(`    ${m}`);
  return lines;
}

/** The W2 targets (balance/targets.yaml), on a report. */
export function belongingTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const r = sim.belonging;
  const t = content.balance.targets.belonging;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(1);
  const range = (rng: { min: number; max: number }, f: (x: number) => string) => `${f(rng.min)}–${f(rng.max)}`;
  const add = (label: string, value: number, rng: { min: number; max: number }, f: (x: number) => string) =>
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal: range(rng, f), met: !Number.isNaN(value) && value >= rng.min && value <= rng.max });
  const share = (n: number, d: number) => (d > 0 ? n / d : Number.NaN);
  add('lives reaching 30 that belonged to a group', share(r.members.any, r.reached[30]), t.memberShare, pct1);
  add('members who held a role above plain member', share(r.roles.livesRose, r.members.any), t.roleShare, pct1);
  add('lives reaching 30 with a faith', share(r.faith.at30, r.reached[30]), t.faithShare, pct1);
  add('lives reaching 50 whose faith changed', share(r.faith.changedLives, r.reached[50]), t.faithChangeShare, pct1);
  add('lives raised in a faith that kept it to 30', share(r.faith.kept.kept30, r.faith.kept.reach30), t.keptShare, pct1);
  add('share of member-years’ income given to groups', share(r.giving.given, r.giving.gross), t.givingShare, pct1);
  add('people known per membership', share(r.people.people, r.people.memberships), t.peoplePerGroup, num);
  add('memberships that lasted ten years or more', share(r.longMemberships, r.roles.total), t.longShare, pct1);
  const v = r.violations;
  const bad = v.city + v.age + v.committedChild + v.faithStrength + v.givingCap;
  out.push({ label: 'belonging rules broken (city, ages, committed child, faith strength, giving cap)', value: String(bad), short: String(bad), goal: '0', met: bad === 0 });
  const e = r.effects;
  const mv = (b: { lives: number; values: Record<ValueId, number> }, k: ValueId) => (b.lives > 0 ? b.values[k] / b.lives : Number.NaN);
  const gap = mv(e.long, 'community') - mv(e.never, 'community');
  out.push({ label: 'community value: long members above people who never belonged (points)', value: Number.isNaN(gap) ? 'n/a' : gap.toFixed(1), short: Number.isNaN(gap) ? 'n/a' : gap.toFixed(1), goal: '> 0', met: gap > 0 });
  const rep = (e.long.lives > 0 ? e.long.reputation / e.long.lives : Number.NaN) - (e.never.lives > 0 ? e.never.reputation / e.never.lives : Number.NaN);
  out.push({ label: 'reputation: long members above people who never belonged (points)', value: Number.isNaN(rep) ? 'n/a' : rep.toFixed(1), short: Number.isNaN(rep) ? 'n/a' : rep.toFixed(1), goal: '> 0', met: rep > 0 });
  return out;
}
