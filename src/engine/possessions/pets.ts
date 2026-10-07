/**
 * Pets (E5): adopting or buying one (or one turning up through an event),
 * its personality, health, bond, yearly care, vet visits, ageing and death.
 * A pet's health is the possession's `condition`; its lifespan is rolled
 * when it joins you (within its species' range) and illness can cut it
 * short, never below the shortest. Costs go through the finance module.
 * Numbers come from src/content/balance/possessions.yaml.
 */
import type { ContentBundle, PetSourceId } from '../../content/schemas';
import { PET_PERSONALITIES } from '../../content/schemas';
import { curveAt } from '../curve';
import { spend, wholeDollars } from '../finance';
import { clampInt, weightedPick } from '../random';
import { chance, nextInt, pick } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState, Possession } from '../types';
import { costOfLiving, livingPets, nextPossessionId, petAge, petDef, petOf, possessionById } from './query';

const pb = (content: ContentBundle) => content.balance.possessions.pets;

/** What a shelter or breeder asks for this pet in your city. A stray costs nothing. */
export function petPrice(state: LifeState, defId: Id, source: PetSourceId, content: ContentBundle): number {
  const def = content.pets[defId];
  if (!def || source === 'stray') return 0;
  return wholeDollars((source === 'shelter' ? def.adoptCost : def.buyCost) * costOfLiving(state, content));
}

export type PetBlock = 'age' | 'limit' | 'savings' | 'unknown';

/** Why you can't take this pet in now, or null. */
export function petBlock(state: LifeState, defId: Id, source: PetSourceId, content: ContentBundle): PetBlock | null {
  const def = content.pets[defId];
  if (!def || def.retired) return 'unknown';
  if (state.character.age < pb(content).adoptAge) return 'age';
  if (livingPets(state).length >= content.balance.possessions.limits.pets) return 'limit';
  if (state.finances.savings < petPrice(state, defId, source, content)) return 'savings';
  return null;
}

