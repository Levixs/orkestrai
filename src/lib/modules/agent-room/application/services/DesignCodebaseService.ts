import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import {
  designCodebaseScanSchema,
  type DesignCodeComponentCandidate,
  type DesignCodeTokenCandidate,
  type DesignCodebaseScan,
} from '../../contracts/schemas/designCodebaseSchemas.js';
import type { DesignVariableType } from '../../contracts/schemas/designSchemas.js';

const execFileAsync = promisify(execFile);
const FILE_LIMIT = 500;
const FILE_SIZE_LIMIT = 512 * 1024;

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function normalizedPath(root: string, path: string): string {
  const absolute = resolve(path);
  if (!absolute.startsWith(resolve(root) + sep)) throw new Error('Invalid codebase path.');
  return relative(root, absolute).split(sep).join('/');
}

function inferType(name: string, value: string): Exclude<DesignVariableType, 'effect'> {
  const normalized = name.toLocaleLowerCase();
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
  if (value === 'true' || value === 'false') return 'boolean';
  if (normalized.includes('font-weight') || normalized.includes('weight')) return 'font-weight';
  if (normalized.includes('font-size') || normalized.includes('text-size')) return 'font-size';
  if (normalized.includes('line-height') || normalized.includes('leading')) return 'line-height';
  if (normalized.includes('radius') || normalized.includes('rounded')) return 'radius';
  if (normalized.includes('opacity') || normalized.includes('alpha')) return 'opacity';
  if (normalized.includes('breakpoint') || normalized.includes('screen')) return 'breakpoint';
  if (/^-?\d+(?:\.\d+)?(?:px|rem)?$/i.test(value)) return 'spacing';
  return 'string';
}

function normalizedValue(type: Exclude<DesignVariableType, 'effect'>, raw: string): string | number | boolean {
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (type === 'boolean') return value === 'true';
  if (type === 'color' || type === 'string') return value;
  const match = value.match(/^(-?\d+(?:\.\d+)?)(px|rem)?$/i);
  if (!match) return value;
  const number = Number(match[1]);
  return match[2]?.toLocaleLowerCase() === 'rem' ? number * 16 : number;
}

