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
  {
    from: 4,
    description:
      'Stage 6: the birth city (the city you lived in, since nobody could move before), the year you moved into your ' +
      'home (birth), money-trouble tracking (none yet) and the earnings record (empty: nobody earned before). The ' +
      'ledger has never run, so there is no last ledger.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const life = data as { birthYear?: unknown; character?: unknown; finances?: unknown; housing?: unknown };
      const character = isRecord(life.character) ? { ...life.character, birthCityId: life.character.cityId } : life.character;
      const finances = isRecord(life.finances) ? { ...life.finances, earnings: { years: 0, total: 0 }, hardshipYears: 0 } : life.finances;
      const housing = isRecord(life.housing) ? { ...life.housing, since: life.birthYear } : life.housing;
      return { ...data, character, finances, housing };
    },
  },
  {
    from: 5,
    description:
      'Stage 7: education. Adds the admission, the program you left, this year’s applications and scholarship money ' +
      '(all empty). Nobody went to school before, so an adult (18 or older) is given the high school diploma they ' +
      'would have earned at 18, without a GPA; a child starts school at the next age-up.',
    migrate: (data) => {
      if (!isRecord(data)) return data;
      const life = data as { birthYear?: unknown; currentYear?: unknown; education?: unknown };
      if (!isRecord(life.education)) return data;
      const credentials = Array.isArray(life.education.credentials) ? [...(life.education.credentials as unknown[])] : [];
      const { birthYear, currentYear } = life;
      if (typeof birthYear === 'number' && typeof currentYear === 'number' && currentYear - birthYear >= 18 && credentials.length === 0) {
        credentials.push({ type: 'hs_diploma', year: birthYear + 18 });
      }
      return { ...data, education: { ...life.education, credentials, admission: null, left: null, applied: [], fund: 0 } };
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
