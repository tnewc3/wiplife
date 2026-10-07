import { describe, expect, it } from 'vitest';
import compiled from '../../src/content/compiled/content.json';
import type { ContentBundle, EventDef } from '../../src/content/schemas';
import { collectCoverage, eligibleEvents } from './dynamic';
import { coverageChecks, dryAges, formatCoverage, ranges } from './report';
import { analyzeContent, reachableEvents } from './static';
import { createLife } from '../../src/engine/life';

const content = compiled as ContentBundle;
/** A copy of the content with some events replaced or added. */
const withEvents = (events: Record<string, EventDef>): ContentBundle => ({ ...content, events: { ...content.events, ...events } });
const base = content.events.stranger_on_the_bench!;

describe('content coverage, static', () => {
  it('passes every static check on the real content', () => {
    const checks = coverageChecks(analyzeContent(content), null, content);
    expect(checks.filter((c) => !c.met)).toEqual([]);
  });

  it('counts events by stage, tone and rarity', () => {
    const s = analyzeContent(content);
    expect(s.events).toBe(Object.values(content.events).filter((e) => !e.retired).length);
    expect(Object.values(s.byTone).reduce((a, b) => a + b, 0)).toBe(s.events);
    expect(s.legendary).toContain('stranger_on_the_bench');
    expect(s.byStage.early.events).toBeGreaterThan(0);
  });

  it('finds a memory tag written but never read, and a flag set but never checked', () => {
    const lonely: EventDef = {
      ...base,
      id: 'lonely',
      rarity: 'common',
      choices: [
        { id: 'a', label: 'A', outcome: { effects: [{ type: 'memory', role: 'stranger', tag: 'covered_on_project' }] } },
        { id: 'b', label: 'B', outcome: { effects: [{ type: 'flag', key: 'met_the_stranger', value: true }] } },
      ],
    };
    // Remove every reader of the tag and the flag, then add the lonely writer.
    const events = Object.fromEntries(
      Object.entries(content.events).filter(([, e]) => !JSON.stringify([e.requires, e.weight, e.choices?.map((c) => c.visibleIf)]).match(/covered_on_project|met_the_stranger/)),
    );
    const s = analyzeContent({ ...content, events: { ...events, lonely } });
    expect(s.memoriesNeverRead.map((m) => m.tag)).toContain('covered_on_project');
    expect(s.flagsNeverChecked.map((f) => f.flag)).toContain('met_the_stranger');
  });

  it('finds a follow-up nothing can reach, even one in a loop with another', () => {
    const loopA: EventDef = { ...base, id: 'loop_a', followUpOnly: true, choices: [{ id: 'a', label: 'A', outcome: { effects: [{ type: 'schedule', eventId: 'loop_b', inYears: [1, 1] }] } }, { id: 'b', label: 'B', outcome: { effects: [] } }] };
    const loopB: EventDef = { ...loopA, id: 'loop_b', choices: [{ id: 'a', label: 'A', outcome: { effects: [{ type: 'schedule', eventId: 'loop_a', inYears: [1, 1] }] } }, { id: 'b', label: 'B', outcome: { effects: [] } }] };
    const bundle = withEvents({ loop_a: loopA, loop_b: loopB });
    expect(reachableEvents(bundle).has('loop_a')).toBe(false);
    expect(analyzeContent(bundle).unreachable).toEqual(['loop_a', 'loop_b']);
    expect(reachableEvents(content).has('stranger_returns')).toBe(true);
  });
});

describe('content coverage, simulated', () => {
  it('counts the events that could happen this year', () => {
    const life = createLife({ mode: 'random', seed: 'cov', birthYear: 2026 }, content);
    const eligible = eligibleEvents(life, content);
    expect(eligible.size).toBeGreaterThan(0);
    for (const id of eligible) expect(content.events[id]!.lifeStages).toContain('early');
  });

  it('collects eligibility, dry spots and repetition from simulated lives', { timeout: 60_000 }, () => {
    const d = collectCoverage(content, { lives: 3, seedPrefix: 'cov-test' });
    expect(d.lives).toBe(3);
    expect(d.years).toBeGreaterThan(100);
    expect(d.repetition.firesPerLife).toBeGreaterThan(d.repetition.uniquePerLife);
    expect(d.byAge.length).toBeGreaterThan(50);
    expect(Array.isArray(dryAges(d))).toBe(true);
    expect(formatCoverage(analyzeContent(content), d, content)).toMatch(/eligible events per year/);
  });

  it('writes runs of ages as ranges', () => {
    expect(ranges([5, 1, 2, 3, 9, 10])).toBe('1–3, 5, 9–10');
    expect(ranges([])).toBe('');
  });
});
