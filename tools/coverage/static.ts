/**
 * The static half of the content coverage report (tools/coverage.ts, Stage
 * 10): what the content holds, read without playing a life. Events by life
 * stage, category, tone and rarity; memory tags written but never read; flags
 * set but never checked; and events no chain can reach.
 */
import type { ContentBundle, EventDef, Outcome, Rarity, Tone } from '../../src/content/schemas';
import type { LifeStage } from '../../src/engine/types';
import { LIFE_STAGE_IDS } from '../../src/content/schemas';
import { referencesIn } from '../../src/engine/conditions';

export interface StaticCoverage {
  /** Events that aren't retired. */
  events: number;
  /** Of those, the ones that only happen when scheduled or queued (followUpOnly). */
  followUps: number;
  /** Events that can happen in each life stage (an event listing several stages counts in each). */
  byStage: Record<LifeStage, { events: number; onTheirOwn: number }>;
  byCategory: Record<string, number>;
  byTone: Record<Tone, number>;
  byRarity: Record<Rarity, number>;
  /** Stage × tone: events that can happen on their own in each stage, by tone. */
  stageTone: Record<LifeStage, Record<Tone, number>>;
  legendary: string[];
  /** Memory tags some event writes that no event reads (with the events that write them). */
  memoriesNeverRead: { tag: string; writtenBy: string[] }[];
  /** Memory tags read by a condition that no event writes. */
  memoriesNeverWritten: string[];
  /** Flags some event sets that no condition or balance file checks (with the events that set them). */
  flagsNeverChecked: { flag: string; setBy: string[] }[];
  /** Flags a condition checks that no event sets. */
  flagsNeverSet: string[];
  /** Events (not retired) that nothing can lead to: follow-ups no reachable event schedules. */
  unreachable: string[];
  /** Registered memory tags and flags no content uses at all. */
  unusedRegistry: { memories: string[]; flags: string[] };
}

