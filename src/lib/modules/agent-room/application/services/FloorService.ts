import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import type { Floor, HookCommand, Workspace, WorkspaceHooks } from '../../domain/types.js';
import { AgentFloor } from '../../domain/models/AgentFloor.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 60_000;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapFloor(model: AgentFloor): Floor {
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    name: model.getAttribute('name'),
    branch: model.getAttribute('branch'),
    path: model.getAttribute('path'),
    status: model.getAttribute('status'),
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'andar'
  );
}

/**
 * Andares via git worktree: cada andar e um checkout isolado do repo do
 * workspace em `.orkestrai/floors/<slug>` com sua propria branch.
 * Aterrissagem = merge da branch do andar de volta no checkout principal.
 */
/** Avisa o canvas para recarregar o workspace (via broadcast WS global). */
function notifyWorkspaceChanged(workspaceId: string) {
  const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  broadcast?.({ type: 'workspaceChanged', workspaceId });
}

export class FloorService {
  private async workspace(workspaceId: string): Promise<Workspace> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return workspace;
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  }

  private async assertRepo(root: string) {
    try {
      await this.git(root, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      throw new Error('O diretorio do workspace nao e um repositorio git.');
    }
    // Os worktrees vivem em .orkestrai/floors dentro do repo; exclui localmente
    // (info/exclude) para o andar nao sujar o status do checkout principal.
    try {
      const { appendFileSync, existsSync, readFileSync } = await import('node:fs');
      const excludePath = resolve(root, '.git', 'info', 'exclude');
      const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
      if (!current.includes('.orkestrai')) {
        appendFileSync(excludePath, '\n.orkestrai/\n');
      }
    } catch {
      // exclude e conveniencia; nao bloqueia
    }
  }

  async list(workspaceId: string): Promise<Floor[]> {
    const rows = await AgentFloor.query()
      .where('workspace_id', workspaceId)
      .where('status', 'active')
      .orderBy('created_at', 'asc')
      .get();
    return rows.map(mapFloor);
  }

  async get(id: string): Promise<Floor | null> {
    const model = await AgentFloor.find(id);
    return model ? mapFloor(model) : null;
  }

  /**
   * Cria um andar: branch nova (ou existente) + worktree + registro.
   * cloneLayout duplica os nos do terreo para o andar.
   */
  async create(
    workspaceId: string,
    input: { name: string; branch?: string; existingBranch?: boolean; cloneLayout?: boolean }
  ): Promise<Floor> {
    const workspace = await this.workspace(workspaceId);
    await this.assertRepo(workspace.workingDir);

    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome do andar.');
    const branch = input.branch?.trim() || `orkestrai/${slugify(name)}`;
    const floorPath = resolve(workspace.workingDir, '.orkestrai', 'floors', slugify(name));

    if (existsSync(floorPath)) throw new Error(`Ja existe um andar em ${floorPath}.`);

    const args = input.existingBranch
      ? ['worktree', 'add', floorPath, branch]
      : ['worktree', 'add', '-b', branch, floorPath];
    await this.git(workspace.workingDir, args);

    const model = await AgentFloor.create({
      id: uuidv7(),
      workspace_id: workspaceId,
      name,
      branch,
      path: floorPath,
      status: 'active',
    });
    const floor = mapFloor(model);

    if (input.cloneLayout) {
      const groundNodes = await workspaceRepository.listNodes(workspaceId, null);
      for (const node of groundNodes) {
        await workspaceRepository.createNode({
          workspaceId,
          type: node.type,
          title: node.title,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          zIndex: node.zIndex,
          payload: node.payload,
          floorId: floor.id,
        });
      }
    }

    const hooks = workspace.hooks;
    if (hooks.autoRunSetup && hooks.setup?.length) {
      await this.runHooks(floor, workspace, hooks.setup).catch(() => {});
    }

    notifyWorkspaceChanged(workspaceId);
    return floor;
  }

  async rename(id: string, name: string): Promise<Floor> {
    const floor = await this.get(id);
    if (!floor) throw new Error('Andar nao encontrado.');
    const next = name.trim();
    if (!next) throw new Error('O nome do andar nao pode ficar vazio.');
    await AgentFloor.query().where('id', id).update({ name: next });
    return (await this.get(id))!;
  }

  /** Preview da aterrissagem: stats do diff e conflitos potenciais. */
  async landingPreview(id: string, targetBranch?: string) {
    const floor = await this.get(id);
    if (!floor) throw new Error('Andar nao encontrado.');
    const workspace = await this.workspace(floor.workspaceId);
    const target = targetBranch || (await this.currentBranch(workspace.workingDir));

    const stat = await this.git(workspace.workingDir, ['diff', '--stat', `${target}...${floor.branch}`]).catch(() => '');
    let conflicts: string[] = [];
    try {
      const mergeTree = await this.git(workspace.workingDir, ['merge-tree', '--write-tree', '--name-only', target, floor.branch]);
      const lines = mergeTree.split('\n');
      // merge-tree lista arquivos em conflito quando o merge nao e limpo
      if (!mergeTree.startsWith(lines[0]) || mergeTree.includes('\n')) {
        conflicts = lines.slice(1).filter(Boolean);
      }
    } catch {
      conflicts = [];
    }

    const dirty = (await this.git(workspace.workingDir, ['status', '--porcelain'])).trim().length > 0;

    return {
      floor: floor.name,
      from: floor.branch,
      to: target,
      stat: stat.trim(),
      conflicts,
      targetDirty: dirty,
    };
  }

  /** Aterrissa: faz merge da branch do andar na branch alvo do checkout principal. */
  async land(id: string, targetBranch?: string): Promise<{ merged: boolean; branch: string; into: string }> {
    const floor = await this.get(id);
    if (!floor) throw new Error('Andar nao encontrado.');
    const workspace = await this.workspace(floor.workspaceId);

    const dirty = (await this.git(workspace.workingDir, ['status', '--porcelain'])).trim();
    if (dirty) throw new Error('O checkout principal tem alteracoes nao commitadas. Commit ou descarte antes de aterrissar.');

    const target = targetBranch || (await this.currentBranch(workspace.workingDir));
    if (targetBranch && targetBranch !== (await this.currentBranch(workspace.workingDir))) {
      await this.git(workspace.workingDir, ['checkout', targetBranch]);
    }

    try {
      await this.git(workspace.workingDir, ['merge', '--no-ff', '--no-edit', floor.branch]);
    } catch (error) {
      // Lista os arquivos em conflito antes de abortar para o chamador
      // (humano ou agente lider) saber o que precisa de resolucao.
      const conflicted = (await this.git(workspace.workingDir, ['diff', '--name-only', '--diff-filter=U']).catch(() => ''))
        .split('\n')
        .filter(Boolean);
      await this.git(workspace.workingDir, ['merge', '--abort']).catch(() => {});
      const files = conflicted.length ? ` Arquivos em conflito: ${conflicted.join(', ')}.` : '';
      throw new Error(`Conflito ao aterrissar ${floor.branch} em ${target}.${files} Atribua a resolucao a um agente do andar ou resolva no editor/terminal.`);
    }

    await AgentFloor.query().where('id', id).update({ status: 'landed' });

    const hooks = workspace.hooks;
    if (hooks.teardown?.length) {
      await this.runHooks(floor, workspace, hooks.teardown).catch(() => {});
    }

    await this.removeWorktree(floor, false);
    notifyWorkspaceChanged(floor.workspaceId);
    return { merged: true, branch: floor.branch, into: target };
  }

  /** Exclui o andar (worktree + opcionalmente a branch). */
  async remove(id: string, deleteBranch = false): Promise<{ removed: boolean }> {
    const floor = await this.get(id);
    if (!floor) throw new Error('Andar nao encontrado.');
    const workspace = await this.workspace(floor.workspaceId);

    const hooks = workspace.hooks;
    if (hooks.teardown?.length) {
      await this.runHooks(floor, workspace, hooks.teardown).catch(() => {});
    }

    await this.removeWorktree(floor, deleteBranch);
    await AgentFloor.query().where('id', id).update({ status: 'deleted' });
    notifyWorkspaceChanged(floor.workspaceId);
    return { removed: true };
  }

  /** Executa comandos de hook no diretorio do andar com as variaveis $ORKESTRAI_*. */
  async runHooks(floor: Floor, workspace: Workspace, commands: HookCommand[]): Promise<Array<{ command: string; ok: boolean; output: string }>> {
    const env = {
      ...process.env,
      ORKESTRAI_FLOOR_NAME: floor.name,
      ORKESTRAI_BRANCH_NAME: floor.branch,
      ORKESTRAI_FLOOR_PATH: floor.path,
      ORKESTRAI_ROOT_PATH: workspace.workingDir,
      ORKESTRAI_PROJECT_NAME: workspace.name,
    };
    const results = [];
    for (const { command } of commands) {
      try {
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: floor.path,
          env,
          timeout: 120_000,
        });
        results.push({ command, ok: true, output: (stdout + stderr).trim() });
      } catch (error) {
        results.push({ command, ok: false, output: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  async hooksFor(workspaceId: string): Promise<WorkspaceHooks> {
    const workspace = await this.workspace(workspaceId);
    return workspace.hooks;
  }

  async saveHooks(workspaceId: string, hooks: WorkspaceHooks): Promise<WorkspaceHooks> {
    await this.workspace(workspaceId);
    await workspaceRepository.updateWorkspace(workspaceId, { hooks });
    return hooks;
  }

  private async currentBranch(root: string): Promise<string> {
    const branch = (await this.git(root, ['branch', '--show-current'])).trim();
    return branch || 'main';
  }

  private async removeWorktree(floor: Floor, deleteBranch: boolean) {
    const workspace = await workspaceRepository.getWorkspace(floor.workspaceId);
    if (!workspace) return;
    await this.git(workspace.workingDir, ['worktree', 'remove', '--force', floor.path]).catch(() => {});
    if (deleteBranch) {
      await this.git(workspace.workingDir, ['branch', '-D', floor.branch]).catch(() => {});
    }
  }
}

export const floorService = new FloorService();