export function extractCssDesignTokens(content: string, path: string, fileHash = hash(content)): DesignCodeTokenCandidate[] {
  const result: DesignCodeTokenCandidate[] = [];
  const entries = [...new Map(
    [...content.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g)]
      .map((match) => [match[1], { key: match[1], raw: match[2].trim() }]),
  ).values()];
  for (const entry of entries) {
    const raw = entry.raw;
    const name = entry.key.replace(/-/g, '/');
    const alias = raw.match(/^var\(--([A-Za-z0-9_-]+)\)$/)?.[1]?.replace(/-/g, '/') ?? null;
    const aliasSource = alias ? entries.find((candidate) => candidate.key === alias.replace(/\//g, '-')) : null;
    const type = aliasSource ? inferType(aliasSource.key, aliasSource.raw) : inferType(name, raw);
    result.push({ key: `${path}:${entry.key}`, name, type, value: normalizedValue(type, raw), aliasKey: alias ? `${path}:${alias.replace(/\//g, '-')}` : null, path, format: 'css', hash: fileHash });
  }
  return result;
}

function objectBlock(content: string, key: string): string | null {
  const match = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*\\{`, 'm').exec(content);
  if (!match) return null;
  const start = content.indexOf('{', match.index);
  let depth = 0;
  let quote = '';
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (char === quote && content[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return content.slice(start + 1, index);
  }
  return null;
}

export function extractTailwindDesignTokens(content: string, path: string, fileHash = hash(content)): DesignCodeTokenCandidate[] {
  const result: DesignCodeTokenCandidate[] = [];
  const groups: Array<{ key: string; prefix: string; type: Exclude<DesignVariableType, 'effect'> }> = [
    { key: 'colors', prefix: 'color', type: 'color' },
    { key: 'spacing', prefix: 'space', type: 'spacing' },
    { key: 'borderRadius', prefix: 'radius', type: 'radius' },
    { key: 'fontSize', prefix: 'font-size', type: 'font-size' },
    { key: 'fontWeight', prefix: 'font-weight', type: 'font-weight' },
    { key: 'screens', prefix: 'breakpoint', type: 'breakpoint' },
    { key: 'opacity', prefix: 'opacity', type: 'opacity' },
  ];
  for (const group of groups) {
    const block = objectBlock(content, group.key);
    if (!block) continue;
    for (const match of block.matchAll(/(?:^|,)\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_-]+))\s*:\s*(?:['"]([^'"]+)['"]|(-?\d+(?:\.\d+)?))/gm)) {
      const key = match[1] ?? match[2];
      const raw = match[3] ?? match[4];
      if (!key || raw === undefined) continue;
      const type = group.type === 'color' ? inferType(`${group.prefix}/${key}`, raw) : group.type;
      result.push({ key: `${path}:${group.key}:${key}`, name: `${group.prefix}/${key}`, type, value: normalizedValue(type, raw), aliasKey: null, path, format: 'tailwind', hash: fileHash });
    }
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 200);
}

export function extractDesignCodeComponent(content: string, path: string, fileHash = hash(content)): DesignCodeComponentCandidate | null {
  const fileName = path.split('/').at(-1)?.replace(/\.(svelte|tsx?|jsx?|vue)$/i, '') ?? 'Component';
  if (path.endsWith('.svelte')) {
    const destructured = content.match(/let\s*\{([^}]+)\}\s*(?::[^=]+)?=\s*\$props/)?.[1] ?? '';
    const props = unique([
      ...destructured.split(',').map((part) => part.split(/[:=]/)[0]),
      ...[...content.matchAll(/export\s+let\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
    ]);
    return { key: `${path}:${fileName}`, name: fileName, exportName: fileName, framework: 'svelte', path, props, hash: fileHash };
  }
  if (path.endsWith('.vue')) {
    const propsBlock = content.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/)?.[1] ?? '';
    const props = unique([...propsBlock.matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)].map((match) => match[1]));
    return { key: `${path}:${fileName}`, name: fileName, exportName: fileName, framework: 'vue', path, props, hash: fileHash };
  }
  const exportMatch = content.match(/export\s+(?:default\s+)?(?:function|class|const)\s+([A-Z][A-Za-z0-9_$]*)/);
  const name = exportMatch?.[1] ?? (/^[A-Z]/.test(fileName) ? fileName : null);
  if (!name) return null;
  const props = unique([
    ...[...content.matchAll(/(?:interface|type)\s+\w*Props\s*(?:=)?\s*\{([\s\S]*?)\}/g)].flatMap((match) => [...match[1].matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)].map((item) => item[1])),
  ]);
  return { key: `${path}:${name}`, name, exportName: name, framework: 'react', path, props, hash: fileHash };
}

export class DesignCodebaseService {
  async scan(workspaceId: string): Promise<DesignCodebaseScan> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace not found.');
    const root = await realpath(resolve(workspace.workingDir));
    const { rgPath } = await import('@vscode/ripgrep');
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync(rgPath, [
        '--files', '--hidden',
        '--glob', '!node_modules/**', '--glob', '!.git/**', '--glob', '!build/**', '--glob', '!dist/**', '--glob', '!.svelte-kit/**',
        '--glob', '*.css', '--glob', 'tailwind.config.*', '--glob', '*.svelte', '--glob', '*.tsx', '--glob', '*.jsx', '--glob', '*.vue',
        root,
      ], { timeout: 5_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }));
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string };
      if (Number(failure.code) !== 1) throw error;
      stdout = failure.stdout ?? '';
    }
    const allFiles = stdout.split(/\r?\n/).filter(Boolean);
    const files = allFiles.slice(0, FILE_LIMIT);
    const tokens: DesignCodeTokenCandidate[] = [];
    const components: DesignCodeComponentCandidate[] = [];
    for (const absolutePath of files) {
      try {
        const canonicalPath = await realpath(absolutePath);
        if (!canonicalPath.startsWith(root + sep) || (await stat(canonicalPath)).size > FILE_SIZE_LIMIT) continue;
        const content = await readFile(canonicalPath, 'utf8');
        if (content.includes('\0')) continue;
        const path = normalizedPath(root, canonicalPath);
        const fileHash = hash(content);
        if (path.endsWith('.css')) tokens.push(...extractCssDesignTokens(content, path, fileHash));
        if (/tailwind\.config\./i.test(path)) tokens.push(...extractTailwindDesignTokens(content, path, fileHash));
        if (/\.(svelte|tsx|jsx|vue)$/i.test(path)) {
          const candidate = extractDesignCodeComponent(content, path, fileHash);
          if (candidate) components.push(candidate);
        }
      } catch {
        // Files can disappear during an editor save; the next scan will include them.
      }
    }
    return designCodebaseScanSchema.parse({
      files: files.map((path) => normalizedPath(root, path)),
      tokens,
      components,
      truncated: allFiles.length > FILE_LIMIT,
      scannedAt: new Date().toISOString(),
    });
  }
}

export const designCodebaseService = new DesignCodebaseService();
