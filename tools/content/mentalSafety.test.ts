/**
 * The mental health safety check (M1): no suicide or self-harm choice, no
 * method, no dose; a mention in a story needs a reviewed reason.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import type { ContentBundle, EventDef } from '../../src/content/schemas';
import { mentalSafetyErrors, METHOD, scanEvent, SELF_HARM } from './mentalSafety';

const clone = (): ContentBundle => JSON.parse(JSON.stringify(content)) as ContentBundle;
const fileOf = (_type: 'events' | 'conditions', id: string) => `events/${id}.yaml`;

/** A valid event with these texts. */
function event(patch: Partial<EventDef>): EventDef {
  return {
    id: 'test_event',
    title: 'A hard night',
    text: 'It was a long night.',
    tone: 'serious',
    category: 'mental',
    rarity: 'common',
    lifeStages: ['adult'],
    weight: { base: 1 },
    choices: [
      { id: 'a', label: 'Call a friend', outcome: { text: 'You call.', effects: [] } },
      { id: 'b', label: 'Go to bed', outcome: { text: 'You sleep.', effects: [] } },
    ],
    ...patch,
  } as EventDef;
}

describe('what it recognizes', () => {
  it('flags naming suicide or self-harm, in the common ways of saying it', () => {
    for (const text of ['You think about suicide.', 'thoughts of self-harm', 'You want to kill yourself.', 'to end your own life', 'You hurt yourself on purpose.', 'You do not want to be alive.', 'self harm']) {
      expect(SELF_HARM.test(text), text).toBe(true);
    }
  });

  it('flags methods and doses', () => {
    for (const text of ['a bottle of pills', 'jump off a bridge', 'a lethal amount', 'twenty mg every morning', 'the dosage is', 'take five pills', '50mg']) {
      expect(METHOD.test(text), text).toBe(true);
    }
  });

  it('leaves ordinary sentences alone', () => {
    for (const text of ['You hurt yourself falling off the bike.', 'The doctor prescribes an antidepressant.', 'You take your medication every morning.', 'You cut yourself shaving.', 'A crisis line answers.', 'It is not a life you wanted to end up in.']) {
      expect(SELF_HARM.test(text) || METHOD.test(text), text).toBe(false);
    }
  });
});

describe('events', () => {
  it('flags a choice that names self-harm, however it is worded', () => {
    const found = scanEvent(event({ choices: [{ id: 'a', label: 'Hurt yourself on purpose', outcome: { text: 'No.', effects: [] } }, { id: 'b', label: 'Call someone', outcome: { text: 'Ok.', effects: [] } }] }));
    expect(found.map((f) => f.kind)).toContain('choice');
    const inOutcome = scanEvent(event({ choices: [{ id: 'a', label: 'Stay in', outcome: { text: 'You think about suicide.', effects: [] } }, { id: 'b', label: 'Call someone', outcome: { text: 'Ok.', effects: [] } }] }));
    expect(inOutcome.map((f) => f.kind)).toContain('choice');
    const inCheck = scanEvent(
      event({
        choices: [
          { id: 'a', label: 'Try', check: { base: 50, stats: [{ key: 'stress', weight: 1 }], success: { text: 'Fine.', effects: [] }, failure: { text: 'You want to kill yourself.', effects: [] } } },
          { id: 'b', label: 'Call someone', outcome: { text: 'Ok.', effects: [] } },
        ],
      }),
    );
    expect(inCheck.map((f) => f.kind)).toContain('choice');
  });

  it('flags a method or a dose anywhere in an event', () => {
    expect(scanEvent(event({ text: 'You count out a bottle of pills.' })).map((f) => f.kind)).toContain('method');
    expect(scanEvent(event({ choices: [{ id: 'a', label: 'Take it', outcome: { text: 'You take 20 mg.', effects: [] } }, { id: 'b', label: 'Skip', outcome: { text: 'Ok.', effects: [] } }] })).map((f) => f.kind)).toContain('method');
  });

  it('flags a mention in the story, which only a reviewed reason allows', () => {
    const story = event({ text: 'The funeral is for someone who died by suicide.' });
    expect(scanEvent(story).map((f) => f.kind)).toEqual(['mention']);
    const bundle = clone();
    bundle.events.test_event = story;
    expect(mentalSafetyErrors(bundle, fileOf).map((e) => e.message)).toEqual([expect.stringContaining('names suicide or self-harm')]);
    bundle.events.test_event = { ...story, justified: { safety: 'A loss told with care, pointing toward help.' } };
    expect(mentalSafetyErrors(bundle, fileOf)).toEqual([]);
    // A reason for nothing is an error too.
    bundle.events.test_event = event({ justified: { safety: 'Nothing is flagged here at all.' } });
    expect(mentalSafetyErrors(bundle, fileOf).map((e) => e.message)).toEqual([expect.stringContaining('nothing is flagged')]);
  });

  it('never lets a justification excuse a choice or a method', () => {
    const bundle = clone();
    bundle.events.test_event = event({ text: 'You count out a bottle of pills.', justified: { safety: 'Reviewed and fine, apparently.' } });
    expect(mentalSafetyErrors(bundle, fileOf).some((e) => e.message.includes('describes a method'))).toBe(true);
  });

  it('flags other content: a method or a dose, or a mention nothing can justify', () => {
    const bundle = clone();
    bundle.conditions.depression = { ...bundle.conditions.depression!, blurb: 'Take 40 mg and see.' };
    expect(mentalSafetyErrors(bundle, fileOf).some((e) => e.message.includes('conditions.depression.blurb'))).toBe(true);
  });
});

describe('the shipped content', () => {
  it('passes', () => {
    expect(mentalSafetyErrors(content, fileOf)).toEqual([]);
  });

  it('has about 45 mental health events, none of which offers harm', () => {
    const mine = Object.values(content.events).filter((e) => e.category === 'mental' || e.id.startsWith('mental_') || e.id === 'teacher_suggests_testing' || ['deadline_rush', 'bad_day_at_work', 'workplace_disclosure'].includes(e.id));
    expect(mine.length).toBeGreaterThanOrEqual(45);
    expect(mine.length).toBeLessThanOrEqual(55);
  });
});
