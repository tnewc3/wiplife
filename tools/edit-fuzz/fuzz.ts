/**
 * The edit fuzz (G1, docs/expansion.md, "Simulation"): takes simulated lives at random ages, applies random valid and invalid
 * god mode edits and checks that
 *   - a refused edit changes nothing,
 *   - an accepted edit passes the invariants and the save schema, leaves no romance with anyone under 18 or with family, draws
 *     nothing from the life's generator and writes no history line, flag, memory or event,
 *   - the life plays five more years with no invariant failure, and
 *   - the input log replays to the same life.
 * It lives outside the simulation: the simulation never edits a life.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { playYear } from '../../src/engine/autoplay';
import { checkInvariants } from '../../src/engine/invariants';
import { createLife } from '../../src/engine/life';
import { checkEdit, EditRefusedError, performEdit } from '../../src/engine/godmode';
import { isFamilyKind, isRomanticKind, kindSince } from '../../src/engine/relationships';
import { replayLife } from '../../src/engine/replay';
import { createRng, nextInt, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import { loadedLifeSchema } from '../../src/persistence/lifeSchema';

export interface FuzzReport {
  lives: number;
  attempted: number;
  accepted: number;
  refused: number;
  /** Refusals by code. */
  codes: Record<string, number>;
  /** What went wrong, if anything (empty when clean). */
  problems: string[];
}

type Payload = Record<string, unknown>;

const ri = (rng: RngState, min: number, max: number) => nextInt(rng, min, max);
/** A score that is usually in range and sometimes not. */
const score = (rng: RngState) => (ri(rng, 0, 9) === 0 ? pick(rng, [-3, 101, 250]) : ri(rng, 0, 100));

