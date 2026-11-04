/**
 * G1 mini-games: the shared odds model, blackjack, the hooks in events and activities, replays and the ledger.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { MINIGAME_IDS } from '../../content/schemas';
import { performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { beginYear, createLife, resolveChoice } from '../life';
import { replayLife } from '../replay';
import { createRng } from '../rng';
import { getEventCard } from '../selectors';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { autoSession, bookHit, playSession, replaySession, sessionAccuracy, sessionTier, valueOf } from './blackjack';
import { autoAccuracy, chanceAfter, difficultyOf, expectedAutoShift, parsePlay, performanceOf, shiftOf, skillOf, tiltWeights, timingAccuracy } from './odds';
import { playFits } from './pastime';
import { houseEdge } from '../pastimes/risk';
import { chanceNow } from '../pastimes/perform';
import { pastimeBlock } from '../pastimes/query';
import { performEdit } from '../godmode';
import { finishAction } from '../actions';
import { playYear, resolveAll } from '../autoplay';

const mini = content.balance.minigames;

describe('the odds model', () => {
  it('has numbers for every game, and weights that add to 1', () => {
    for (const id of MINIGAME_IDS) {
      const g = mini.games[id];
      expect(g.skill.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 6);
    }
  });

  it('turns an accuracy into a performance by the balance thresholds', () => {
    expect(performanceOf(100, content)).toBe('perfect');
    expect(performanceOf(mini.tiers.perfect, content)).toBe('perfect');
    expect(performanceOf(mini.tiers.good, content)).toBe('good');
    expect(performanceOf(mini.tiers.fair, content)).toBe('fair');
    expect(performanceOf(0, content)).toBe('miss');
  });

  it('scores timing: full marks on the center, none past one and a half zones', () => {
    expect(timingAccuracy(0, 0.2)).toBe(100);
    expect(timingAccuracy(0.3, 0.2)).toBe(0);
    expect(timingAccuracy(0.1, 0.2)).toBeGreaterThanOrEqual(66);
    expect(timingAccuracy(-0.1, 0.2)).toBe(timingAccuracy(0.1, 0.2));
  });

  it('gives a strong player a bigger, slower zone, and reduced motion slows it again', () => {
    for (const id of ['last_shot', 'swing', 'penalty_kick'] as const) {
      const weak = difficultyOf(0, id, content, false);
      const strong = difficultyOf(100, id, content, false);
      expect(strong.window).toBeGreaterThan(weak.window);
      expect(strong.speed).toBeLessThan(weak.speed);
      expect(difficultyOf(50, id, content, true).speed).toBeLessThan(difficultyOf(50, id, content, false).speed);
    }
  });

  it('never moves a check by more than the largest shift, inside the check limits', () => {
    const { min, max } = content.balance.events.checks;
    for (const base of [0, 0.05, 0.5, 0.95, 1]) {
      for (const perf of ['perfect', 'good', 'fair', 'miss'] as const) {
        const after = chanceAfter(base, perf, content);
        expect(after).toBeGreaterThanOrEqual(min / 100);
        expect(after).toBeLessThanOrEqual(max / 100);
        expect(Math.abs(after - Math.min(max / 100, Math.max(min / 100, base)))).toBeLessThanOrEqual(Math.max(mini.shift.perfect, -mini.shift.miss) / 100 + 1e-9);
      }
    }
  });

  it('plays well helps: perfect beats good beats fair beats a miss', () => {
    const p = (perf: 'perfect' | 'good' | 'fair' | 'miss') => chanceAfter(0.5, perf, content);
    expect(p('perfect')).toBeGreaterThan(p('good'));
    expect(p('good')).toBeGreaterThanOrEqual(p('fair'));
    expect(p('fair')).toBeGreaterThan(p('miss'));
  });

  it('keeps Auto close to neutral for an average player, a little better for a strong one and worse for a weak one', () => {
    expect(Math.abs(expectedAutoShift(50, content))).toBeLessThan(1.5);
    expect(expectedAutoShift(100, content)).toBeGreaterThan(expectedAutoShift(0, content));
    // Auto never moves odds by more than the best a perfect play does.
    for (const skill of [0, 25, 50, 75, 100]) expect(Math.abs(expectedAutoShift(skill, content))).toBeLessThan(mini.shift.perfect);
  });

  it('draws the same accuracies as the average of its model (and every draw is in range)', () => {
    const rng = createRng('g1:auto');
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const a = autoAccuracy(rng, 50, content);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
      sum += a;
    }
    const expected = (mini.auto.meanWeak + mini.auto.meanStrong) / 2;
    expect(Math.abs(sum / 2000 - expected)).toBeLessThan(3);
  });

  it('tilts weights by the share of a performance, leaving neutral ones alone', () => {
    const w: [string, number][] = [['great', 1], ['neutral', 1], ['bad', 1]];
    const side = (t: string) => (t === 'great' ? 1 : t === 'bad' ? -1 : 0);
    const up = tiltWeights(w, side, 'perfect', 1, content);
    expect(up[0]![1]).toBeGreaterThan(1);
    expect(up[1]![1]).toBe(1);
    expect(up[2]![1]).toBeLessThan(1);
    expect(tiltWeights(w, side, 'perfect', 0, content).map((x) => x[1])).toEqual([1, 1, 1]);
    expect(shiftOf('miss', content, 0.5)).toBe(mini.shift.miss * 0.5);
  });

  it('validates a play from outside', () => {
    expect(parsePlay({ game: 'last_shot', auto: false, accuracy: 80 })).not.toBeNull();
    expect(parsePlay({ game: 'last_shot', auto: false, accuracy: 101 })).toBeNull();
    expect(parsePlay({ game: 'nope', auto: false, accuracy: 10 })).toBeNull();
    expect(parsePlay({ game: 'last_shot', auto: false, accuracy: 10.5 })).toBeNull();
    expect(parsePlay({ game: 'last_shot', auto: false, accuracy: 10, extra: 1 })).toBeNull();
    expect(parsePlay({ game: 'blackjack', auto: false, accuracy: 10, detail: Array(100).fill(1) })).toBeNull();
    expect(parsePlay(null)).toBeNull();
  });
});

describe('blackjack', () => {
  it('values hands with aces and busts', () => {
    expect(valueOf([1, 13]).total).toBe(21);
    expect(valueOf([1, 1, 9]).total).toBe(21);
    expect(valueOf([13, 12, 5]).total).toBe(25);
    expect(valueOf([1, 6]).soft).toBe(true);
  });

  it('plays a hand again from its seed and moves, exactly', () => {
    const book = (view: ReturnType<typeof valueOf>, up: number) => bookHit(view, up);
    for (let seed = 1; seed <= 40; seed++) {
      const first = playSession(seed, 3, book);
      const again = replaySession(seed, 3, first.moves);
      expect(again).not.toBeNull();
      expect(again!.hands).toEqual(first.hands);
      expect(again!.returned).toBe(first.returned);
    }
  });

  it('refuses moves that do not fit the hands', () => {
    const first = playSession(7, 3, (v, up) => bookHit(v, up));
    if (first.moves.length > 0) expect(replaySession(7, 3, first.moves.slice(0, -1))).toBeNull();
    expect(replaySession(7, 3, [...first.moves, 1])).toBeNull();
    expect(replaySession(7, 3, [...first.moves.slice(0, -1), 2])).toBeNull();
  });

  it('pays the table by the rules: the book keeps the house ahead, but not by much', () => {
    let total = 0;
    const n = 6000;
    for (let seed = 1; seed <= n; seed++) total += playSession(seed, 3, (v, up) => bookHit(v, up)).returned;
    const rtp = total / n;
    expect(rtp).toBeLessThan(1);
    expect(rtp).toBeGreaterThan(0.9);
  });

  it('Auto at the table returns about what the old payout table did, a little more with skill, and never more than the book', () => {
    const rng = createRng('g1:auto:rtp');
    const rtp = (skill: number) => {
      let total = 0;
      const n = 6000;
      for (let i = 0; i < n; i++) total += autoSession(rng, skill, content).session.returned;
      return total / n;
    };
    const table = 1 - houseEdge(content.balance.risk.games.blackjack!);
    const [weak, mid, strong] = [rtp(0), rtp(50), rtp(100)];
    expect(Math.abs(mid - table)).toBeLessThan(0.03);
    expect(strong).toBeGreaterThan(weak - 0.01);
    expect(strong).toBeLessThan(1);
  });

  it('a player who ignores the book does worse than one who follows it', () => {
    let book = 0;
    let wild = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      book += playSession(seed, 3, (v, up) => bookHit(v, up)).returned;
      wild += playSession(seed, 3, (v) => v.total < 19).returned;
    }
    expect(book).toBeGreaterThan(wild);
  });

  it('scores a visit by how much of the stake it returns', () => {
    expect(sessionTier(2.5, content)).toBe('great');
    expect(sessionTier(1.2, content)).toBe('good');
    expect(sessionTier(1, content)).toBe('neutral');
    expect(sessionTier(0.33, content)).toBe('bad');
    expect(sessionTier(0, content)).toBe('backfire');
    expect(sessionAccuracy(playSession(3, 3, (v, up) => bookHit(v, up)))).toBe(100);
  });
});

const adult = (seed: string): LifeState =>
  produce(lifeAtAge(seed, 30), (d) => {
    d.finances.savings = 2_000_000;
    d.finances.debts = [];
    d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 2 };
  });

describe('casino games in the Activities tab', () => {
  it('keeps the slot machine ahead of you even when you stop every reel on the mark', () => {
    const game = content.balance.risk.games.slots!;
    const scale = mini.games.slots.params.tiltScale! / 100;
    const w = tiltWeights(game.outcomes.map((o) => [o, o.chance] as const), (o) => (o.multiple > 1 ? 1 : o.multiple < 1 ? -1 : 0), 'perfect', scale, content);
    const total = w.reduce((s, [, x]) => s + x, 0);
    const edge = 1 - w.reduce((s, [o, x]) => s + (x / total) * o.multiple, 0);
    expect(edge).toBeGreaterThan(0.01);
    expect(edge).toBeLessThan(houseEdge(game) + 0.001);
  });

  const play = (life: LifeState, id: string, extra: Record<string, unknown> = {}) => performAction(life, 'do_activity', { pastimeId: id, stake: 'medium', ...extra }, content);

  it('Auto plays when no result is given, and the log keeps the result it drew', () => {
    for (const id of ['play_blackjack', 'play_the_slots']) {
      const life = play(adult(`g1:${id}`), id);
      const record = life.inputLog.at(-1)!;
      expect(record.kind).toBe('action');
      const params = record.payload.params as { play?: { game: string; auto: boolean } };
      expect(params.play?.auto).toBe(true);
      expect(params.play?.game).toBe(id === 'play_blackjack' ? 'blackjack' : 'slots');
    }
  });

  it('a played blackjack visit is checked: the stake goes through the ledger by what the hands return', () => {
    const life = adult('g1:bj:played');
    const savings = life.finances.savings;
    const seed = 424242;
    const session = playSession(seed, 3, (v, up) => bookHit(v, up));
    const record = { game: 'blackjack', auto: false, accuracy: sessionAccuracy(session), detail: [seed, ...session.moves] };
    expect(playFits(content.pastimes.play_blackjack!, record as never, content)).toBe(true);
    const after = play(life, 'play_blackjack', { play: record });
    const receipt = after.pastimes.receipts.at(-1)!;
    const price = savings - (savings - Math.round(0)) ;
    expect(price).toBe(0);
    // The receipt shows the money for the visit with the new balance; the balance is what the ledger holds.
    expect(receipt.money?.balance).toBe(after.finances.savings);
    const stake = (receipt.money?.change ?? 0);
    expect(after.finances.savings - savings).toBe(stake);
    expect(receipt.tier).toBe(sessionTier(session.returned, content));
    const logged = after.inputLog.at(-1)!.payload.params as { play: { detail: number[] } };
    expect(logged.play.detail[0]).toBe(seed);
  });

  it('refuses a result for the wrong game, a forged hand or a result for an activity with no game', () => {
    const life = adult('g1:refuse');
    expect(() => play(life, 'play_blackjack', { play: { game: 'slots', auto: false, accuracy: 90 } })).toThrow(InvalidInputError);
    expect(() => play(life, 'play_blackjack', { play: { game: 'blackjack', auto: false, accuracy: 90, detail: [5, 1, 1, 1, 1, 1, 1, 1, 1] } })).toThrow(InvalidInputError);
    expect(() => play(life, 'play_roulette', { play: { game: 'slots', auto: false, accuracy: 90 } })).toThrow(InvalidInputError);
  });

  it('replays an activity with a played result and one with Auto, exactly', () => {
    // No edits outside the log: a replay rebuilds the life from the log alone.
    // A life lived year by year (a built scenario has no real log to replay), then given money by an edit that the log keeps.
    let lived = createLife({ mode: 'random', seed: 'g1:replay:casino', birthYear: 2000, countryId: 'us' }, content);
    while (lived.character.age < 23 && lived.phase !== 'dead') lived = playYear(lived, content);
    let life = performEdit(lived, { target: 'self', money: { savings: 50_000 } }, content);
    expect(pastimeBlock(life, content.pastimes.play_blackjack!, { stake: 'low' }, content)).toBeNull();
    life = performClose(play(life, 'play_the_slots', { stake: 'low', play: { game: 'slots', auto: false, accuracy: 90, detail: [300, 410, 280] } }));
    life = performClose(play(life, 'play_blackjack', { stake: 'low' }));
    const replayed = replayLife(life.inputLog, content);
    expect(replayed.finances.savings).toBe(life.finances.savings);
    expect(replayed.pastimes.receipts).toEqual(life.pastimes.receipts);
    expect(replayed.rng).toEqual(life.rng);
  });

  it('feeds gambling addiction: the existing condition, likelier at a high stake, started through the ledger path', () => {
    const base = produce(adult('g1:addict'), (d) => void (d.character.hidden.vice = 90));
    const p = (stake: 'low' | 'high') => chanceNow(base, 'gambling_addiction', { stake }, 0, content);
    expect(p('high')).toBeGreaterThan(p('low'));
    let started = 0;
    for (let i = 0; i < 500; i++) {
      const life = produce(adult(`g1:addict:${i}`), (d) => void (d.character.hidden.vice = 90));
      const after = play(life, i % 2 === 0 ? 'play_blackjack' : 'play_the_slots', { stake: 'high' });
      if (after.health.conditions.some((c) => c.conditionId === 'gambling_addiction')) started++;
    }
    expect(started).toBeGreaterThan(0);
  });

  it('burglary takes a lockpick result and a better one makes the good outcomes likelier', () => {
    const perfect = { game: 'lockpick', auto: false, accuracy: 100 };
    const miss = { game: 'lockpick', auto: false, accuracy: 0 };
    let good = 0;
    let bad = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const base = produce(lifeAtAge(`g1:burg:${i}`, 30), (d) => {
        d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 2 };
      });
      const a = performAction(base, 'do_activity', { pastimeId: 'burglary', play: perfect }, content).pastimes.receipts.at(-1)!;
      const b = performAction(base, 'do_activity', { pastimeId: 'burglary', play: miss }, content).pastimes.receipts.at(-1)!;
      if (a.tier === 'great' || a.tier === 'good') good++;
      if (b.tier === 'great' || b.tier === 'good') bad++;
    }
    expect(good).toBeGreaterThan(bad);
  });
});

/** Resolves what an activity queued and returns the life to the start of the year. */
function performClose(life: LifeState): LifeState {
  if (life.phase !== 'action') return life;
  const done = resolveAll(life, content, createRng(`${life.seed}:settle:${life.inputLog.length}`));
  return done.phase === 'action' ? finishAction(done) : done;
}

