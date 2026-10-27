import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { content } from '../../src/content';
import { lifeAtAge } from '../../src/engine/testFixtures';
import { chooseTravelAction, emptyTravelReport, formatTravel, TravelWatcher } from './travel';
describe('W5 simulation report', () => {
  it('aggregates completed trips/stays and effects without counting visitor returns as residence returns', () => {
    const life = produce(lifeAtAge('travel-report', 25), (d) => {
      d.travel.totals = { trips: 2, spent: 2500, encounters: 4, romances: 1, study: 1, work: 1, returns: 2, immersion: 20, distanceLost: 9, happiness: 10, stress: -8, destinations: { montreal: 2, london: 2 }, styles: {}, activities: {}, souvenirs: {}, perDiem: 0, familyStays: 0, familyMembers: 0 };
      d.eventLog.travel_trip_booking = { count: 2, lastYear: d.currentYear };
    });
    const report = emptyTravelReport(); const watcher = new TravelWatcher(report);
    watcher.finish(life); watcher.finish(life);
    expect(report.lives).toBe(2); expect(report.totals.trips).toBe(4); expect(report.totals.returns).toBe(4);
    expect(report.totals.destinations).toEqual({ montreal: 4, london: 4 });
    expect(report.totals.stress).toBe(-16); expect(report.events.travel_trip_booking).toBe(4);
    expect(formatTravel(report, content).join('\n')).toContain('2.000 per life');
  });
  it('never suggests travel to a minor and leaves the engine RNG and input state alone', () => {
    const life = lifeAtAge('travel-policy', 17); const before = JSON.stringify(life);
    expect(chooseTravelAction(life, content)).toBeNull(); expect(JSON.stringify(life)).toBe(before);
    const grown = produce(lifeAtAge('travel-policy-adult', 25), (d) => { d.finances.savings = 20000; });
    expect(chooseTravelAction(grown, content)).toEqual(chooseTravelAction(grown, content));
  });
});
