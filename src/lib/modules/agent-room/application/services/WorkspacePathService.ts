import { access, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Workspace } from '../../domain/types.js';

type WorkspacePathRoot = { alias: string | null; path: string };

function isContained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function portablePath(path: string): string {
  return path.split(sep).join('/');
}

/** Resolves agent paths only inside roots explicitly approved by the owner. */
export class WorkspacePathService {
  async resolveExisting(workspace: Workspace, requestedPath: string): Promise<string> {
    const { root, remainder } = await this.requestedRoot(workspace, requestedPath);
    const candidate = await realpath(resolve(root.path, remainder));
    if (!isContained(root.path, candidate)) throw new Error('The path escapes its registered workspace repository.');
    return candidate;
  }

  async resolveWritable(workspace: Workspace, requestedPath: string): Promise<string> {
    const { root, remainder } = await this.requestedRoot(workspace, requestedPath);
    const candidate = resolve(root.path, remainder);
    if (!isContained(root.path, candidate)) throw new Error('The path escapes its registered workspace repository.');

    // Resolve the closest existing ancestor so an intermediate symlink cannot
    // redirect a new export outside the approved repository.
    let ancestor = candidate;
    while (ancestor !== root.path) {
      try {
        await access(ancestor);
        break;
      } catch {
        ancestor = dirname(ancestor);
      }
    }
    const canonicalAncestor = await realpath(ancestor);
    if (!isContained(root.path, canonicalAncestor)) throw new Error('The path escapes its registered workspace repository.');
    return candidate;
  }

  async reference(workspace: Workspace, absolutePath: string): Promise<string | null> {
    const candidate = await realpath(resolve(absolutePath));
    const roots = await this.roots(workspace);
    roots.sort((left, right) => right.path.length - left.path.length);
    for (const root of roots) {
      if (!isContained(root.path, candidate)) continue;
      const path = portablePath(relative(root.path, candidate));
      return root.alias ? `@${root.alias}${path ? `/${path}` : ''}` : path || '.';
    }
    return null;
  }

  async assertRegistered(workspace: Workspace, absolutePath: string): Promise<void> {
    if (await this.reference(workspace, absolutePath)) return;
    throw new Error('The linked collection is outside the workspace repositories.');
  }

  private async requestedRoot(workspace: Workspace, requestedPath: string): Promise<{ root: WorkspacePathRoot; remainder: string }> {
    const input = requestedPath.trim();
    if (!input) throw new Error('The repository path is required.');
    if (isAbsolute(input)) throw new Error('Use a workspace-relative path or a registered @alias path.');

    const roots = await this.roots(workspace);
    if (!input.startsWith('@')) return { root: roots.find((root) => root.alias === null)!, remainder: input };

    const match = input.match(/^@([a-z0-9][a-z0-9_-]*)(?:[\\/](.*))?$/i);
    if (!match) throw new Error('Invalid repository alias path. Use @alias/path.');
    const alias = match[1].toLowerCase();
    const root = roots.find((candidate) => candidate.alias === alias);
    if (!root) throw new Error(`Repository alias @${alias} is not registered in this workspace.`);
    return { root, remainder: match[2] ?? '.' };
  }

  private async roots(workspace: Workspace): Promise<WorkspacePathRoot[]> {
    const roots: WorkspacePathRoot[] = [{ alias: null, path: await realpath(resolve(workspace.workingDir)) }];
    for (const repository of workspace.repositoryRoots ?? []) {
      const path = await realpath(resolve(repository.path));
      if (!(await stat(path)).isDirectory()) continue;
      roots.push({ alias: repository.alias.toLowerCase(), path });
    }
    return roots;
  }
}

export const workspacePathService = new WorkspacePathService();
