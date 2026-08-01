import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

export type FsEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
};

const MAX_READ_BYTES = 512 * 1024; // 512 KB
const IGNORED = new Set(['.git', 'node_modules', '.svelte-kit', 'build', 'dist']);

/**
 * Acesso ao filesystem confinado ao working_dir do workspace.
 */
export class FilesystemService {
  private async root(workspaceId: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return resolve(workspace.workingDir);
  }

  private async resolveSafe(workspaceId: string, path?: string | null): Promise<string> {
    const root = await this.root(workspaceId);
    const input = (path ?? '').trim();
    // Caminho absoluto e aceito desde que dentro do root; relativo resolve contra o root.
    const resolved = input.startsWith(sep) || /^[A-Za-z]:[\\/]/.test(input) ? resolve(input) : resolve(root, input);
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw new Error('Caminho fora do diretorio do workspace.');
    }
    return resolved;
  }

  async list(workspaceId: string, path?: string | null): Promise<FsEntry[]> {
    const dir = await this.resolveSafe(workspaceId, path);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`Diretorio nao encontrado: ${path ?? '/'}`);
    }
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !IGNORED.has(entry.name))
      .map((entry) => {
        const fullPath = join(dir, entry.name);
        let size = 0;
        try {
          size = entry.isFile() ? statSync(fullPath).size : 0;
        } catch {
          // arquivo sumiu entre readdir e stat
        }
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
          size,
        };
      });
    return entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  }

  async read(workspaceId: string, path: string): Promise<{ path: string; content: string; truncated: boolean }> {
    const file = await this.resolveSafe(workspaceId, path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`Arquivo nao encontrado: ${path}`);
    }
    const size = statSync(file).size;
    const content = readFileSync(file, 'utf8');
    return {
      path: file,
      content: content.slice(0, MAX_READ_BYTES),
      truncated: size > MAX_READ_BYTES,
    };
  }

  /**
   * Busca por conteudo dentro dos arquivos do workspace (nome ou texto).
   * Cap de 50 resultados; ignora pastas pesadas (.git, node_modules...).
   */
  async search(
    workspaceId: string,
    query: string,
    options: { byContent?: boolean; limit?: number } = {}
  ): Promise<Array<{ path: string; line?: number; preview?: string }>> {
    const root = await this.root(workspaceId);
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const limit = options.limit ?? 50;
    const results: Array<{ path: string; line?: number; preview?: string }> = [];

    const walk = (dir: string) => {
      if (results.length >= limit) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= limit) return;
        if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!options.byContent && entry.name.toLowerCase().includes(needle)) {
          results.push({ path: fullPath });
          continue;
        }
        if (options.byContent) {
          try {
            if (statSync(fullPath).size > 256 * 1024) continue;
            const content = readFileSync(fullPath, 'utf8');
            if (content.includes('\0')) continue; // binario
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < limit; i += 1) {
              if (lines[i].toLowerCase().includes(needle)) {
                results.push({ path: fullPath, line: i + 1, preview: lines[i].trim().slice(0, 120) });
              }
            }
          } catch {
            // arquivo ilegivel e ignorado
          }
        }
      }
    };

    walk(root);
    return results;
  }

  async writeBinary(workspaceId: string, path: string, data: Uint8Array): Promise<{ path: string; written: number }> {
    const file = await this.resolveSafe(workspaceId, path);
    const { writeFileSync: writeBytes, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(file), { recursive: true });
    writeBytes(file, data);
    return { path: file, written: data.length };
  }

  async readBinary(workspaceId: string, path: string): Promise<{ data: Uint8Array; contentType: string }> {
    const file = await this.resolveSafe(workspaceId, path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`Arquivo nao encontrado: ${path}`);
    }
    const { readFileSync: readBytes } = await import('node:fs');
    const ext = file.split('.').at(-1)?.toLowerCase() ?? '';
    const contentType =
      { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] ??
      'application/octet-stream';
    return { data: readBytes(file), contentType };
  }

  async write(workspaceId: string, path: string, content: string): Promise<{ path: string; written: number }> {
    const file = await this.resolveSafe(workspaceId, path);
    writeFileSync(file, content, 'utf8');
    return { path: file, written: content.length };
  }
}

export const filesystemService = new FilesystemService();
