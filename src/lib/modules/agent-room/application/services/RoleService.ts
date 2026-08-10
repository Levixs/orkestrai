import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';
import { builtinRoleCatalog } from '../catalogs/BuiltinRoleCatalog.js';
import { taskBoardService } from './TaskBoardService.js';

export type AgentRole = {
  slug: string;
  name: string;
  color: string;
  prompt: string;
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'role'
  );
}

/**
 * Responsabilidades (roles) de agentes: nome, cor e conjunto de instruções.
 * Portateis: ficam em `.orkestrai/roles/<slug>/role.json` (+ AGENTS.md) no
 * working_dir do workspace, entao viajam com o repositório.
 *
 * Aplicacao: quando um terminal com role inicia uma sessão PTY, o prompt da
 * role e injetado como primeira mensagem ao agente (funciona em qualquer TUI).
 */
export class RoleService {
  catalog(locale: unknown) {
    return builtinRoleCatalog(locale);
  }

  async installBuiltin(workspaceId: string, roleId: string, locale: unknown): Promise<AgentRole> {
    const template = builtinRoleCatalog(locale).find((role) => role.id === roleId);
    if (!template) throw new Error('Responsabilidade pronta não encontrada.');
    return this.save(workspaceId, template);
  }

  private async rolesDir(workspaceId: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace não encontrado.');
    const current = resolve(workspace.workingDir, '.orkestrai', 'roles');
    // Legado: workspaces criados na era .pantheon/ continuam legiveis.
    if (!existsSync(current)) {
      const legacy = resolve(workspace.workingDir, '.pantheon', 'roles');
      if (existsSync(legacy)) return legacy;
    }
    return current;
  }

  async list(workspaceId: string): Promise<AgentRole[]> {
    const dir = await this.rolesDir(workspaceId);
    if (!existsSync(dir)) return [];
    const roles: AgentRole[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = resolve(dir, entry.name, 'role.json');
      if (!existsSync(file)) continue;
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        roles.push({
          slug: entry.name,
          name: String(raw.name ?? entry.name),
          color: String(raw.color ?? '#7C4DFF'),
          prompt: String(raw.prompt ?? ''),
        });
      } catch {
        // role.json inválido e ignorado
      }
    }
    return roles.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(workspaceId: string, nameOrSlug: string): Promise<AgentRole | null> {
    const normalized = nameOrSlug.toLowerCase();
    const roles = await this.list(workspaceId);
    return roles.find((role) => role.slug === normalized || role.name.toLowerCase() === normalized) ?? null;
  }