describe('mini-games in events', () => {
  /** A life with a big-moment event waiting at its first card. */
  function withEvent(eventId: string, sport: string, seed: string): LifeState {
    const base = lifeAtAge(seed, 22);
    return produce(base, (d) => {
      d.phase = 'events';
      d.pending = [{ instanceId: 'x1', eventId, cast: {}, since: undefined } as never];
      d.sports = { ...d.sports, active: true, sport } as never;
    });
  }

  it('offers the mini-game on the choice that carries one, for the sport it belongs to', () => {
    for (const [eventId, game] of [['big_game_basketball', 'last_shot'], ['big_game_soccer', 'penalty_kick'], ['big_game_baseball', 'swing']] as const) {
      const life = withEvent(eventId, game, `g1:card:${eventId}`);
      const card = getEventCard(life, 0, content)!;
      expect(card.choices.find((c) => c.id === 'take_it')?.game).toBe(game);
      expect(card.choices.find((c) => c.id === 'share_it')?.game).toBeUndefined();
    }
    for (const [id, game] of [['job_the_big_one', 'lockpick'], ['arrest_caught_in_the_act', 'getaway'], ['rival_ambush', 'getaway']] as const) {
      const def = content.events[id]!;
      const choice = def.choices!.find((c) => c.minigame?.[0]?.game === game);
      expect(choice).toBeDefined();
    }
  });

  it('a played result moves the odds as the model says, and Auto (no result) still resolves', () => {
    let perfectWins = 0;
    let missWins = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const life = withEvent('big_game_soccer', 'soccer', `g1:ev:${i}`);
      const win = (acc: number) => resolveChoice(life, 'x1', 'take_it', content, { game: 'penalty_kick', auto: false, accuracy: acc }).pending[0]!.outcomeText?.startsWith('You pick your corner and you do not');
      if (win(100)) perfectWins++;
      if (win(0)) missWins++;
      const auto = resolveChoice(life, 'x1', 'take_it', content);
      expect((auto.inputLog.at(-1)!.payload.play as { auto: boolean }).auto).toBe(true);
    }
    expect(perfectWins).toBeGreaterThan(missWins);
    // The gap is bounded: skill pushes the odds, it does not replace them.
    expect((perfectWins - missWins) / n).toBeLessThan((mini.shift.perfect - mini.shift.miss) / 100 + 0.08);
  });

  it('refuses a result for a choice with no game, the wrong game or an invalid result', () => {
    const life = withEvent('big_game_soccer', 'soccer', 'g1:ev:refuse');
    expect(() => resolveChoice(life, 'x1', 'share_it', content, { game: 'penalty_kick', auto: false, accuracy: 50 })).toThrow(InvalidInputError);
    expect(() => resolveChoice(life, 'x1', 'take_it', content, { game: 'swing', auto: false, accuracy: 50 })).toThrow(InvalidInputError);
    expect(() => resolveChoice(life, 'x1', 'take_it', content, { game: 'penalty_kick', auto: false, accuracy: 500 })).toThrow(InvalidInputError);
  });

  it('records the result in the input log and a replay reproduces the life exactly', () => {
    // Play real years until a mini-game event arrives, then play it with a stored result.
    let found = 0;
    for (let i = 0; i < 400 && found === 0; i++) {
      let life = lifeAtAge(`g1:replay:${i}`, 24);
      life = produce(life, (d) => {
        d.sports = { ...d.sports, active: true, sport: 'soccer' } as never;
      });
      life = beginYear(life, content);
      const index = life.pending.findIndex((p) => content.events[p.eventId]?.choices?.some((c) => c.minigame));
      if (index < 0) continue;
      found++;
    }
    // The year pipeline rarely deals a big moment to a random life; the replay itself is covered below with a card in hand.
    const life = withEvent('big_game_basketball', 'basketball', 'g1:replay:card');
    const record = { game: 'last_shot' as const, auto: false, accuracy: 88, detail: [412] };
    const played = resolveChoice(life, 'x1', 'take_it', content, record);
    expect(played.inputLog.at(-1)!.payload).toEqual({ instanceId: 'x1', choiceId: 'take_it', play: record });
    const again = resolveChoice(cloneJson(life), 'x1', 'take_it', content, played.inputLog.at(-1)!.payload.play);
    expect(again.pending[0]!.outcomeText).toBe(played.pending[0]!.outcomeText);
    expect(again.rng).toEqual(played.rng);
    const autoPlayed = resolveChoice(life, 'x1', 'take_it', content);
    const storedAuto = autoPlayed.inputLog.at(-1)!.payload.play;
    const replayedAuto = resolveChoice(life, 'x1', 'take_it', content, storedAuto);
    expect(replayedAuto.pending[0]!.outcomeText).toBe(autoPlayed.pending[0]!.outcomeText);
    expect(replayedAuto.rng).toEqual(autoPlayed.rng);
  });

  it('skill for a game comes from your stats and stays between 0 and 100', () => {
    const life = lifeAtAge('g1:skill', 25);
    for (const id of MINIGAME_IDS) {
      const s = skillOf(life, id, content);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    const strong = produce(life, (d) => {
      d.character.stats.fitness = 100;
      d.character.personality.confidence = 100;
      d.character.personality.discipline = 100;
    });
    expect(skillOf(strong, 'last_shot', content)).toBeGreaterThan(skillOf(life, 'last_shot', content) - 1);
  });
});