/** A pet's name is plain text: 1–20 letters, spaces, hyphens and apostrophes, starting with a letter. */
export function validPetName(name: unknown): name is string {
  return typeof name === 'string' && /^[\p{L}][\p{L}' -]{0,19}$/u.test(name.trim());
}

/** A pet joins you (the caller has checked there is room): its personality, age, lifespan, health and bond come from the life's generator. */
export function addPet(state: LifeState, defId: Id, source: PetSourceId, name: string, content: ContentBundle): Possession {
  const def = content.pets[defId]!;
  const b = pb(content);
  const personality = weightedPick(state.rng, PET_PERSONALITIES.map((k) => [k, def.personalities[k]] as const));
  const lifespan = nextInt(state.rng, def.lifespan.min, def.lifespan.max);
  const share = b.startAgeShare[source];
  const startAge = Math.max(0, Math.min(lifespan - 1, Math.round(lifespan * (share.min + ((share.max - share.min) * nextInt(state.rng, 0, 100)) / 100))));
  const p: Possession = {
    id: nextPossessionId(state),
    kind: 'pet',
    defId,
    acquired: state.currentYear,
    value: 0,
    condition: b.startHealth[source],
    name: name.trim(),
    pet: { personality, bond: b.startBond[source], startAge, lifespan, ill: false },
  };
  state.possessions.items.push(p);
  writeFromGroup(state, content.text.possessions.history.petAdopted, ['possessions', 'petAdopted', `pet:${defId}`], { values: { pet: p.name!, species: def.name } }, content);
  return p;
}

/** Takes a pet in and pays for it (adopt or buy). The caller has checked `petBlock`. */
export function takePetIn(state: LifeState, defId: Id, source: PetSourceId, name: string, content: ContentBundle): Possession {
  spend(state, petPrice(state, defId, source, content), content);
  return addPet(state, defId, source, name, content);
}

/** A name from the content's list that none of your pets has. */
export function randomPetName(state: LifeState, content: ContentBundle): string {
  const taken = new Set(state.possessions.items.map((p) => p.name));
  const names = content.text.possessions.petNames;
  const free = names.filter((n) => !taken.has(n));
  return pick(state.rng, free.length > 0 ? free : names);
}

/** What a vet visit costs now: the species' fee in your city, more for an ill pet. */
export function vetCost(state: LifeState, p: Possession, content: ContentBundle): number {
  return wholeDollars(petDef(content, p).vetCost * costOfLiving(state, content) * (petOf(p).ill ? pb(content).illVetMult : 1));
}

/** A vet visit is possible: once a year, for a living pet, and you can pay from savings. */
export function canVisitVet(state: LifeState, p: Possession, content: ContentBundle): boolean {
  return p.kind === 'pet' && petOf(p).died === undefined && petOf(p).vetYear !== state.currentYear && state.housing.kind !== 'incarcerated' && state.finances.savings >= vetCost(state, p, content);
}

/** A vet visit: paid, an ill pet is cured, and its health and bond improve. */
export function visitVet(state: LifeState, id: Id, content: ContentBundle): void {
  const p = possessionById(state, id);
  if (!p || p.kind !== 'pet') return;
  const b = pb(content);
  const pet = petOf(p);
  spend(state, vetCost(state, p, content), content);
  p.condition = clampInt(p.condition + b.health.vet.checkup + (pet.ill ? b.health.vet.cure : 0), 0, 100);
  pet.ill = false;
  pet.vetYear = state.currentYear;
  pet.bond = clampInt(pet.bond + 2, 0, 100);
}

/** What routine care for all your pets costs this year (food, supplies, grooming), scaled to your city. */
export function petUpkeep(state: LifeState, content: ContentBundle): number {
  return livingPets(state).reduce((sum, p) => sum + wholeDollars(petDef(content, p).yearlyCost * costOfLiving(state, content)), 0);
}

/** Interactions you had with this pet in `year` (the year you were acting in: counters are per year). */
export function interactionsIn(p: Possession, year: number): number {
  const i = petOf(p).interactions;
  return i && i.year === year ? Object.values(i.counts).reduce((a, n) => a + n, 0) : 0;
}

/**
 * A pet's year: its health moves with age (and illness, and a vet visit),
 * it may fall ill, its bond follows the time you gave it, a failing ill
 * pet's life is cut short, and at its lifespan it dies. Draws from the
 * life's generator. Returns true when it died this year.
 */
export function petYear(state: LifeState, p: Possession, content: ContentBundle): boolean {
  const b = pb(content);
  const def = petDef(content, p);
  const pet = petOf(p);
  const age = petAge(state, p);
  const share = Math.min(1, age / pet.lifespan);
  // What you did between the last year's end and this one's start belongs to the year that just ended.
  const acted = state.currentYear - 1;
  const vetted = pet.vetYear === acted;
  let delta = b.health.drift + b.health.ageDrift * share + (vetted ? b.health.vet.checkup : 0);

  if (!pet.ill && !vetted && chance(state.rng, Math.min(1, def.sickChance * curveAt(b.health.sick.ageShare, share)))) {
    pet.ill = true;
    delta -= nextInt(state.rng, b.health.sick.severity.min, b.health.sick.severity.max);
  } else if (pet.ill) {
    if (vetted) pet.ill = false;
    else {
      delta -= b.health.sick.untreated;
      if (p.condition > b.health.sick.recoverAbove && chance(state.rng, b.health.sick.recover)) pet.ill = false;
    }
  }
  p.condition = clampInt(p.condition + Math.round(delta), 0, 100);

  const together = interactionsIn(p, acted) > 0;
  const neglect = state.housing.kind === 'incarcerated' || !together ? b.bond.decay * def.attention : 0;
  pet.bond = clampInt(pet.bond + Math.round(b.bond.companionship - neglect), 0, 100);

  if (pet.ill && p.condition <= b.health.failing && pet.lifespan > def.lifespan.min) pet.lifespan = Math.max(def.lifespan.min, pet.startAge + 1, pet.lifespan - b.health.lifespanLoss);
  if (age >= pet.lifespan) {
    pet.died = state.currentYear;
    writeFromGroup(state, content.text.possessions.history.petDied, ['possessions', 'petDied', `pet:${p.defId}`], { values: { pet: p.name!, species: def.name } }, content);
    return true;
  }
  return false;
}

/** A pet leaves your life without dying (rehomed, kept by someone you parted from). */
export function petLeaves(state: LifeState, p: Possession, content: ContentBundle): void {
  const def = petDef(content, p);
  state.possessions.items = state.possessions.items.filter((q) => q.id !== p.id);
  writeFromGroup(state, content.text.possessions.history.petLeft, ['possessions', 'petLeft'], { values: { pet: p.name!, species: def.name } }, content);
}

/** An event says the pet dies: only a pet that has lived at least its species' shortest life can (otherwise nothing happens). */
export function petDiesNow(state: LifeState, p: Possession, content: ContentBundle): void {
  const def = petDef(content, p);
  const pet = petOf(p);
  if (pet.died !== undefined || petAge(state, p) < def.lifespan.min) return;
  pet.died = state.currentYear;
  writeFromGroup(state, content.text.possessions.history.petDied, ['possessions', 'petDied', `pet:${p.defId}`], { values: { pet: p.name!, species: def.name } }, content);
}
