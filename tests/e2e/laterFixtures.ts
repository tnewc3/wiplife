/**
 * A saved old age for the later-life tests (L1): a grown-up of 80 with two
 * grown children, a grandchild and, as asked, a need for care or a death
 * foreseen. Built with the engine on the test content pack and written into
 * the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { createGrandchild } from '../../src/engine/later/grandchildren';
import { createRng } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import { familyLife } from './heirFixtures';

const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

export interface LaterLife {
  seed: string;
  /** You need looking after, and nothing is arranged. */
  needsCare?: boolean;
  /** A death is foreseen; with `wishes`, the final wishes are set and the bedside visit has happened. */
  terminal?: boolean;
  wishes?: boolean;
}

export function laterLife(options: LaterLife): LifeState {
  const content = pack();
  const base = familyLife({ seed: options.seed, kids: [50, 52], age: 80 });
  return produce(base, (d) => {
    const kids = Object.values(d.relationships).filter((r) => r.kind === 'child').map((r) => r.personId);
    createGrandchild(d, createRng(`${options.seed}-grandchild`), kids[0]!, { first: 'Nova', birthYear: d.currentYear - 6 }, content);
    if (options.needsCare) d.later.care = { since: d.currentYear, option: null, declined: [] };
    if (options.terminal) {
      d.later.terminal = {
        since: d.currentYear - 1,
        causeId: Object.keys(content.causes).sort()[0]!,
        hospice: options.wishes ? 'home' : null,
        service: options.wishes ? 'private' : null,
        ...(options.wishes ? { speakerId: kids[0]! } : {}),
        letters: [],
        visitors: options.wishes ? [kids[1]!] : [],
        visits: options.wishes ? [{ id: kids[1]!, came: true }] : [],
        ...(options.wishes ? { wishesYear: d.currentYear } : {}),
      };
    }
  });
}
