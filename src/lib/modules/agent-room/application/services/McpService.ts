import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

export type McpServerDef = {
  name: string;
  command: string;
  args: string[];
  /** true = provisionado pela ponte (recriado automaticamente). */
  builtin: boolean;
};

/**
 * Servidores MCP do workspace: o `.mcp.json` na raiz do projeto (lido por
 * Claude Code, Kimi etc.). Sempre MERGE — o usuario pode ter outros
 * servidores configurados a mao.
 */
export class McpService {
  private async mcpPath(workspaceId: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return resolve(workspace.workingDir, '.mcp.json');
  }

  private async readConfig(workspaceId: string): Promise<{ mcpServers: Record<string, { command?: string; args?: string[] }> } & Record<string, unknown>> {
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
      builtin: name === 'orkestrai',
    }));
  }

  async add(workspaceId: string, input: { name: string; command: string; args?: string | string[] }): Promise<McpServerDef[]> {
    const name = input.name.trim();
    if (!name) throw new Error('Informe o nome do servidor.');
    if (!/^[a-z0-9-_]+$/i.test(name)) throw new Error('Nome so com letras, numeros, - e _.');
    const command = input.command.trim();
    if (!command) throw new Error('Informe o comando (ex.: npx, node, uvx).');
    const args = Array.isArray(input.args)
      ? input.args.map(String)
      : String(input.args ?? '')
          .split(' ')
          .map((part) => part.trim())
          .filter(Boolean);
    const config = await this.readConfig(workspaceId);
    config.mcpServers[name] = { command, args };
    writeFileSync(await this.mcpPath(workspaceId), `${JSON.stringify(config, null, 2)}\n`);
    return this.list(workspaceId);
  }

  async remove(workspaceId: string, name: string): Promise<McpServerDef[]> {
    const config = await this.readConfig(workspaceId);
    if (!(name in config.mcpServers)) throw new Error(`Servidor "${name}" nao encontrado.`);
    delete config.mcpServers[name];
    writeFileSync(await this.mcpPath(workspaceId), `${JSON.stringify(config, null, 2)}\n`);
    return this.list(workspaceId);
  }
}

export const mcpService = new McpService();
