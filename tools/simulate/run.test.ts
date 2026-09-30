import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { formatReport, runSimulation } from './run';

describe('simulation runner', () => {
  it('plays lives and reports invariants, lifespans, events per year and event frequency', () => {
    const report = runSimulation(content, { lives: 20, seedPrefix: 'sim-test' });
    expect(report.lives).toBe(20);
    expect(report.invariantFailures).toBe(0);
    expect(report.lifespan.oldest).toBeLessThanOrEqual(content.balance.mortality.maxAge);
    expect(report.yearsOverCap).toBe(0);
    expect(report.events.map((e) => e.id)).toEqual(Object.keys(content.events).sort());
    expect(report.events.reduce((sum, e) => sum + e.fired, 0)).toBe(report.totalEventsFired);
    expect(report.totalEventsFired).toBeGreaterThan(0);
    const text = formatReport(report, content);
    expect(text).toContain('Invariant failures: 0');
    expect(text).toContain('lottery_ticket');
  });

  it('is deterministic', () => {
    expect(runSimulation(content, { lives: 5, seedPrefix: 'same' })).toEqual(runSimulation(content, { lives: 5, seedPrefix: 'same' }));
  });
});
