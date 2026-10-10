/**
 * The eulogy and the funeral, measured (W1): how many lives end with a
 * speaker and who the speakers are (what they were to you, and how they felt),
 * why the lives without one had none, how varied the eulogies are (the share of
 * template pieces used, and of eulogies that differ from every other), who
 * stayed away and why, and who could not come. It also checks, life by life,
 * what must always hold: the speaker is the closest eligible living person,
 * the eulogy only uses memories and stories its speaker holds, and everyone
 * listed as staying away is someone with a cause to.
 */
import { ABSENCE_CAUSES, COULD_NOT_REASONS, EULOGY_GROUPS, EULOGY_TONES, type ContentBundle } from '../../src/content/schemas';
import { absenceCauses, askedSpeaker, chooseSpeaker, couldNotAttend, eulogyPieces, expectedGuests, writeFuneral } from '../../src/engine/eulogy';
import { ageOf, isChildKind } from '../../src/engine/relationships';
import type { Funeral, Id, LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

export interface EulogyReport {
  /** Lives that ended with a funeral. */
  lives: number;
  withSpeaker: number;
  /** Speakers by what they were to you, by tone, and both together. */
  byGroup: Record<string, number>;
  byTone: Record<string, number>;
  byGroupTone: Record<string, number>;
  /** Why a life had no speaker: nobody alive and in your life, someone alive but too distant, or the people close enough could not come. */
  noSpeakerWhy: { nobodyLeft: number; notClose: number; couldNotCome: number };
  /** Times each template piece was used in an eulogy. */
  pieceUse: Record<string, number>;
  /** How many pieces the eulogy can use. */
  pieceCount: number;
  /** How many different eulogies were written (the same text twice counts once). */
  distinctEulogies: number;
  /** Paragraphs and pieces per eulogy, summed. */
  paragraphs: number;
  piecesUsed: number;
  /** Pieces by kind: memories told, stories believed (true and twisted), what they never knew, moments. */
  told: { memories: number; beliefsTrue: number; beliefsTwisted: number; unknown: number; milestones: number; bare: number };
  /** Eulogies that tell no memory, one memory, two or more. */
  memoriesTold: number[];
  absence: {
    /** Lives where someone chose not to come, and how many people, by strongest cause. */
    livesWithAbsent: number;
    people: number;
    byCause: Record<string, number>;
    /** People left out of the list because it was full. */
    unlisted: number;
    mostListed: number;
  };
  couldNot: { livesWith: number; people: number; byReason: Record<string, number> };
  /** What must always hold; each must be zero. */
  violations: { speaker: number; heldMemory: number; heldBelief: number; absentWithoutCause: number; absentUnable: number; underAge: number };
  /** The messages for the first few violations. */
  messages: string[];
}

export function emptyEulogyReport(content: ContentBundle): EulogyReport {
  return {
    lives: 0,
    withSpeaker: 0,
    byGroup: Object.fromEntries(EULOGY_GROUPS.map((g) => [g, 0])),
    byTone: Object.fromEntries(EULOGY_TONES.map((t) => [t, 0])),
    byGroupTone: Object.fromEntries(EULOGY_GROUPS.flatMap((g) => EULOGY_TONES.map((t) => [`${g}.${t}`, 0]))),
    noSpeakerWhy: { nobodyLeft: 0, notClose: 0, couldNotCome: 0 },
    pieceUse: Object.fromEntries(eulogyPieces(content).map((p) => [p.id, 0])),
    pieceCount: eulogyPieces(content).length,
    distinctEulogies: 0,
    paragraphs: 0,
    piecesUsed: 0,
    told: { memories: 0, beliefsTrue: 0, beliefsTwisted: 0, unknown: 0, milestones: 0, bare: 0 },
    memoriesTold: [0, 0, 0],
    absence: { livesWithAbsent: 0, people: 0, byCause: Object.fromEntries(ABSENCE_CAUSES.map((c) => [c, 0])), unlisted: 0, mostListed: 0 },
    couldNot: { livesWith: 0, people: 0, byReason: Object.fromEntries(COULD_NOT_REASONS.map((r) => [r, 0])) },
    violations: { speaker: 0, heldMemory: 0, heldBelief: 0, absentWithoutCause: 0, absentUnable: 0, underAge: 0 },
    messages: [],
  };
}

/** Watches the funerals of a run's lives. One of these per run. */
export class EulogyWatcher {
  private readonly texts = new Set<string>();

  constructor(
    private readonly report: EulogyReport,
    private readonly content: ContentBundle,
  ) {}

  private fail(kind: keyof EulogyReport['violations'], life: LifeState, message: string): void {
    this.report.violations[kind]++;
    if (this.report.messages.length < 8) this.report.messages.push(`${life.seed}: ${message}`);
  }

  /** The funeral of a life that has just ended. */
  finish(life: LifeState): void {
    const r = this.report;
    const funeral = writeFuneral(life, this.content);
    if (!funeral) return;
    r.lives++;
    this.checkSpeaker(life, funeral);
    this.checkAbsent(life, funeral);
    const e = funeral.eulogy;
    if (!e) {
      this.whyNoSpeaker(life);
      return;
    }
    r.withSpeaker++;
    r.byGroup[e.group]!++;
    r.byTone[e.tone]!++;
    r.byGroupTone[`${e.group}.${e.tone}`]!++;
    this.texts.add(e.paragraphs.join('\n'));
    r.distinctEulogies = this.texts.size;
    r.paragraphs += e.paragraphs.length;
    r.piecesUsed += e.pieces.length;
    let memories = 0;
    for (const id of e.pieces) {
      r.pieceUse[id] = (r.pieceUse[id] ?? 0) + 1;
      if (id.startsWith('memory.')) {
        r.told.memories++;
        memories++;
      } else if (id.startsWith('belief.true.')) r.told.beliefsTrue++;
      else if (id.startsWith('belief.twisted.')) r.told.beliefsTwisted++;
      else if (id.startsWith('unknown.')) r.told.unknown++;
      else if (id.startsWith('milestone.')) r.told.milestones++;
      else if (id.startsWith('bare')) r.told.bare++;
    }
    r.memoriesTold[Math.min(memories, 2)]!++;
    this.checkHeld(life, e.pieces);
  }

  private whyNoSpeaker(life: LifeState): void {
    const why = this.report.noSpeakerWhy;
    const alive = Object.values(life.relationships).filter((rel) => life.people[rel.personId]?.alive && rel.status !== 'ended');
    if (alive.length === 0) why.nobodyLeft++;
    else {
      const min = this.content.balance.eulogy.speaker.minCombined;
      const close = alive.filter((rel) => rel.status === 'active' && rel.kind !== 'ex' && rel.affection + rel.trust >= min);
      if (close.length > 0) why.couldNotCome++;
      else why.notClose++;
    }
  }

  /** The speaker has the highest affection plus trust among those who could speak (found here without the engine's own sort). */
  private checkSpeaker(life: LifeState, funeral: Funeral): void {
    const b = this.content.balance.eulogy.speaker;
    let bestScore = -1;
    let bestRank = 3;
    let bestIds: Id[] = [];
    for (const rel of Object.values(life.relationships)) {
      const person = life.people[rel.personId];
      if (!person?.alive || rel.status !== 'active' || (b.excludedKinds as readonly string[]).includes(rel.kind)) continue;
      if (ageOf(life, person) < b.minAge || couldNotAttend(life, person.id, this.content) !== null) continue;
      const score = rel.affection + rel.trust;
      if (score < b.minCombined) continue;
      const rank = rel.kind === 'spouse' ? 0 : isChildKind(rel.kind) ? 1 : 2;
      if (score > bestScore || (score === bestScore && rank < bestRank)) {
        bestScore = score;
        bestRank = rank;
        bestIds = [person.id];
      } else if (score === bestScore && rank === bestRank) bestIds.push(person.id);
    }
    // L1: the person you asked to speak in your final wishes, when they can, speaks whoever is closest.
    const asked = askedSpeaker(life, this.content);
    if (asked) {
      bestIds = [asked.personId];
    }
    const names = bestIds.map((id) => `${life.people[id]!.name.first} ${life.people[id]!.name.last}`);
    if (bestIds.length === 0) {
      if (funeral.eulogy) this.fail('speaker', life, `a speaker (${funeral.eulogy.speakerName}) where nobody was eligible`);
    } else if (!funeral.eulogy || !names.includes(funeral.eulogy.speakerName)) {
      this.fail('speaker', life, `the speaker ${funeral.eulogy?.speakerName ?? 'none'} is not the closest eligible person (${names.join(' or ')})`);
    }
  }

  /** Everything the eulogy says about memories and stories is something the speaker holds. */
  private checkHeld(life: LifeState, pieces: string[]): void {
    const speaker = chooseSpeaker(life, this.content);
    if (!speaker) return;
    const rel = life.relationships[speaker.personId]!;
    const held = new Set(rel.memories.map((m) => m.tag));
    for (const id of pieces) {
      if (id.startsWith('memory.') && !held.has(id.slice('memory.'.length))) this.fail('heldMemory', life, `told memory ${id} that the speaker does not hold`);
      const twisted = id.startsWith('belief.twisted.');
      if (twisted || id.startsWith('belief.true.')) {
        const key = id.split('.').slice(2).join('.');
        const ok = life.web.items.some((item) => {
          const holder = item.holders[speaker.personId];
          return item.subject === 'you' && holder !== undefined && (twisted ? holder.version === key && holder.version !== item.truth : item.kind === key && holder.version === item.truth);
        });
        if (!ok) this.fail('heldBelief', life, `told belief ${id} that the speaker does not hold`);
      }
    }
  }

  /** Everyone listed as staying away is expected, free to choose, has a cause, and is old enough. */
  private checkAbsent(life: LifeState, funeral: Funeral): void {
    const r = this.report;
    const expected = expectedGuests(life, this.content);
    const speakerId = chooseSpeaker(life, this.content)?.personId;
    // Two guests can share a name (a child named after an aunt): the one the list means is the one that fits its side of the list.
    const byName = new Map<string, Id[]>();
    for (const id of expected) {
      const name = `${life.people[id]!.name.first} ${life.people[id]!.name.last}`;
      byName.set(name, [...(byName.get(name) ?? []), id]);
    }
    const find = (name: string, unable: boolean): Id | undefined => {
      const ids = byName.get(name) ?? [];
      return ids.find((id) => (couldNotAttend(life, id, this.content) !== null) === unable) ?? ids[0];
    };
    const strongest = (id: Id) => {
      const hits = absenceCauses(life, id, speakerId, this.content);
      return [...hits].sort((x, y) => y.p - x.p || ABSENCE_CAUSES.indexOf(x.cause) - ABSENCE_CAUSES.indexOf(y.cause))[0]?.cause;
    };
    if (funeral.notAttending.length > 0) r.absence.livesWithAbsent++;
    r.absence.people += funeral.notAttending.length + funeral.moreNotAttending;
    r.absence.unlisted += funeral.moreNotAttending;
    r.absence.mostListed = Math.max(r.absence.mostListed, funeral.notAttending.length);
    for (const g of funeral.notAttending) {
      const id = find(g.name, false);
      if (id === undefined) continue;
      if (couldNotAttend(life, id, this.content) !== null) this.fail('absentUnable', life, `${g.name} is listed as staying away but could not come`);
      const cause = strongest(id);
      // L1: someone you asked to your bedside who did not come is listed as staying away, with that as the cause.
      const declined = life.later.terminal?.visits.some((v) => v.id === id && !v.came) === true;
      if (!declined) {
        if (cause === undefined) this.fail('absentWithoutCause', life, `${g.name} stayed away with no cause (${g.reason})`);
        else r.absence.byCause[cause]!++;
      }
      if (ageOf(life, life.people[id]!) < this.content.balance.eulogy.speaker.minAge) this.fail('underAge', life, `${g.name} is under the age of choosing`);
    }
    if (funeral.couldNotAttend.length > 0) r.couldNot.livesWith++;
    r.couldNot.people += funeral.couldNotAttend.length;
    for (const g of funeral.couldNotAttend) {
      const id = find(g.name, true);
      const why = id === undefined ? null : couldNotAttend(life, id, this.content);
      if (why === null) this.fail('absentUnable', life, `${g.name} is listed as unable to come but could`);
      else r.couldNot.byReason[why]!++;
    }
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

export function formatEulogy(r: EulogyReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'The eulogy and the funeral (W1):'];
  lines.push(`  ${r.lives} lives ended with a funeral; ${pct(r.withSpeaker, r.lives)} (${r.withSpeaker}) had a speaker, ${pct(r.lives - r.withSpeaker, r.lives)} had none`);
  const why = r.noSpeakerWhy;
  lines.push(`  no speaker because: nobody left in your life ${why.nobodyLeft}, no one close enough ${why.notClose}, the close ones could not come ${why.couldNotCome}`);
  lines.push(`  speakers by what they were to you: ${EULOGY_GROUPS.map((g) => `${g} ${pct(r.byGroup[g]!, r.withSpeaker)}`).join(', ')}`);
  lines.push(`  speakers by tone: ${EULOGY_TONES.map((t) => `${t} ${pct(r.byTone[t]!, r.withSpeaker)}`).join(', ')}`);
  for (const g of EULOGY_GROUPS) lines.push(`    ${g.padEnd(8)} ${EULOGY_TONES.map((t) => `${t} ${String(r.byGroupTone[`${g}.${t}`]).padStart(5)}`).join('   ')}`);
  const used = Object.values(r.pieceUse).filter((n) => n > 0).length;
  lines.push(`  variety: ${used} of ${r.pieceCount} eulogy pieces used (${pct(used, r.pieceCount)}); ${r.distinctEulogies} different eulogies in ${r.withSpeaker} (${pct(r.distinctEulogies, r.withSpeaker)})`);
  lines.push(`  a eulogy has ${(r.paragraphs / Math.max(1, r.withSpeaker)).toFixed(1)} paragraphs and ${(r.piecesUsed / Math.max(1, r.withSpeaker)).toFixed(1)} pieces`);
  const t = r.told;
  lines.push(`  told: ${t.memories} memories, ${t.beliefsTrue} stories believed true, ${t.beliefsTwisted} twisted, ${t.unknown} things never known, ${t.milestones} moments, ${t.bare} plain openings (no memory to tell)`);
  lines.push(`  memories in a eulogy: none ${pct(r.memoriesTold[0]!, r.withSpeaker)}, one ${pct(r.memoriesTold[1]!, r.withSpeaker)}, two or more ${pct(r.memoriesTold[2]!, r.withSpeaker)}`);
  const never = Object.entries(r.pieceUse)
    .filter(([, n]) => n === 0)
    .map(([id]) => id);
  if (never.length > 0) lines.push(`  pieces never used (${never.length}): ${never.slice(0, 40).join(', ')}${never.length > 40 ? ', ...' : ''}`);
  lines.push(`  who stayed away: ${pct(r.absence.livesWithAbsent, r.lives)} of funerals, ${(r.absence.people / Math.max(1, r.lives)).toFixed(2)} people each on average (most listed ${r.absence.mostListed}, ${r.absence.unlisted} left off a full list)`);
  lines.push(`    by strongest cause: ${ABSENCE_CAUSES.map((c) => `${c} ${r.absence.byCause[c]}`).join(', ')}`);
  lines.push(`  could not come: ${pct(r.couldNot.livesWith, r.lives)} of funerals, ${r.couldNot.people} people (${COULD_NOT_REASONS.map((x) => `${x} ${r.couldNot.byReason[x]}`).join(', ')})`);
  const v = r.violations;
  lines.push(`  must be zero: speaker not the closest eligible ${v.speaker}, memory told without holding it ${v.heldMemory}, story told without holding it ${v.heldBelief}, stayed away without a cause ${v.absentWithoutCause}, listed wrongly as staying away or unable ${v.absentUnable}, under the age of choosing ${v.underAge}`);
  for (const m of r.messages) lines.push(`    ${m}`);
  void content;
  return lines;
}

/** The W1 targets (balance/targets.yaml), on a report. */
export function eulogyTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const r = sim.eulogy;
  const t = content.balance.targets.eulogy;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(0);
  const range = (rng: { min: number; max: number }, f: (x: number) => string) => `${f(rng.min)}–${f(rng.max)}`;
  const add = (label: string, value: number, rng: { min: number; max: number }, f: (x: number) => string) =>
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal: range(rng, f), met: !Number.isNaN(value) && value >= rng.min && value <= rng.max });
  const share = (n: number, d: number) => (d > 0 ? n / d : Number.NaN);
  const used = Object.values(r.pieceUse).filter((n) => n > 0).length;
  add('lives that end with a speaker', share(r.withSpeaker, r.lives), t.speakerShare, pct1);
  add('eulogy pieces used at least once', share(used, r.pieceCount), t.pieceVariety, pct1);
  add('eulogies different from every other', share(r.distinctEulogies, r.withSpeaker), t.distinctShare, pct1);
  add('kinds of speaker that speak', EULOGY_GROUPS.filter((g) => r.byGroup[g]! > 0).length, t.speakerGroups, num);
  add('funerals where someone chose not to come', share(r.absence.livesWithAbsent, r.lives), t.absentShare, pct1);
  add('funerals where someone could not come', share(r.couldNot.livesWith, r.lives), t.couldNotShare, pct1);
  const v = r.violations;
  const bad = v.speaker + v.heldMemory + v.heldBelief + v.absentWithoutCause + v.absentUnable + v.underAge;
  out.push({ label: 'funeral rules broken (closest speaker, held memories and stories, a cause for every absence)', value: String(bad), short: String(bad), goal: '0', met: bad === 0 });
  return out;
}
