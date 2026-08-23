import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { ApiClientNodePayload } from '../../domain/types.js';

const MAX_FILES = 2_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) throw new Error('The collection exceeds the 2,000 file synchronization limit.');
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  return files.sort();
}

export async function apiClientSourceRoot(path: string, kind: ApiClientNodePayload['sourceKind']): Promise<string> {
  const info = await stat(path);
  if (kind === 'bruno' || kind === 'openCollection') return info.isDirectory() ? resolve(path) : dirname(resolve(path));
  return resolve(path);
}

export async function apiClientSourceFingerprint(path: string): Promise<string> {
  const hash = createHash('sha256');
  const info = await stat(path);
  const files = info.isDirectory() ? await filesUnder(path) : [path];
  const root = info.isDirectory() ? path : dirname(path);
  for (const file of files) {
    const fileInfo = await stat(file);
    if (fileInfo.size > MAX_FILE_SIZE) throw new Error('A collection file exceeds the 10 MB synchronization limit.');
    hash.update(relative(root, file).split(sep).join('/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function apiClientManagedSourceFiles(root: string, kind: ApiClientNodePayload['sourceKind']): Promise<string[]> {
  if (kind !== 'bruno' && kind !== 'openCollection') return [];
  const info = await stat(root);
  if (!info.isDirectory()) return [];
  return (await filesUnder(root))
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => /(?:^|\/)(?:bruno\.json|[^/]+\.(?:bru|ya?ml))$/i.test(file));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

export function apiClientPayloadFingerprint(payload: ApiClientNodePayload): string {
  const editable = {
    requests: payload.requests ?? [],
    folders: payload.folders ?? [],
    runners: payload.runners ?? [],
    selectedRunnerId: payload.selectedRunnerId ?? null,
    selectedRequestId: payload.selectedRequestId ?? null,
    variables: payload.variables ?? {},
    environments: payload.environments ?? {},
    globalVariables: payload.globalVariables ?? {},
    runtimeVariables: payload.runtimeVariables ?? {},
    scriptDialect: payload.scriptDialect ?? 'orkestrai',
    activeEnvironment: payload.activeEnvironment ?? null,
    collectionPreRequestScript: payload.collectionPreRequestScript ?? '',
    collectionPostResponseScript: payload.collectionPostResponseScript ?? '',
  };
  return createHash('sha256').update(JSON.stringify(canonical(editable))).digest('hex');
}

export async function writeApiClientFileAtomic(path: string, content: string): Promise<void> {
  const target = resolve(path);
  const temporary = join(dirname(target), `.${basename(target)}.orkestrai-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function mirrorGeneratedCollection(input: { generatedRoot: string; sourceRoot: string; previousManagedFiles: string[] }): Promise<string[]> {
  const generatedFiles = await filesUnder(input.generatedRoot);
  const managedFiles = generatedFiles.map((file) => relative(input.generatedRoot, file).split(sep).join('/')).sort();
  const nextSet = new Set(managedFiles);
  const safeSourceRoot = resolve(input.sourceRoot);
  for (const stale of input.previousManagedFiles) {
    if (nextSet.has(stale) || stale.includes('..')) continue;
    const target = resolve(safeSourceRoot, stale);
    if (target !== safeSourceRoot && target.startsWith(`${safeSourceRoot}${sep}`)) await unlink(target).catch(() => undefined);
  }
  for (const relativePath of managedFiles) {
    const source = resolve(input.generatedRoot, relativePath);
    const target = resolve(safeSourceRoot, relativePath);
    if (!target.startsWith(`${safeSourceRoot}${sep}`)) throw new Error('A generated collection path escaped the source directory.');
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await rm(input.generatedRoot, { recursive: true, force: true });
  return managedFiles;
}
