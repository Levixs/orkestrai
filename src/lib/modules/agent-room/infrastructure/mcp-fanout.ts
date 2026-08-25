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
const STANDARD_FANOUT_PATHS = [
  '.cursor/mcp.json',
  '.cline/mcp.json',
  '.devin/mcp_config.json',
  '.agents/mcp_config.json',
] as const;

function serverEntry(def: McpFanoutDef): Record<string, unknown> {
  if (def.url) return { url: def.url };
  const entry: Record<string, unknown> = {
    command: def.command,
    args: def.args ?? [],
  };
  if (def.env && Object.keys(def.env).length) entry.env = def.env;
  return entry;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(contents);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected a JSON object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid MCP configuration at ${path}. Fix the JSON before managing workspace MCP servers.`, {
      cause: error,
    });
  }
}

function upsertJsonMcpServer(config: Record<string, unknown>, name: string, def: McpFanoutDef): void {
  const mcpServers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  config.mcpServers = { ...mcpServers, [name]: serverEntry(def) };
}

function removeJsonMcpServer(config: Record<string, unknown>, name: string): boolean {
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers || !(name in mcpServers)) return false;
  delete mcpServers[name];
  return true;
}

function upsertOpenCodeMcpServer(config: Record<string, unknown>, name: string, def: McpFanoutDef): void {
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
}

function removeOpenCodeMcpServer(config: Record<string, unknown>, name: string): boolean {
  const mcp = config.mcp as Record<string, unknown> | undefined;
  if (!mcp || !(name in mcp)) return false;
  delete mcp[name];
  return true;
}

async function writeJson(path: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function loadFanoutConfigs(workingDir: string) {
  const paths = [
    ...STANDARD_FANOUT_PATHS.map((relativePath) => resolve(workingDir, relativePath)),
    resolve(workingDir, 'opencode.json'),
  ];
  const configs = await Promise.all(paths.map(async (path) => ({ path, config: await readJson(path) })));
  return { standard: configs.slice(0, -1), openCode: configs.at(-1)! };
}

/**
 * Propaga um servidor MCP do workspace (`.mcp.json`) para os formatos nativos
 * dos outros providers com config por workspace: Cursor, Cline, Devin,
 * Antigravity e OpenCode. O Codex fica de fora de propósito — seu MCP é
 * global em `~/.codex/config.toml`, não por workspace, e propagar lá
 * vazaria o servidor para todas as outras sessões da máquina.
 */
export async function fanOutMcpServer(workingDir: string, name: string, def: McpFanoutDef): Promise<void> {
  // Parse every target before writing any of them. A malformed provider file
  // must never be replaced with a fresh config or leave a partial fan-out.
  const { standard, openCode } = await loadFanoutConfigs(workingDir);
  for (const target of standard) upsertJsonMcpServer(target.config, name, def);
  upsertOpenCodeMcpServer(openCode.config, name, def);
  await Promise.all([...standard, openCode].map((target) => writeJson(target.path, target.config)));
}

export async function removeFannedOutMcpServer(workingDir: string, name: string): Promise<void> {
  const { standard, openCode } = await loadFanoutConfigs(workingDir);
  const changed = standard.filter((target) => removeJsonMcpServer(target.config, name));
  if (removeOpenCodeMcpServer(openCode.config, name)) changed.push(openCode);
  await Promise.all(changed.map((target) => writeJson(target.path, target.config)));
}
