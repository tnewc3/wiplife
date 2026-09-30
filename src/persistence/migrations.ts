import { CURRENT_SCHEMA_VERSION, type SaveEnvelope } from './envelope';

/** Upgrades saved data from schemaVersion `from` to `from + 1`. */
export interface Migration {
  from: number;
  description: string;
  migrate: (data: unknown) => unknown;
}

/**
 * Every migration ever shipped, oldest first. Never edit or remove one that
 * has shipped: old saves on players' devices still depend on it.
 */
export const migrations: readonly Migration[] = [
  {
    from: 1,
    description: 'Stage 3: add the year recap and death record (both empty for a Stage 2 life)',
    migrate: (data) =>
      typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data, recap: null, death: null } : data,
  },
  {
    from: 2,
    description:
      'Stage 4: add lifetime happiness. Happiness never changed in Stage 3, so every finished year had the current value.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { phase?: unknown; character?: { age?: unknown; stats?: { happiness?: unknown } } };
      const age = typeof life.character?.age === 'number' ? life.character.age : 0;
      const happiness = typeof life.character?.stats?.happiness === 'number' ? life.character.stats.happiness : 0;
      const years = Math.max(0, life.phase === 'events' || life.phase === 'yearEnd' ? age - 1 : age);
      return { ...data, lifetime: { happinessTotal: happiness * years, years } };
    },
  },
  {
    from: 3,
    description:
      'Stage 5: mark everyone who has been your spouse (wasSpouse). A spouse is marked; an ex is marked when a ' +
      'memory shows the marriage ("married_you" or "divorced"). Saves from before Stage 5 have neither.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { relationships?: unknown };
      if (typeof life.relationships !== 'object' || life.relationships === null) return data;
      const relationships: Record<string, unknown> = {};
      for (const [id, value] of Object.entries(life.relationships as Record<string, unknown>)) {
        const rel = value as { kind?: unknown; memories?: unknown };
        const memories = Array.isArray(rel.memories) ? (rel.memories as { tag?: unknown }[]) : [];
        const married =
          rel.kind === 'spouse' || (rel.kind === 'ex' && memories.some((m) => m.tag === 'married_you' || m.tag === 'divorced'));
        relationships[id] = married && typeof value === 'object' && value !== null ? { ...value, wasSpouse: true } : value;
      }
      return { ...data, relationships };
    },
  },
];

export class MigrationError extends Error {
  override name = 'MigrationError';
}

/**
 * Runs the migrations needed to bring an envelope up to `targetVersion`, in
 * order. Throws a MigrationError if the save comes from a newer version of the
 * game or if a step is missing.
 */
export function migrateEnvelope(
  envelope: SaveEnvelope,
  list: readonly Migration[] = migrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): SaveEnvelope {
  if (envelope.schemaVersion > targetVersion) {
    throw new MigrationError(
      `Save uses schema version ${envelope.schemaVersion}, but this version of WIPlife only understands up to ${targetVersion}.`,
    );
  }
  let data = envelope.data;
  for (let version = envelope.schemaVersion; version < targetVersion; version++) {
    const step = list.find((m) => m.from === version);
    if (!step) throw new MigrationError(`No migration from schema version ${version} to ${version + 1}.`);
    data = step.migrate(data);
  }
  return { ...envelope, schemaVersion: targetVersion, data };
}

/** Checks that the list has exactly one step for every version below the target. */
export function assertMigrationChain(
  list: readonly Migration[] = migrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): void {
  for (let version = 1; version < targetVersion; version++) {
    const count = list.filter((m) => m.from === version).length;
    if (count !== 1) throw new MigrationError(`Expected one migration from version ${version}, found ${count}.`);
  }
  const stray = list.find((m) => m.from < 1 || m.from >= targetVersion);
  if (stray) throw new MigrationError(`Migration from version ${stray.from} is outside the chain.`);
}
