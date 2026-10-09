/**
 * Event sandbox (Stage 10, development only): previews any event with any
 * cast, pronoun set and character state, without a real life behind it. The
 * preview is a throwaway life: a random life from the seed, set to the age,
 * stats and personality asked for, with someone new created for every role
 * (all using one pronoun set). It never touches a saved life.
 */
import { produce } from 'immer';
import type { CastSpec, ContentBundle, Tone } from '../content/schemas';
import { evaluate } from './conditions';
import { pronounsFromPreset } from './creation/character';
import { createPerson, otherCity } from './events/casting';
import { giveSampleLife, lifeConditionFor } from './lives/sample';
import { giveSampleWeb } from './web/sample';
import { giveSamplePossessions } from './possessions/sample';
import { giveSampleTeen } from './teen/sample';
import { giveSampleCrime } from './crime/sample';
import { giveSampleFame } from './fame/sample';
import { consistencyProblems } from './presence';
import { isPartnerKind } from './relationships';
import { createLife, resolveChoice } from './life';
import { createRng } from './rng';
import { getEventCard } from './selectors';
import { lifeStageForAge } from './systems/aging';
import type { Id, LifeState, Personality, Stats } from './types';

export const SANDBOX_INSTANCE = 'sandbox';

export interface SandboxOptions {
  eventId: string;
  seed: string;
  age: number;
  /** Pronoun preset ids: yours, and everyone cast in the event. */
  selfPronouns: string;
  castPronouns: string;
  stats?: Partial<Stats>;
  personality?: Partial<Personality>;
}

export interface SandboxPreview {
  /** The throwaway life, with the event pending (for sandboxOutcome). */
  life: LifeState;
  title: string;
  text: string;
  tone: Tone;
  cast: { role: string; name: string; age: number }[];
  /** Every choice, with whether this state would show it (visibleIf). */
  choices: { id: string; label: string; visible: boolean }[];
  /** False when the event's requirements wouldn't hold in this state (it is previewed anyway). */
  requirementsMet: boolean;
  /** C1: the category contract or presence rules this preview breaks (it is previewed anyway). */
  consistency: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Builds the preview. Throws for an unknown event or pronoun preset. */
export function previewEvent(content: ContentBundle, options: SandboxOptions): SandboxPreview {
  const def = content.events[options.eventId];
  if (!def) throw new Error(`Unknown event "${options.eventId}".`);
  const self = pronounsFromPreset(content, options.selfPronouns);
  const others = pronounsFromPreset(content, options.castPronouns);
  const age = Math.max(0, Math.min(content.balance.mortality.maxAge, Math.round(options.age)));

  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 2026 }, content);
  const life = produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    d.character.identity.pronouns = self;
    for (const [key, value] of Object.entries(options.stats ?? {})) d.character.stats[key as keyof Stats] = clamp(value);
    for (const [key, value] of Object.entries(options.personality ?? {})) d.character.personality[key as keyof Personality] = clamp(value);
    for (const p of Object.values(d.people)) p.birthYear = Math.min(p.birthYear, d.currentYear);

    const rng = createRng(`${options.seed}:sandbox`);
    const cast: Record<string, Id> = {};
    for (const role of Object.keys(def.cast ?? {}).sort()) {
      const spec = def.cast![role]!;
      const kind = spec.kind ?? 'friend';
      const plain: CastSpec = { kind, presence: 'city', ...(spec.age ? { age: spec.age } : {}), ...(spec.ageOffset ? { ageOffset: spec.ageOffset } : {}) };
      // A romantic role needs someone you'd match with; fall back to anyone of the kind and ages.
      const id =
        createPerson(d, { ...spec, kind, support: undefined, presence: 'city' }, rng, content) ??
        createPerson(d, plain, rng, content) ??
        createPerson(d, { kind, presence: 'city' }, rng, content);
      if (!id) continue;
      d.people[id]!.identity.pronouns = others;
      // Put them where the role needs them (C1, presence).
      if (spec.presence === 'elsewhere') d.people[id]!.cityId = otherCity(d, rng, content);
      if (spec.presence === 'household') {
        if (isPartnerKind(kind)) d.housing.partnerId = id;
        else d.housing.kind = 'with_parents';
      }
      // E3: and a life that fits what the event asks of them (a partner, a job, a trouble).
      giveSampleLife(d as LifeState, id, lifeConditionFor(def.requires, role), content);
      cast[role] = id;
    }
    // E4: a tie between the people cast, and what one of them has heard, as the event asks.
    giveSampleWeb(d as LifeState, def, cast, content);
    // E5: the pet, vehicle or vacation home the event is about.
    giveSamplePossessions(d as LifeState, def, cast, content);
    // T1: the school, crowd, rules at home, license, job or team the event asks for.
    giveSampleTeen(d as LifeState, def, cast, content);
    // E6a: the crew, rank, heat, investigation or dirty money the event asks for.
    giveSampleCrime(d as LifeState, def, cast, content);
    // E6b: the career, release, fans or stalker the event asks for.
    giveSampleFame(d as LifeState, def, cast, content);
    d.phase = 'events';
    d.pending = [{ instanceId: SANDBOX_INSTANCE, eventId: def.id, cast }];
  });

  const instance = life.pending[0]!;
  const card = getEventCard(life, 0, content)!;
  const visible = new Set(card.choices.map((c) => c.id));
  const labels = new Map(card.choices.map((c) => [c.id, c.label]));
  return {
    life,
    title: card.title,
    text: card.text,
    tone: card.tone,
    cast: Object.entries(instance.cast).filter(([role]) => !role.startsWith('@')).map(([role, id]) => {
      const p = life.people[id]!;
      return { role, name: `${p.name.first} ${p.name.last}`, age: life.currentYear - p.birthYear };
    }),
    choices: def.choices
      ? def.choices.map((c) => ({ id: c.id, label: labels.get(c.id) ?? c.label, visible: visible.has(c.id) }))
      : card.choices.map((c) => ({ ...c, visible: true })),
    requirementsMet: evaluate(def.requires, life, { cast: instance.cast, roles: 'strict', content }),
    consistency: consistencyProblems(life, def, instance.cast, content),
  };
}

/** The outcome text of a visible choice in a preview (its effects are applied to the throwaway life only). */
export function sandboxOutcome(preview: SandboxPreview, choiceId: string, content: ContentBundle): string {
  const after = resolveChoice(preview.life, SANDBOX_INSTANCE, choiceId, content);
  return after.pending[0]?.outcomeText ?? '';
}
