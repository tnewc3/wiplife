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

  it('reports marriage and divorce rates, with the simulated player taking relationship actions', () => {
    const report = runSimulation(content, { lives: 30, seedPrefix: 'sim-rel' });
    const r = report.relationships;
    expect(report.invariantFailures).toBe(0);
    expect(r.adults).toBeGreaterThan(0);
    expect(r.everMarried).toBeLessThanOrEqual(r.everDated);
    expect(r.everDated).toBeLessThanOrEqual(r.adults);
    expect(r.marriedBy40).toBeLessThanOrEqual(r.reached40);
    expect(r.marriages).toBeGreaterThan(0);
    expect(r.divorces).toBeLessThanOrEqual(r.marriages);
    expect(r.actionsTaken.ask_out).toBeGreaterThan(0);
    // Each action fires exactly one of its result events, and those count as fired events.
    const askResults = report.events.filter((e) => content.registries.actions.actions.ask_out.events.includes(e.id));
    expect(askResults.reduce((sum, e) => sum + e.fired, 0)).toBe(r.actionsTaken.ask_out);
    const text = formatReport(report, content);
    expect(text).toMatch(/ever married \d+(\.\d)?%/);
    expect(text).toMatch(/divorces \d+ \(\d+(\.\d)?% of marriages\)/);
    expect(text).toContain('median age at first marriage');
  });

  it('is deterministic', () => {
    expect(runSimulation(content, { lives: 5, seedPrefix: 'same' })).toEqual(runSimulation(content, { lives: 5, seedPrefix: 'same' }));
  });
});
