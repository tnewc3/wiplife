import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { measureFullCircle, peopleTargets } from './people';
import { runSimulation } from './run';

describe("the people's lives report (E3)", () => {
  it('begins a year in well under 20 ms with a full circle of sixty people simulated', { timeout: 60_000 }, () => {
    // The budget is about what the code costs, not what a busy machine adds: the best of three runs is judged (other test files share the CPU).
    const budget = content.balance.targets.people.maxBeginYearMs;
    let best = Infinity;
    for (let run = 0; run < 3 && best >= budget; run++) {
      const timing = measureFullCircle(content, 60, 15);
      expect(timing.people).toBe(60);
      best = Math.min(best, timing.meanMs);
    }
    expect(best).toBeLessThan(budget);
  });

  it('measures work, love, trouble, requests and news, with no romance under 18 and no invariant failures', { timeout: 120_000 }, () => {
    const report = runSimulation(content, { lives: 12, seedPrefix: 'people-report' });
    const p = report.people;
    expect(report.invariantFailures).toBe(0);
    expect(p.lives).toBe(12);
    expect(p.years).toBeGreaterThan(500);
    expect(p.tiers.close).toBeGreaterThan(0);
    expect(p.tiers.near).toBeGreaterThan(0);
    expect(p.work.workingYears).toBeGreaterThan(0);
    expect(p.love.started).toBeGreaterThan(0);
    expect(p.underageRomance).toBe(0);
    expect(p.news.years).toBeGreaterThan(0);
    expect(p.news.mostInAYear).toBeLessThanOrEqual(content.balance.people.news.maxPerYear);
    expect(p.requests.maxInAYear).toBeLessThanOrEqual(content.balance.people.requests.maxPerYear);
    expect(report.yearsOverCap).toBe(0);
    expect(p.timing.years).toBe(p.years);
    // Every target in targets.yaml is reported.
    const labels = peopleTargets(report, content).map((r) => r.label);
    expect(labels).toContain('romance involving anyone under 18');
    expect(labels).toContain('requests that become cards, a year');
    expect(labels.length).toBeGreaterThanOrEqual(15);
  });
});
