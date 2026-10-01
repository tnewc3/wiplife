import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { formatComparison, formatReport, runSimulation, targetResults } from './run';

describe('simulation runner', () => {
  // Whole lives with every system: give them time.
  it('plays lives and reports invariants, lifespans, events per year and event frequency', { timeout: 60_000 }, () => {
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

  it('reports marriage and divorce rates, with the simulated player taking relationship actions', { timeout: 60_000 }, () => {
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

  it('reports careers: income by education path, promotions, firings and job tracks against the targets', { timeout: 60_000 }, () => {
    const report = runSimulation(content, { lives: 30, seedPrefix: 'sim-work' });
    const c = report.careers;
    expect(report.invariantFailures).toBe(0);
    expect(c.everEmployed).toBeGreaterThan(0);
    expect(c.jobYears).toBeGreaterThan(0);
    expect(c.applications.hired).toBeLessThanOrEqual(c.applications.tried);
    expect(c.tracks.map((t) => t.jobId)).toEqual(Object.keys(content.jobs).sort());
    for (const t of c.tracks) expect(t.reachedLevel2).toBeLessThanOrEqual(t.entered);
    const text = formatReport(report, content);
    expect(text).toContain('lifetime earnings by education path');
    expect(text).toMatch(/promotions \d+(\.\d)?%, firings \d+(\.\d)?%, layoffs \d+(\.\d)?%/);
    expect(text).toContain("bachelor's vs high school lifetime earnings");
  });

  it('reports trades and the net worth target, and runs a careless player beside the careful one', { timeout: 120_000 }, () => {
    const careful = runSimulation(content, { lives: 20, seedPrefix: 'sim-two' });
    const careless = runSimulation(content, { lives: 20, seedPrefix: 'sim-two', player: 'careless' });
    expect([careful.player, careless.player]).toEqual(['careful', 'careless']);
    expect(careless.invariantFailures).toBe(0);
    expect(careful.careers.trades.map((t) => t.tradeId)).toEqual(Object.keys(content.trades).sort());
    for (const t of careful.careers.trades) {
      expect(t.licensed).toBeLessThanOrEqual(t.enrolled);
      expect(t.jobIds.length).toBeGreaterThan(0);
    }
    expect(careless.careers.tradeMinded).toBe(0);
    const targets = targetResults(careful, content);
    expect(targets.map((r) => r.label)).toContain(`median net worth at ${content.balance.targets.money.netWorthAge}`);
    const text = formatComparison(careful, careless, content);
    expect(text).toContain('careless');
    expect(text.split('\n').filter((l) => /^ {2}\S/.test(l) && (l.includes('MET') || l.includes('NOT MET'))).length).toBe(targets.length);
    expect(formatReport(careful, content)).toContain('trades (');
  });

  it('is deterministic', { timeout: 60_000 }, () => {
    expect(runSimulation(content, { lives: 5, seedPrefix: 'same' })).toEqual(runSimulation(content, { lives: 5, seedPrefix: 'same' }));
  });
});
