/**
 * Seeded random number generator (sfc32, "Small Fast Counting" by Chris Doty-Humphrey).
 *
 * The whole generator state is four unsigned 32-bit integers stored as a plain
 * object, so it can live inside the life state, be saved as JSON and resume the
 * exact same sequence after loading.
 *
 * Every draw function advances the state it is given in place. Inside the engine
 * that state is an Immer draft (or a copy you own); never share one RngState
 * between two lives.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  /** sfc32's counter word; guarantees a minimum period of 2^32. */
  d: number;
}

/** Outputs discarded after seeding so that similar seeds diverge fully. */
const WARM_UP_ROUNDS = 15;

/**
 * Hashes a seed string into four 32-bit words (cyrb128). Deterministic across
 * platforms because it only uses 32-bit integer math.
 */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Creates a fresh generator state from a seed string. */
export function createRng(seed: string): RngState {
  const [a, b, c, d] = hashSeed(seed);
  const state: RngState = { a, b, c, d };
  for (let i = 0; i < WARM_UP_ROUNDS; i++) nextUint32(state);
  return state;
}

/** Returns a copy of the state that can be advanced independently. */
export function cloneRng(state: RngState): RngState {
  return { a: state.a, b: state.b, c: state.c, d: state.d };
}

/** True if the value is a structurally valid generator state (e.g. from a save). */
export function isRngState(value: unknown): value is RngState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (['a', 'b', 'c', 'd'] as const).every((k) => {
    const n = v[k];
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  });
}

/** Advances the state and returns an unsigned 32-bit integer. */
export function nextUint32(state: RngState): number {
  let { a, b, c, d } = state;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  state.a = a >>> 0;
  state.b = b >>> 0;
  state.c = c >>> 0;
  state.d = d >>> 0;
  return t >>> 0;
}

/** Advances the state and returns a float in [0, 1). */
export function nextFloat(state: RngState): number {
  return nextUint32(state) / 4294967296;
}

/**
 * Advances the state and returns an integer in [min, max], inclusive.
 * Uses rejection sampling so every value is equally likely.
 */
export function nextInt(state: RngState, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`nextInt: invalid range [${min}, ${max}]`);
  }
  const range = max - min + 1;
  if (range > 4294967296) throw new RangeError('nextInt: range larger than 2^32');
  const limit = 4294967296 - (4294967296 % range);
  let x = nextUint32(state);
  while (x >= limit) x = nextUint32(state);
  return min + (x % range);
}

/** Advances the state and returns true with probability p (clamped to [0, 1]). */
export function chance(state: RngState, p: number): boolean {
  return nextFloat(state) < p;
}

/** Advances the state and returns a random element. Throws on an empty array. */
export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty array');
  return items[nextInt(state, 0, items.length - 1)] as T;
}