  async save(workspaceId: string, input: { name: string; color?: string; prompt: string }): Promise<AgentRole> {
    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome da responsabilidade.');
    const slug = slugify(name);
    const role: AgentRole = {
      slug,
      name,
      color: input.color ?? '#7C4DFF',
      prompt: input.prompt,
    };
    const dir = resolve(await this.rolesDir(workspaceId), slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'role.json'), JSON.stringify(role, null, 2));
    if (role.prompt.trim()) {
      writeFileSync(resolve(dir, 'AGENTS.md'), `${role.prompt.trim()}\n`);
    }
    return role;
  }

  async edit(workspaceId: string, nameOrSlug: string, oldText: string, newText: string): Promise<AgentRole> {
    const role = await this.requireRole(workspaceId, nameOrSlug);
    if (!role.prompt.includes(oldText)) {
      throw new Error('Trecho antigo não encontrado no prompt da responsabilidade.');
    }
    return this.save(workspaceId, {
      name: role.name,
      color: role.color,
      prompt: role.prompt.replace(oldText, newText),
    });
  }

  async remove(workspaceId: string, nameOrSlug: string): Promise<boolean> {
    const role = await this.get(workspaceId, nameOrSlug);
    if (!role) return false;
    rmSync(resolve(await this.rolesDir(workspaceId), role.slug), { recursive: true, force: true });
    return true;
  }

  /**
   * Descobre roles de um diretório (ex.: repo de um colega) e importa para a
   * biblioteca do workspace. Retorna quantas foram importadas.
   */
  async discover(workspaceId: string, fromDir?: string): Promise<{ imported: number; roles: AgentRole[] }> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace não encontrado.');
    const source = resolve(fromDir ?? workspace.workingDir, '.orkestrai', 'roles');
    if (!existsSync(source)) return { imported: 0, roles: [] };

    const found: AgentRole[] = [];
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = resolve(source, entry.name, 'role.json');
      if (!existsSync(file)) continue;
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        found.push({
          slug: entry.name,
          name: String(raw.name ?? entry.name),
          color: String(raw.color ?? '#7C4DFF'),
          prompt: String(raw.prompt ?? ''),
        });
      } catch {
        // ignora inválido
      }
    }

    const existing = new Set((await this.list(workspaceId)).map((role) => role.slug));
    let imported = 0;
    for (const role of found) {
      if (existing.has(role.slug)) continue;
      await this.save(workspaceId, role);
      imported += 1;
    }
    return { imported, roles: found };
  }

  /**
   * Injeta o prompt da role na sessão PTY do terminal (primeira mensagem).
   * Chamado pela UI quando um terminal com role cria sua sessão.
   */
  async applyToTerminal(workspaceId: string, nodeId: string): Promise<{ applied: boolean; tasksDelivered: number }> {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'terminal') {
      throw new Error('Terminal não encontrado neste workspace.');
    }
    const payload = node.payload as { role?: string | null; sessionId?: string; maestro?: boolean };
    if (!payload.role && !payload.maestro) return { applied: false, tasksDelivered: 0 };
    if (!payload.sessionId) throw new Error('O terminal ainda não tem sessão PTY.');

    const session = ptySessionManager.get(payload.sessionId);
    if (!session || session.exited) throw new Error('Sessão PTY não está ativa.');
    await ptySessionManager.waitUntilIdle(payload.sessionId);

    let applied = false;
    if (payload.role) {
      const role = await this.get(workspaceId, payload.role);
      if (!role) throw new Error(`Responsabilidade "${payload.role}" não encontrada.`);
      await ptySessionManager.writeWithSubmit(payload.sessionId, `[responsabilidade: ${role.name}] ${role.prompt.trim()}`);
      applied = true;
    }

    let tasksDelivered = 0;
    if (payload.maestro) {
      const tasks = (await taskBoardService.list(workspaceId))
        .filter((task) => !task.assigneeNodeId && task.status !== 'done');
      if (tasks.length) {
        const briefs = tasks.map((task) => {
          const images = task.images.length ? task.images.map((image) => `- ${image}`).join('\n') : '(nenhuma)';
          return [
            `#${task.id.slice(0, 8)} — ${task.title}`,
            `Descrição: ${task.description?.trim() || '(sem descrição)'}`,
            `Imagens: ${images}`,
            `Nota vinculada: ${task.noteTitle ? `${task.noteTitle} (${task.noteId})` : '(nenhuma)'}`,
          ].join('\n');
        }).join('\n\n');
        await ptySessionManager.writeWithSubmit(
          payload.sessionId,
          `[fila inicial do Kanban] Existem ${tasks.length} tarefas sem responsável. Leia todos os dados abaixo e distribua cada trabalho com orkestrai task assign <id> "<Agente>" antes de enviar mensagens diretas.\n\n${briefs}`
        );
        tasksDelivered = tasks.length;
      }
    }
    return { applied, tasksDelivered };
  }

  private async requireRole(workspaceId: string, nameOrSlug: string): Promise<AgentRole> {
    const role = await this.get(workspaceId, nameOrSlug);
    if (!role) throw new Error(`Responsabilidade "${nameOrSlug}" não encontrada.`);
    return role;
  }
}

export const roleService = new RoleService();
