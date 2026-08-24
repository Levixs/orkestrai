import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { fanOutMcpServer, removeFannedOutMcpServer } from '../../infrastructure/mcp-fanout.js';
import type { Workspace } from '../../domain/types.js';

export type McpServerDef = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** URL de servidor remoto (streamable-http) — sem comando local. */
  url?: string;
  /** true = provisionado pela ponte (recriado automaticamente). */
  builtin: boolean;
};

/**
 * Servidores MCP do workspace: o `.mcp.json` na raiz do projeto (lido por
 * Claude Code, Kimi etc.). Sempre MERGE — o usuario pode ter outros
 * servidores configurados a mao.
 */
export class McpService {
  private async getWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return workspace;
  }

  private async mcpPath(workspaceId: string): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);
    return resolve(workspace.workingDir, '.mcp.json');
  }

  private async readConfig(workspaceId: string): Promise<{
    mcpServers: Record<string, { command?: string; args?: string[]; env?: Record<string, string>; url?: string; type?: string }>;
  } & Record<string, unknown>> {
    const path = await this.mcpPath(workspaceId);
    if (!existsSync(path)) return { mcpServers: {} };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      return { ...parsed, mcpServers: parsed.mcpServers ?? {} };
    } catch {
      throw new Error('.mcp.json invalido — corrija o JSON na raiz do projeto.');
    }
  }

  async list(workspaceId: string): Promise<McpServerDef[]> {
    const config = await this.readConfig(workspaceId);
    return Object.entries(config.mcpServers).map(([name, def]) => ({
      name,
      command: String(def.command ?? ''),
      args: Array.isArray(def.args) ? def.args.map(String) : [],
      env: (def.env ?? {}) as Record<string, string>,
      url: typeof def.url === 'string' ? def.url : undefined,
      builtin: name === 'orkestrai' || name === 'figma',
    }));
  }

  async add(
    workspaceId: string,
    input: { name: string; command?: string; args?: string | string[]; env?: Record<string, string>; url?: string }
  ): Promise<McpServerDef[]> {
    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome do servidor.');
    if (!/^[a-z0-9-_]+$/i.test(name)) throw new Error('Nome so com letras, numeros, - e _.');
    if (name === 'orkestrai' || name === 'figma') throw new Error(`O nome "${name}" e reservado para o servidor do Orkestrai.`);
    const workspace = await this.getWorkspace(workspaceId);
    const config = await this.readConfig(workspaceId);
    const url = input.url?.trim();
    let command = '';
    let args: string[] = [];
    let env: Record<string, string> = {};
    if (url) {
      // Servidor remoto (streamable-http): so a URL, sem comando local.
      config.mcpServers[name] = { type: 'http', url } as never;
    } else {
      command = (input.command ?? '').trim();
      if (!command) throw new Error('Informe o comando (ex.: npx, node, uvx) ou uma URL.');
      args = Array.isArray(input.args)
        ? input.args.map(String)
        : String(input.args ?? '')
            .split(' ')
            .map((part) => part.trim())
            .filter(Boolean);
      env = Object.fromEntries(Object.entries(input.env ?? {}).filter(([, value]) => String(value).trim() !== ''));
      config.mcpServers[name] = Object.keys(env).length ? { command, args, env } : { command, args };
    }
    writeFileSync(resolve(workspace.workingDir, '.mcp.json'), `${JSON.stringify(config, null, 2)}\n`);
    // .mcp.json so e lido por Claude/Kimi — propaga para os outros formatos
    // nativos (Cursor, Cline, Devin, Antigravity, OpenCode) igual a ponte faz
    // para o servidor "orkestrai". Falha de escrita aqui nao bloqueia o add.
    await fanOutMcpServer(workspace.workingDir, name, { command, args, env, url }).catch(() => undefined);
    return this.list(workspaceId);
  }

  async remove(workspaceId: string, name: string): Promise<McpServerDef[]> {
    if (name === 'orkestrai' || name === 'figma') throw new Error(`Servidor "${name}" e gerenciado pelo Orkestrai.`);
    const workspace = await this.getWorkspace(workspaceId);
    const config = await this.readConfig(workspaceId);
    if (!(name in config.mcpServers)) throw new Error(`Servidor "${name}" nao encontrado.`);
    delete config.mcpServers[name];
    writeFileSync(resolve(workspace.workingDir, '.mcp.json'), `${JSON.stringify(config, null, 2)}\n`);
    await removeFannedOutMcpServer(workspace.workingDir, name).catch(() => undefined);
    return this.list(workspaceId);
  }
}

export const mcpService = new McpService();
