/**
 * The heritage step of the year pipeline (E2b), for lives that began as an
 * heir: money held in trust is released when the heir reaches the release
 * age; a minor whose guardian has died (or can no longer take them) goes to
 * another guardian, or into foster care; foster care ends when they reach the
 * independence age, and a guardian's home becomes just home.
 */
import type { ContentBundle } from '../../content/schemas';
import { earn, wholeDollars } from '../finance';
import { moveTo, refreshHousingCost } from '../housing';
import { renderText } from '../text';
import { addHistory } from '../systems/history';
import { pick } from '../rng';
import type { LifeState } from '../types';
import { chooseGuardian, createFosterCarer } from './heir';

/** Releases an heir's trust into savings once they reach its release age. Returns the amount. */
export function releaseTrust(state: LifeState): number {
  const trust = state.finances.trust;
  if (!trust || state.character.age < trust.releaseAge) return 0;
  delete state.finances.trust;
  earn(state, trust.balance);
  return wholeDollars(trust.balance);
}

/** Step: trust, guardian and foster care. */
export function runHeritage(state: LifeState, content: ContentBundle): void {
  const age = state.character.age;
  const independence = content.balance.economy.independenceAge;
  const h = state.housing;

  if (h.kind === 'with_parents' && h.guardianId !== undefined) {
    if (age >= independence) {
      // Grown: foster care ends (a place of their own); a relative's or parent's home is just home.
      if (h.foster) {
        delete state.flags.in_foster_care;
        state.flags.grew_up_in_foster_care = true;
        addHistory(state, { text: renderText(pick(state.rng, content.text.heir.recap.foster.ended), {}), tags: ['milestone', 'foster'], importance: 2 }, content);
        moveTo(state, 'renting', state.character.cityId, content);
      } else {
        delete h.guardianId;
        refreshHousingCost(state, content);
      }
    } else if (state.people[h.guardianId]?.alive !== true) {
      // The guardian died: another one, or foster care.
      const next = chooseGuardian(state, content);
      if (next) {
        delete h.foster;
        h.guardianId = next.id;
        delete state.flags.in_foster_care;
        state.character.cityId = h.cityId = state.people[next.id]!.cityId;
      } else {
        const carer = createFosterCarer(state, state.rng, content);
        h.guardianId = carer;
        h.foster = true;
        state.flags.in_foster_care = true;
      }
    }
  }

  releaseTrust(state);
}
