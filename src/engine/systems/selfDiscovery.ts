/**
 * Self-discovery (year pipeline step 8, Stage 9). As each year begins:
 *
 * 1. Inner conflict weighs on you: it raises Stress and slowly lowers
 *    Happiness (balance curves by how much you hold back).
 * 2. It grows for each latent trait you know about and haven't accepted
 *    (more for each time you pushed it down), and fades when you hold
 *    nothing back.
 * 3. At most one discovery a year (none in prison): a crisis when inner
 *    conflict runs high, a trait you pushed down coming back, or a latent
 *    trait or hidden talent surfacing for the first time. Its event comes
 *    from registries/discovery.yaml and the pacing director shows it first.
 *
 * The rules live in ../discovery.ts; numbers in balance/discovery.yaml.
 */
import { DISCOVERY_KINDS, type ContentBundle, type DiscoveryKind } from '../../content/schemas';
import { curveAt } from '../curve';
import { hasLatent, knownKinds, markSurfaced, queueDiscoveryEvent } from '../discovery';
import { clampInt } from '../random';
import { chance, pick } from '../rng';
import type { LifeState } from '../types';
import { applyStatEffects } from './economy';

type Pick = { kind: DiscoveryKind; how: 'surfacing' | 'resurfacing' };

/** Step 8: grow inner conflict and check whether latent traits surface. */
export function runSelfDiscovery(state: LifeState, content: ContentBundle): void {
  const b = content.balance.discovery;
  const ic = b.innerConflict;
  const c = state.character;
  const year = state.currentYear;

  // 1. How holding back feels.
  const conflict = c.hidden.innerConflict;
  applyStatEffects(state, {
    stress: { perYear: curveAt(ic.stress, conflict), limit: ic.stressLimit },
    happiness: { perYear: -curveAt(ic.happiness, conflict), limit: ic.happinessLimit },
  });

  // 2. Growth or decay.
  const known = knownKinds(state);
  if (known.length > 0) {
    const growth = known.reduce((sum, k) => sum + ic.perYear + ic.perSuppression * Math.max(0, (state.discovery.surfaced[k]?.times ?? 1) - 1), 0);
    c.hidden.innerConflict = clampInt(conflict + Math.min(ic.maxPerYear, growth), 0, 100);
  } else if (conflict > 0) {
    c.hidden.innerConflict = clampInt(conflict - ic.decay, 0, 100);
  }

  // 3. At most one discovery a year, never in prison.
  if (state.housing.kind === 'incarcerated') return;
  const registry = content.registries.discovery;
  const now = c.hidden.innerConflict;
  const lastCrisis = state.discovery.crisisYear;
  if (
    known.length > 0 &&
    now >= b.crisis.minConflict &&
    (lastCrisis === undefined || year - lastCrisis >= b.crisis.cooldownYears) &&
    chance(state.rng, b.crisis.chance) &&
    queueDiscoveryEvent(state, registry.crisis.events, year, content)
  ) {
    state.discovery.crisisYear = year;
    for (const k of known) markSurfaced(state, k);
    return;
  }

  const ready: Pick[] = [];
  for (const kind of DISCOVERY_KINDS) {
    if (!hasLatent(state, kind) || c.age < b.surfacing[kind].minAge) continue;
    const surfaced = state.discovery.surfaced[kind];
    if (!surfaced) {
      if (chance(state.rng, curveAt(b.surfacing[kind].chance, c.age))) ready.push({ kind, how: 'surfacing' });
    } else if (year - surfaced.year >= b.resurfacing.afterYears) {
      // A talent you shrugged off can catch your attention again; a trait you pushed down comes back with your inner conflict.
      const p = kind === 'talent' ? curveAt(b.surfacing.talent.chance, c.age) : curveAt(b.resurfacing.chance, now);
      if (chance(state.rng, p)) ready.push({ kind, how: kind === 'talent' ? 'surfacing' : 'resurfacing' });
    }
  }
  if (ready.length === 0) return;
  const picked = pick(state.rng, ready);
  const events = picked.how === 'resurfacing' && picked.kind !== 'talent' ? registry.resurfacing[picked.kind].events : registry.surfacing[picked.kind].events;
  if (queueDiscoveryEvent(state, events, year, content)) markSurfaced(state, picked.kind);
}
