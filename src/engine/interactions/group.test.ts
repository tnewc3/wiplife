import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { resolveAll } from '../autoplay';
import { checkInvariants } from '../invariants';
import { beginYear, endYear } from '../life';
import { createRng } from '../rng';
import { replayLife } from '../replay';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { GROUP_INTERACTION, getGroupTimeView, spendTimeWithEveryone } from './group';
import { closeInteraction, resolveInteractionChoice } from './perform';

/** U1: "Spend time with everyone". */

/** A life where everyone you know lives in your city, so everyone can be seen. */
function together(seed = 'group-time', age = 30): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    for (const person of Object.values(d.people)) person.cityId = d.character.cityId;
  });
}

describe('spend time with everyone', () => {
  it('spends time with each person who can have it, one interaction each, and leaves no card open', () => {
    const life = together();
    const view = getGroupTimeView(life, content);
    expect(view.available).toBe(true);
    expect(view.people.length).toBeGreaterThan(1);

    const done = spendTimeWithEveryone(life, content);
    expect(done.rows.map((r) => r.personId).sort()).toEqual([...view.people].sort());
    expect(done.waiting).toBe(false);
    expect(done.state.pendingInteraction).toBeNull();
    const logged = done.state.inputLog.filter((r) => r.kind === 'interact');
    expect(logged).toHaveLength(done.rows.length);
    expect(logged.every((r) => r.payload.interactionId === GROUP_INTERACTION)).toBe(true);
    expect(done.state.inputLog.filter((r) => r.kind === 'interactClose')).toHaveLength(done.rows.length);
    expect(checkInvariants(done.state, content)).toEqual([]);
  });

  it('counts for each person like any other time with them: the same year again returns less', () => {
    const life = together('group-time-repeats');
    const first = spendTimeWithEveryone(life, content);
    const second = spendTimeWithEveryone(first.state, content);
    const gain = (rows: { affection: number }[]) => rows.reduce((sum, r) => sum + Math.max(0, r.affection), 0);
    expect(gain(first.rows)).toBeGreaterThan(0);
    expect(gain(second.rows)).toBeLessThan(gain(first.rows));
    for (const row of first.rows) expect(first.state.relationships[row.personId]!.interactions!.counts[GROUP_INTERACTION]).toBe(1);
  });

  it('leaves out anyone who has had enough this year', () => {
    let state = together('group-time-enough');
    const everyone = getGroupTimeView(state, content).people.length;
    for (let i = 0; i < 12; i++) state = spendTimeWithEveryone(state, content).state;
    expect(getGroupTimeView(state, content).people.length).toBeLessThan(everyone);
  });

  it('is not available while a card is open or between years, and with nobody to see', () => {
    const life = together('group-time-blocked');
    expect(getGroupTimeView({ ...life, phase: 'events' }, content).available).toBe(false);
    const alone = produce(life, (d) => {
      for (const person of Object.values(d.people)) person.cityId = `${d.character.cityId}-far`;
      d.housing = { ...d.housing, kind: 'renting' };
    });
    expect(getGroupTimeView(alone, content).people).toEqual([]);
    expect(spendTimeWithEveryone(alone, content).rows).toEqual([]);
  });

  it('rebuilds a life that used it exactly from its input log', () => {
    let life = lifeAtAge('group-time-replay', 0);
    for (let year = 0; year < 30 && life.phase !== 'dead'; year++) {
      if (life.phase === 'yearStart') {
        const done = spendTimeWithEveryone(life, content);
        life = done.state;
        // A moment that opened a choice of its own waits for an answer, as it does in the app.
        const choice = life.pendingInteraction?.choice;
        if (choice && choice.chosen === undefined) life = closeInteraction(resolveInteractionChoice(life, choice.options[0]!.id, content), content);
      }
      life = beginYear(life, content);
      life = resolveAll(life, content, createRng(`group-choices-${year}`));
      if (life.phase === 'yearEnd') life = endYear(life, content);
    }
    expect(life.inputLog.filter((r) => r.kind === 'interact').length).toBeGreaterThan(5);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });
});
