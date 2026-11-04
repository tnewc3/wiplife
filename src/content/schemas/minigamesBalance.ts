/**
 * G1 mini-games (docs/careers-crime-and-ui.md, G1): the numbers every mini-game and the shared odds model use
 * (src/content/balance/minigames.yaml). No number lives in code.
 */
import { z } from 'zod';
import { MINIGAME_IDS } from './common';
import { checkStatSchema } from './events';

const share = z.number().min(0).max(1);
const range = z.strictObject({ weak: z.number().min(0), strong: z.number().min(0) });

const gameSchema = z.strictObject({
  /** Skill is the weighted sum of these (each 0 to 100); the weights add to 1. */
  skill: z.array(checkStatSchema).min(1),
  /** The size of the zone (a share of the bar, the turn or the course) at weak and at strong skill. */
  window: range,
  /** How fast it moves at weak and at strong skill. */
  speed: range,
  /** Numbers only that game uses. */
  params: z.record(z.string(), z.number()),
});

export const minigamesBalanceSchema = z
  .strictObject({
    /** The accuracy (0 to 100) each performance needs, best first. */
    tiers: z.strictObject({ perfect: z.int().min(1).max(100), good: z.int().min(1).max(100), fair: z.int().min(1).max(100) }),
    /** What a performance does to a chance (percentage points). */
    shift: z.strictObject({ perfect: z.number().min(0).max(30), good: z.number().min(0).max(30), fair: z.number().min(-30).max(30), miss: z.number().min(-30).max(0) }),
    /** Auto draws an accuracy centered between these by your skill, with this spread. */
    auto: z.strictObject({ meanWeak: z.number().min(0).max(100), meanStrong: z.number().min(0).max(100), spread: z.number().min(0).max(100) }),
    /** Reduced motion slows every game by this factor. */
    slowFactor: share.min(0.1),
    /** A game offers Auto after this long without a tap (ms). */
    idleMs: z.int().min(1000),
    games: z.strictObject(Object.fromEntries(MINIGAME_IDS.map((id) => [id, gameSchema])) as Record<(typeof MINIGAME_IDS)[number], typeof gameSchema>),
  })
  .refine((b) => b.tiers.perfect > b.tiers.good && b.tiers.good > b.tiers.fair, 'tiers must fall from perfect to fair')
  .refine((b) => b.shift.perfect >= b.shift.good && b.shift.good >= b.shift.fair && b.shift.fair >= b.shift.miss, 'shifts must fall from perfect to miss')
  .refine((b) => b.auto.meanStrong > b.auto.meanWeak, 'auto must play better at strong skill')
  .refine((b) => Object.values(b.games).every((g) => Math.abs(g.skill.reduce((s, x) => s + x.weight, 0) - 1) < 1e-6), 'each game weights its skill to add up to 1');
export type MiniGamesBalance = z.infer<typeof minigamesBalanceSchema>;
