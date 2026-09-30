import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LineCounter, parseDocument } from 'yaml';
import {
  chainFileSchema,
  collectionTypes,
  eventSchema,
  LIFE_STAGE_IDS,
  contentBundleSchema,
  singletonTypes,
  type CollectionKey,
  type ContentBundle,
  type SingletonPath,
} from '../../src/content/schemas';
import { checkReferences } from './references';

/** Folders under src/content that hold code or build output, not content. */
const NON_CONTENT_FOLDERS = new Set(['schemas', 'compiled']);

export interface ContentError {
  /** Path relative to the content folder, with forward slashes. */
  file: string;
  message: string;
}

export type CompileResult =
  | { ok: true; bundle: ContentBundle; definitionCount: number }
  | { ok: false; errors: ContentError[] };

export interface CompileOptions {
  contentDir: string;
  appVersion: string;
  /**
   * A folder laid over contentDir (the end-to-end test content pack): its
   * files replace files at the same path, and if it has an events/ folder,
   * that replaces every real event.
   */
  overlayDir?: string;
}

/** Content files by path relative to the content folder, after applying the overlay. */
async function contentFiles(contentDir: string, overlayDir?: string): Promise<{ file: string; absolute: string }[]> {
  const relative = (dir: string, absolute: string) => path.relative(dir, absolute).split(path.sep).join('/');
  const byFile = new Map<string, string>();
  for (const absolute of await listYamlFiles(contentDir)) byFile.set(relative(contentDir, absolute), absolute);
  if (overlayDir) {
    const overlay = (await listYamlFiles(overlayDir)).map((absolute) => ({ file: relative(overlayDir, absolute), absolute }));
    if (overlay.some((o) => o.file.startsWith('events/'))) {
      for (const file of [...byFile.keys()]) if (file.startsWith('events/')) byFile.delete(file);
    }
    for (const o of overlay) byFile.set(o.file, o.absolute);
  }
  return [...byFile.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, absolute]) => ({ file, absolute }));
}

/** Formats errors as one "file: message" line each. */
export function formatErrors(errors: ContentError[]): string {
  return errors.map((e) => `  ${e.file}: ${e.message}`).join('\n');
}

async function listYamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

function formatIssuePath(issuePath: readonly PropertyKey[]): string {
  if (issuePath.length === 0) return '(file)';
  return issuePath
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

const EVENT_STAGE_FOLDERS = new Set<string>([...LIFE_STAGE_IDS, 'any']);

/**
 * Event files live at events/<lifeStage or any>/<category>/<id>.yaml, or
 * <chain>.chain.yaml for a chain's events together. Adds each event to the
 * bucket and returns what is wrong.
 */
function collectEvents(
  file: string,
  raw: unknown,
  bucket: Map<string, { file: string; def: { id: string; aliases?: string[] | undefined } }>,
): string[] {
  const errors: string[] = [];
  const parts = file.split('/');
  if (parts.length !== 4) return ['event files go in events/<lifeStage or any>/<category>/<file>.yaml'];
  const [, stage, category, name] = parts as [string, string, string, string];
  if (!EVENT_STAGE_FOLDERS.has(stage)) return [`unknown life stage folder "${stage}" (expected one of: ${[...EVENT_STAGE_FOLDERS].join(', ')})`];

  const isChain = /\.chain\.ya?ml$/i.test(name);
  const baseName = name.replace(/(\.chain)?\.ya?ml$/i, '');
  const parsed = isChain ? chainFileSchema.safeParse(raw) : eventSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${formatIssuePath(issue.path)} — ${issue.message}`);

  let defs;
  if ('chain' in parsed.data) {
    if (parsed.data.chain !== baseName) errors.push(`chain "${parsed.data.chain}" must match the file name ("${baseName}")`);
    defs = parsed.data.events;
  } else {
    if (parsed.data.id !== baseName) errors.push(`id "${parsed.data.id}" must match the file name ("${baseName}")`);
    defs = [parsed.data];
  }
  for (const def of defs) {
    if (def.category !== category) errors.push(`${def.id}: category "${def.category}" must match its folder ("${category}")`);
    if (stage !== 'any' && !(def.lifeStages as string[]).includes(stage)) {
      errors.push(`${def.id}: lifeStages must include its folder's stage "${stage}"`);
    }
    const clash = bucket.get(def.id);
    if (clash) errors.push(`duplicate event id "${def.id}" (also defined in ${clash.file})`);
    else if (errors.length === 0) bucket.set(def.id, { file, def });
  }
  return errors;
}

/** Locale-independent ordering, so the content version is the same on every machine. */
function byKey([a]: [string, unknown], [b]: [string, unknown]): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reads every YAML file under contentDir, validates it against its content
 * type's schema, checks references between files and returns the compiled
 * bundle, or every error found. Collects all errors instead of stopping at
 * the first, so one run shows everything that needs fixing.
 */
