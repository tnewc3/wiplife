import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LineCounter, parseDocument } from 'yaml';
import type { z } from 'zod';
import { contentBundleSchema, contentTypes, type ContentBundle, type ContentTypeKey } from '../../src/content/schemas';

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

/**
 * Reads every YAML file under contentDir, validates it against its content
 * type's schema and returns the compiled bundle, or every error found.
 * Collects all errors instead of stopping at the first, so one run shows
 * everything that needs fixing.
 */
export async function compileContent({ contentDir, appVersion }: CompileOptions): Promise<CompileResult> {
  const errors: ContentError[] = [];
  const folderToType = new Map<string, ContentTypeKey>(
    (Object.keys(contentTypes) as ContentTypeKey[]).map((key) => [contentTypes[key].folder, key]),
  );
  const collected: { [K in ContentTypeKey]: Map<string, { file: string; def: z.infer<(typeof contentTypes)[K]['schema']> }> } = {
    cities: new Map(),
  };

  const files = await listYamlFiles(contentDir);
  for (const absolute of files) {
    const file = path.relative(contentDir, absolute).split(path.sep).join('/');
    const [folder] = file.split('/');
    if (folder === undefined || NON_CONTENT_FOLDERS.has(folder)) continue;

    const typeKey = folderToType.get(folder);
    if (typeKey === undefined || !file.includes('/')) {
      errors.push({
        file,
        message: `not inside a known content folder (expected one of: ${[...folderToType.keys()].join(', ')})`,
      });
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
    const { schema } = contentTypes[typeKey];
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ file, message: `${formatIssuePath(issue.path)} — ${issue.message}` });
      }
      continue;
    }

    const def = parsed.data;
    const expectedId = path.basename(file).replace(/\.ya?ml$/i, '');
    if (def.id !== expectedId) {
      errors.push({ file, message: `id "${def.id}" must match the file name ("${expectedId}")` });
      continue;
    }

    const bucket = collected[typeKey];
    const clash = bucket.get(def.id);
    if (clash) {
      errors.push({ file, message: `duplicate id "${def.id}" (also defined in ${clash.file})` });
      continue;
    }
    bucket.set(def.id, { file, def });
  }

  // Aliases must not collide with real IDs or with each other.
  for (const typeKey of Object.keys(collected) as ContentTypeKey[]) {
    const bucket = collected[typeKey];
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

  const sortedRecord = <T>(bucket: Map<string, { def: T }>): Record<string, T> =>
    Object.fromEntries([...bucket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => [id, v.def]));

  const body = { cities: sortedRecord(collected.cities) };
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 10);
  const bundle = contentBundleSchema.parse({ contentVersion: `${appVersion}+${hash}`, ...body });

  const definitionCount = Object.values(collected).reduce((sum, bucket) => sum + bucket.size, 0);
  return { ok: true, bundle, definitionCount };
}