function randomPayload(life: LifeState, content: ContentBundle, rng: RngState): Payload {
  const people = Object.keys(life.people).sort();
  const onPerson = people.length > 0 && ri(rng, 0, 2) > 0;
  const personId = onPerson ? pick(rng, people) : null;
  const payload: Payload = { target: personId === null ? 'self' : { person: personId } };
  const cities = Object.keys(content.cities).sort();
  const jobs = Object.keys(content.jobs).sort();
  const conditions = Object.keys(content.conditions).sort();
  const faiths = Object.keys(content.registries.belonging.faiths).sort();
  const languages = Object.keys(content.languages).sort();
  const genders = ['man', 'woman', 'nonbinary'];
  const areas = ri(rng, 1, 3);
  for (let i = 0; i < areas; i++) {
    switch (ri(rng, 0, 15)) {
      case 0:
        payload.name = { first: pick(rng, ['Ada', 'Bo', 'Cy', 'Dee', '', 'X1', 'Zoë']), last: pick(rng, ['Lee', 'Okafor', "O'Neil", 'Park-Smith', '']) };
        break;
      case 1:
        payload.identity = { attractedTo: genders.filter(() => ri(rng, 0, 1) === 1), ...(ri(rng, 0, 3) === 0 ? { genderCategory: pick(rng, genders) } : {}) };
        break;
      case 2:
        payload.looks = score(rng);
        break;
      case 3:
        payload.stats = personId === null ? { happiness: score(rng), health: ri(rng, 0, 100), stress: score(rng) } : { smarts: score(rng), mood: score(rng) };
        break;
      case 4:
        payload.personality = { kindness: ri(rng, 0, 5) === 0 ? null : score(rng), ambition: score(rng) };
        break;
      case 5:
        payload.relationship = { ...(ri(rng, 0, 1) === 0 ? { kind: pick(rng, ['friend', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate']) } : {}), ...(ri(rng, 0, 2) === 0 ? { status: pick(rng, ['active', 'estranged', 'ended']) } : {}), affection: score(rng) };
        break;
      case 6:
        payload.work = { jobId: ri(rng, 0, 5) === 0 ? null : pick(rng, [...jobs, 'no_such_job']), level: ri(rng, 1, 7) };
        break;
      case 7:
        payload.cityId = pick(rng, [...cities, 'nowhere']);
        break;
      case 8:
        payload.faith = { id: ri(rng, 0, 3) === 0 ? null : pick(rng, faiths), strength: ri(rng, 0, 100) };
        break;
      case 9:
        payload.languages = Array.from({ length: ri(rng, 0, 3) }, (_, n) => ({ id: pick(rng, languages), skill: score(rng), native: n === 0 && ri(rng, 0, 4) > 0 }));
        break;
      case 10:
        payload.citizenships = Array.from({ length: ri(rng, 0, 3) }, () => pick(rng, ['us', 'ca', 'gb', 'mx', 'de', 'fr']));
        break;
      case 11:
        payload.money = personId === null ? { savings: pick(rng, [0, 500, 12_345, 2_000_000_000, -4]), debts: ri(rng, 0, 1) === 0 ? [] : [{ kind: pick(rng, ['personal', 'student', 'mortgage', 'shark']), balance: pick(rng, [0, 900, 50_000, 999_999_999_999]) }] } : { savings: 5 };
        break;
      case 12:
        payload.conditions = Array.from({ length: ri(rng, 0, 2) }, () => ({ conditionId: pick(rng, conditions), severity: ri(rng, 0, 100), treated: ri(rng, 0, 1) === 1 }));
        payload.troubles = Array.from({ length: ri(rng, 0, 3) }, () => ({ kind: pick(rng, ['illness', 'addiction']), refId: pick(rng, conditions), severity: ri(rng, 0, 100), treated: false }));
        break;
      case 13:
        payload.birthYear = life.currentYear - ri(rng, 0, 90);
        break;
      case 14:
        payload.values = { talent: ri(rng, 0, 3) === 0 ? null : pick(rng, Object.keys(content.talents).sort()), talentDiscovered: ri(rng, 0, 1) === 1, luck: score(rng) };
        break;
      default:
        payload.latent = { attractedTo: ri(rng, 0, 1) === 0 ? null : [pick(rng, genders)], faith: ri(rng, 0, 1) === 0 ? null : { id: pick(rng, faiths) } };
    }
  }
  return payload;
}

/** The romance and family rules, checked on any life, accepted edit or not. */
function romanceProblems(life: LifeState, content: ContentBundle): string[] {
  const { adultAge } = content.balance.relationships;
  const out: string[] = [];
  for (const rel of Object.values(life.relationships)) {
    const person = life.people[rel.personId];
    if (!person || !isRomanticKind(rel.kind)) continue;
    if (isFamilyKind(rel.kind)) out.push(`${rel.personId} is family and romantic`);
    if (kindSince(rel) - person.birthYear < adultAge || kindSince(rel) - life.birthYear < adultAge) out.push(`${rel.personId} (${rel.kind}) was under ${adultAge} when it began`);
  }
  return out;
}

const quiet = (l: LifeState) => JSON.stringify({ history: l.history, flags: l.flags, eventLog: l.eventLog, scheduled: l.scheduled, pending: l.pending, rng: l.rng, memories: Object.values(l.relationships).map((r) => r.memories) });

/** Fuzzes one life. Adds to the report. */
export function fuzzLife(index: number, seedPrefix: string, content: ContentBundle, report: FuzzReport, options: { maxAge?: number; edits?: number } = {}): void {
  const seed = `${seedPrefix}-${index}`;
  const rng = createRng(`edit-fuzz:${seed}`);
  const stopAt = ri(rng, 0, options.maxAge ?? 70);
  let life = createLife({ mode: 'random', seed, birthYear: 2000, countryId: 'us' }, content);
  while (life.phase !== 'dead' && life.character.age < stopAt) life = playYear(life, content);
  if (life.phase !== 'yearStart') return;
  report.lives++;
  const problem = (message: string) => report.problems.push(`${seed} age ${life.character.age}: ${message}`);
  let checkedPlayOn = 0;

  for (let n = 0; n < (options.edits ?? 40); n++) {
    const payload = randomPayload(life, content, rng);
    const before = life;
    const beforeText = JSON.stringify(before);
    report.attempted++;
    const verdict = checkEdit(before, payload, content);
    let next: LifeState;
    try {
      next = performEdit(before, payload, content);
    } catch (e) {
      if (!(e instanceof EditRefusedError)) {
        problem(`threw ${String(e)} for ${JSON.stringify(payload)}`);
        continue;
      }
      report.refused++;
      for (const r of e.refusals) report.codes[r.code] = (report.codes[r.code] ?? 0) + 1;
      if (e.refusals.some((r) => r.code === 'invariant' || r.code === 'internal')) problem(`${e.refusals.map((r) => `${r.code}: ${String(r.facts.message ?? '')}`).join('; ')} for ${JSON.stringify(payload)}`);
      if (JSON.stringify(before) !== beforeText) problem('a refused edit changed the life');
      continue;
    }
    report.accepted++;
    if (!verdict.ok) problem(`checkEdit refused what performEdit accepted: ${JSON.stringify(payload)}`);
    const broken = checkInvariants(next, content).filter((f) => !checkInvariants(before, content).includes(f));
    if (broken.length > 0) problem(`invariants broken by ${JSON.stringify(payload)}: ${broken.join('; ')}`);
    const parsed = loadedLifeSchema(content).safeParse(next);
    if (!parsed.success) problem(`the schema refused an accepted edit ${JSON.stringify(payload)}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    for (const m of romanceProblems(next, content)) if (!romanceProblems(before, content).includes(m)) problem(`romance rule broken by ${JSON.stringify(payload)}: ${m}`);
    if (quiet(next) !== quiet(before)) problem(`an edit wrote history, a flag, a memory or an event, or drew a random number: ${JSON.stringify(payload)}`);
    if (next.inputLog.length !== before.inputLog.length + 1 || next.inputLog.at(-1)?.kind !== 'edit') problem('an accepted edit did not add one edit record');
    life = next;
    // Five more years on a copy, with no failure.
    if (checkedPlayOn < 2) {
      checkedPlayOn++;
      let played = life;
      for (let y = 0; y < 5 && played.phase !== 'dead'; y++) {
        played = playYear(played, content);
        const failures = checkInvariants(played, content);
        if (failures.length > 0) {
          problem(`year ${y + 1} after ${JSON.stringify(payload)}: ${failures.join('; ')}`);
          break;
        }
      }
    }
  }
  const replayed = replayLife(life.inputLog, content);
  if (JSON.stringify(replayed) !== JSON.stringify(life)) problem('the input log did not replay to the same life');
}

export function fuzz(content: ContentBundle, options: { lives: number; seedPrefix?: string; maxAge?: number; edits?: number }): FuzzReport {
  const report: FuzzReport = { lives: 0, attempted: 0, accepted: 0, refused: 0, codes: {}, problems: [] };
  for (let i = 0; i < options.lives; i++) fuzzLife(i, options.seedPrefix ?? 'edit-fuzz', content, report, options);
  return report;
}