const TONES: Tone[] = ['light', 'neutral', 'serious', 'dark'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** Every outcome an event can have. */
export function eventOutcomes(def: EventDef): Outcome[] {
  const fromChoices = (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
  return def.autoOutcome ? [...fromChoices, def.autoOutcome] : fromChoices;
}

/** Every condition an event holds: its requirements, weight modifiers and choice visibility. */
function eventConditions(def: EventDef) {
  return [def.requires, ...(def.weight.modifiers ?? []).map((m) => m.if), ...(def.choices ?? []).map((c) => c.visibleIf)];
}

const addTo = (map: Map<string, Set<string>>, key: string, id: string) => {
  const set = map.get(key) ?? new Set<string>();
  set.add(id);
  map.set(key, set);
};

/**
 * The events that start without being scheduled: every event that can happen
 * on its own, plus the events registries queue (management actions, money
 * trouble, work results, doctor visits, the law and self-discovery).
 */
export function rootEvents(content: ContentBundle): Set<string> {
  const roots = new Set<string>();
  for (const def of Object.values(content.events)) if (!def.retired && !def.followUpOnly) roots.add(def.id);
  const r = content.registries;
  const lists: { events: string[] }[] = [
    ...Object.values(r.actions.actions),
    ...Object.values(r.triggers.triggers),
    ...Object.values(r.work.results),
    ...Object.values(r.health.doctor),
    ...Object.values(r.legal.triggers),
    ...Object.values(r.discovery.surfacing),
    ...Object.values(r.discovery.resurfacing),
    r.discovery.crisis,
    r.discovery.comingOut,
  ];
  for (const list of lists) for (const id of list.events) roots.add(id);
  return roots;
}

/** Events reachable from the roots by following schedule effects. */
export function reachableEvents(content: ContentBundle): Set<string> {
  const seen = new Set<string>();
  const queue = [...rootEvents(content)];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const def = content.events[id];
    if (!def || def.retired || seen.has(id)) continue;
    seen.add(id);
    for (const outcome of eventOutcomes(def)) {
      for (const effect of outcome.effects) if (effect.type === 'schedule') queue.push(effect.eventId);
    }
  }
  return seen;
}

export function analyzeContent(content: ContentBundle): StaticCoverage {
  const events = Object.values(content.events).filter((def) => !def.retired);
  const byStage = Object.fromEntries(LIFE_STAGE_IDS.map((s) => [s, { events: 0, onTheirOwn: 0 }])) as StaticCoverage['byStage'];
  const stageTone = Object.fromEntries(
    LIFE_STAGE_IDS.map((s) => [s, Object.fromEntries(TONES.map((t) => [t, 0]))]),
  ) as StaticCoverage['stageTone'];
  const byCategory: Record<string, number> = {};
  const byTone = Object.fromEntries(TONES.map((t) => [t, 0])) as Record<Tone, number>;
  const byRarity = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;

  const memoryWrites = new Map<string, Set<string>>();
  const memoryReads = new Map<string, Set<string>>();
  const flagWrites = new Map<string, Set<string>>();
  const flagReads = new Map<string, Set<string>>();

  for (const def of events) {
    byCategory[def.category] = (byCategory[def.category] ?? 0) + 1;
    byTone[def.tone]++;
    byRarity[def.rarity]++;
    for (const stage of def.lifeStages) {
      byStage[stage].events++;
      if (!def.followUpOnly) {
        byStage[stage].onTheirOwn++;
        stageTone[stage][def.tone]++;
      }
    }
    for (const cond of eventConditions(def)) {
      const refs = referencesIn(cond);
      for (const tag of refs.memories) addTo(memoryReads, tag, def.id);
      for (const flag of refs.flags) addTo(flagReads, flag, def.id);
    }
    for (const outcome of eventOutcomes(def)) {
      for (const effect of outcome.effects) {
        if (effect.type === 'memory') addTo(memoryWrites, effect.tag, def.id);
        if (effect.type === 'flag') addTo(flagWrites, effect.key, def.id);
      }
    }
  }
  // Other content that checks flags: job requirements, condition onsets, and
  // the admission odds in balance/education.yaml.
  for (const job of Object.values(content.jobs)) for (const flag of referencesIn(job.requires).flags) addTo(flagReads, flag, `jobs/${job.id}`);
  for (const cond of Object.values(content.conditions)) {
    for (const flag of referencesIn(cond.onset?.requires).flags) addTo(flagReads, flag, `conditions/${cond.id}`);
  }
  const admissionFlags = (node: unknown, path: string): void => {
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'flags' && typeof value === 'object' && value !== null) {
        for (const flag of Object.keys(value)) addTo(flagReads, flag, `balance/education.yaml ${path}`);
      } else admissionFlags(value, path ? `${path}.${key}` : key);
    }
  };
  admissionFlags(content.balance.education.admission, 'admission');

  const sorted = (xs: Iterable<string>) => [...xs].sort();
  const reachable = reachableEvents(content);
  const tags = Object.keys(content.registries.memories.tags);
  const flags = Object.keys(content.registries.flags.flags);

  return {
    events: events.length,
    followUps: events.filter((def) => def.followUpOnly).length,
    byStage,
    byCategory: Object.fromEntries(Object.entries(byCategory).sort(([a], [b]) => (a < b ? -1 : 1))),
    byTone,
    byRarity,
    stageTone,
    legendary: sorted(events.filter((def) => def.rarity === 'legendary').map((def) => def.id)),
    memoriesNeverRead: sorted(memoryWrites.keys())
      .filter((tag) => !memoryReads.has(tag))
      .map((tag) => ({ tag, writtenBy: sorted(memoryWrites.get(tag)!) })),
    memoriesNeverWritten: sorted(memoryReads.keys()).filter((tag) => !memoryWrites.has(tag)),
    flagsNeverChecked: sorted(flagWrites.keys())
      .filter((flag) => !flagReads.has(flag))
      .map((flag) => ({ flag, setBy: sorted(flagWrites.get(flag)!) })),
    flagsNeverSet: sorted(flagReads.keys()).filter((flag) => !flagWrites.has(flag)),
    unreachable: sorted(events.filter((def) => !reachable.has(def.id)).map((def) => def.id)),
    unusedRegistry: {
      memories: tags.filter((t) => !memoryWrites.has(t) && !memoryReads.has(t)).sort(),
      flags: flags.filter((f) => !flagWrites.has(f) && !flagReads.has(f)).sort(),
    },
  };
}