export async function compileContent({ contentDir, appVersion, overlayDir }: CompileOptions): Promise<CompileResult> {
  const errors: ContentError[] = [];
  const folderToCollection = new Map<string, CollectionKey>(
    (Object.keys(collectionTypes) as CollectionKey[]).map((key) => [collectionTypes[key].folder, key]),
  );
  const singletonFolders = new Set(Object.keys(singletonTypes).map((p) => p.split('/')[0]));
  const collected = new Map<CollectionKey, Map<string, { file: string; def: { id: string; aliases?: string[] | undefined } }>>(
    (Object.keys(collectionTypes) as CollectionKey[]).map((key) => [key, new Map()]),
  );
  const singletons = new Map<SingletonPath, unknown>();

  for (const { file, absolute } of await contentFiles(contentDir, overlayDir)) {
    const [folder] = file.split('/');
    if (folder === undefined || NON_CONTENT_FOLDERS.has(folder)) continue;

    const collectionKey = folderToCollection.get(folder);
    const singletonPath = file.replace(/\.ya?ml$/i, '') as SingletonPath;
    const isSingleton = singletonPath in singletonTypes;
    if (!file.includes('/') || (collectionKey === undefined && !isSingleton)) {
      const known = [...folderToCollection.keys(), ...Object.keys(singletonTypes).map((p) => `${p}.yaml`)];
      const message = singletonFolders.has(folder)
        ? `unknown file in ${folder}/ (expected one of: ${known.filter((k) => k.startsWith(`${folder}/`)).join(', ')})`
        : `not inside a known content folder (expected one of: ${known.join(', ')})`;
      errors.push({ file, message });
      continue;
    }

    const source = await readFile(absolute, 'utf8');
    const lineCounter = new LineCounter();
    // YAML 1.2 core schema: `no`, `on`, `yes` stay strings instead of booleans.
    const doc = parseDocument(source, { version: '1.2', schema: 'core', uniqueKeys: true, lineCounter });
    if (doc.errors.length > 0) {
      for (const err of doc.errors) {
        const pos = err.linePos?.[0];
        const where = pos ? `line ${pos.line}, column ${pos.col}: ` : '';
        errors.push({ file, message: `invalid YAML — ${where}${err.message.split('\n')[0]}` });
      }
      continue;
    }

    const raw: unknown = doc.toJS();

    if (collectionKey === 'events') {
      for (const error of collectEvents(file, raw, collected.get('events')!)) errors.push({ file, message: error });
      continue;
    }

    const schema = isSingleton ? singletonTypes[singletonPath] : collectionTypes[collectionKey!].schema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ file, message: `${formatIssuePath(issue.path)} — ${issue.message}` });
      }
      continue;
    }

    if (isSingleton) {
      singletons.set(singletonPath, parsed.data);
      continue;
    }

    const def = parsed.data as { id: string; aliases?: string[] | undefined };
    const expectedId = path.basename(file).replace(/\.ya?ml$/i, '');
    if (def.id !== expectedId) {
      errors.push({ file, message: `id "${def.id}" must match the file name ("${expectedId}")` });
      continue;
    }

    const bucket = collected.get(collectionKey!)!;
    const clash = bucket.get(def.id);
    if (clash) {
      errors.push({ file, message: `duplicate id "${def.id}" (also defined in ${clash.file})` });
      continue;
    }
    bucket.set(def.id, { file, def });
  }

  for (const required of Object.keys(singletonTypes) as SingletonPath[]) {
    if (!singletons.has(required) && !errors.some((e) => e.file.startsWith(`${required}.`))) {
      errors.push({ file: `${required}.yaml`, message: 'required file is missing' });
    }
  }

  // Aliases must not collide with real IDs or with each other.
  for (const [typeKey, bucket] of collected) {
    const seen = new Map<string, string>();
    for (const { file, def } of bucket.values()) {
      for (const alias of def.aliases ?? []) {
        if (bucket.has(alias)) {
          errors.push({ file, message: `alias "${alias}" is already the id of another ${typeKey} entry` });
        } else if (seen.has(alias)) {
          errors.push({ file, message: `alias "${alias}" is also used in ${seen.get(alias)}` });
        } else {
          seen.set(alias, file);
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const body: Record<string, unknown> = {};
  for (const [typeKey, bucket] of collected) {
    body[typeKey] = Object.fromEntries([...bucket.entries()].sort(byKey).map(([id, v]) => [id, v.def]));
  }
  for (const [singletonPath, value] of [...singletons.entries()].sort(byKey)) {
    const [group, name] = singletonPath.split('/') as [string, string];
    const target = (body[group] ??= {}) as Record<string, unknown>;
    target[name] = value;
  }

  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 10);
  const bundle = contentBundleSchema.parse({ contentVersion: `${appVersion}+${hash}`, ...body });

  const fileOf = (typeKey: CollectionKey, id: string) => collected.get(typeKey)?.get(id)?.file ?? `${typeKey}/${id}.yaml`;
  const referenceErrors = checkReferences(bundle, fileOf);
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };

  const definitionCount = [...collected.values()].reduce((sum, bucket) => sum + bucket.size, 0) + singletons.size;
  return { ok: true, bundle, definitionCount };
}
