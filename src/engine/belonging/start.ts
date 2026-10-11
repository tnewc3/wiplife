/**
 * Where belonging starts (W2): a new life gets its family's faith and its own
 * (from the family, or the one chosen in custom creation), its values from
 * temperament and faith, and a hidden pull toward another faith now and then.
 * An heir starts from the parent's faith: the household they were raised in.
 */
import type { ContentBundle } from '../../content/schemas';
import type { RngState } from '../rng';
import type { BelongingState, Id, LifeState } from '../types';
import { chosenFaith, rollHousehold, rollLatentFaith, rollOwnFaith } from './faith';
import { emptyBelonging } from './query';
import { startValues } from './values';

export interface ParentBelonging {
  /** The parent's faith and how strongly they believed. */
  faith: Id | null;
  strength: number;
  temperament: BelongingState['temperament'];
  /** The faith set down for the heir while they were a child, if there is one. */
  child?: { id: Id | null; strength: number } | undefined;
}

/**
 * Fills a new life's belonging: random, a faith chosen in custom creation
 * ('none', a faith, or 'family'/nothing for a roll), or an heir's from their parent.
 */
export function startBelonging(life: LifeState, rng: RngState, content: ContentBundle, how: { choice?: string | undefined; parent?: ParentBelonging }): void {
  const b = emptyBelonging();
  if (how.parent) {
    const p = how.parent;
    b.household = { faith: p.faith, devotion: p.strength };
    b.faith = p.child
      ? { id: p.child.id, strength: p.child.strength, raised: p.faith, since: null, changes: 0 }
      : rollOwnFaith(rng, content, b.household);
  } else if (how.choice !== undefined && how.choice !== 'family') {
    const chosen = chosenFaith(rng, content, how.choice);
    b.household = chosen.household;
    b.faith = chosen.faith;
  } else {
    b.household = rollHousehold(rng, content);
    b.faith = rollOwnFaith(rng, content, b.household);
  }
  const v = startValues(life.character.personality, b.faith, content);
  b.values = v.values;
  b.temperament = v.temperament;
  if (how.parent) {
    // Raised by a parent whose temperament you grew up beside: a share of it is yours.
    for (const key of Object.keys(b.temperament) as (keyof typeof b.temperament)[]) {
      b.temperament[key] = Math.round(b.temperament[key] * 0.7 + how.parent.temperament[key] * 0.3);
      b.values[key] = Math.round(b.values[key] * 0.7 + how.parent.temperament[key] * 0.3);
    }
  }
  b.community = content.balance.belonging.community.start;
  life.belonging = b;
  const latent = rollLatentFaith(rng, content, b.faith.id);
  if (latent) life.character.latent.faith = latent;
}
