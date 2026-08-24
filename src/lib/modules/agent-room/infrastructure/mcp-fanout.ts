import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type McpFanoutDef = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

/**
 * Caminhos JSON de MCP com o mesmo formato ("mcpServers" map) usados por
 * Cursor, Cline, Devin e Antigravity — o mesmo conjunto que a ponte já
 * provisiona para o servidor "orkestrai" em BridgeService.provisionSkill.
 * ".mcp.json" (Claude/Kimi) fica de fora daqui: quem chama esta função já
 * escreveu esse arquivo antes, como fonte primária.
 */
const STANDARD_FANOUT_PATHS = ['.cursor/mcp.json', '.cline/mcp.json', '.devin/mcp_config.json', '.agents/mcp_config.json'] as const;

function serverEntry(def: McpFanoutDef): Record<string, unknown> {
  if (def.url) return { url: def.url };
  const entry: Record<string, unknown> = { command: def.command, args: def.args ?? [] };
  if (def.env && Object.keys(def.env).length) entry.env = def.env;
  return entry;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return {};
  }
}

async function upsertJsonMcpServer(path: string, name: string, def: McpFanoutDef): Promise<void> {
  const config = await readJson(path);
  const mcpServers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  config.mcpServers = { ...mcpServers, [name]: serverEntry(def) };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function removeJsonMcpServer(path: string, name: string): Promise<void> {
  const config = await readJson(path);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers || !(name in mcpServers)) return;
  delete mcpServers[name];
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function upsertOpenCodeMcpServer(workingDir: string, name: string, def: McpFanoutDef): Promise<void> {
  const path = resolve(workingDir, 'opencode.json');
  const config = await readJson(path);
  const mcp = (config.mcp as Record<string, unknown> | undefined) ?? {};
  const entry = def.url
    ? { type: 'remote', url: def.url, enabled: true }
    : {
        type: 'local',
        command: [def.command, ...(def.args ?? [])],
        ...(def.env && Object.keys(def.env).length ? { environment: def.env } : {}),
        enabled: true,
      };
  config.mcp = { ...mcp, [name]: entry };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function removeOpenCodeMcpServer(workingDir: string, name: string): Promise<void> {
  const path = resolve(workingDir, 'opencode.json');
  const config = await readJson(path);
  const mcp = config.mcp as Record<string, unknown> | undefined;
  if (!mcp || !(name in mcp)) return;
  delete mcp[name];
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Propaga um servidor MCP do workspace (`.mcp.json`) para os formatos nativos
 * dos outros providers com config por workspace: Cursor, Cline, Devin,
 * Antigravity e OpenCode. O Codex fica de fora de propósito — seu MCP é
 * global em `~/.codex/config.toml`, não por workspace, e propagar lá
 * vazaria o servidor para todas as outras sessões da máquina.
 */
export async function fanOutMcpServer(workingDir: string, name: string, def: McpFanoutDef): Promise<void> {
  for (const relativePath of STANDARD_FANOUT_PATHS) {
    await upsertJsonMcpServer(resolve(workingDir, relativePath), name, def);
  }
  await upsertOpenCodeMcpServer(workingDir, name, def);
}

export async function removeFannedOutMcpServer(workingDir: string, name: string): Promise<void> {
  for (const relativePath of STANDARD_FANOUT_PATHS) {
    await removeJsonMcpServer(resolve(workingDir, relativePath), name);
  }
  await removeOpenCodeMcpServer(workingDir, name);
}
