import { describe, expect, it } from 'vitest';
import { FIGMA_MCP_URL, upsertCodexMcpConfig } from '$lib/modules/agent-room/infrastructure/codex-mcp-config.js';

describe('configuracao MCP do Codex', () => {
  const windowsLaunch = {
    command: 'C:\\Program Files\\Orkestrai\\Orkestrai.exe',
    args: ['C:\\Program Files\\Orkestrai\\resources\\app\\packages\\orkestrai-cli\\bin\\orkestrai.js', 'mcp'],
    electronRuntime: true,
  };

  it('cria uma invocacao absoluta e autocontida no Windows', () => {
    const config = upsertCodexMcpConfig('', windowsLaunch);

    expect(config).toContain('command = "C:\\\\Program Files\\\\Orkestrai\\\\Orkestrai.exe"');
    expect(config).toContain('args = ["C:\\\\Program Files\\\\Orkestrai\\\\resources');
    expect(config).toContain('[mcp_servers.orkestrai.env]');
    expect(config).toContain('ELECTRON_RUN_AS_NODE = "1"');
    expect(config).toContain('[mcp_servers.figma]');
    expect(config).toContain(`url = "${FIGMA_MCP_URL}"`);
  });

  it('migra command orkestrai sem apagar secoes ou chaves do usuario', () => {
    const current = [
      '[mcp_servers.github]',
      'url = "https://example.test/mcp"',
      '',
      '[mcp_servers.orkestrai]',
      'command = "orkestrai"',
      'args = ["mcp"]',
      'global = "windsurf"',
      '',
      '[features]',
      'js_repl = false',
      '',
    ].join('\n');

    const config = upsertCodexMcpConfig(current, windowsLaunch);

    expect(config).not.toContain('command = "orkestrai"');
    expect(config).toContain('global = "windsurf"');
    expect(config).toContain('[mcp_servers.github]');
    expect(config).toContain('[features]\njs_repl = false');
    expect(config.match(/\[mcp_servers\.orkestrai\]/g)).toHaveLength(1);
  });

  it('atualiza configuracoes reparadas sem duplicar a secao de ambiente', () => {
    const first = upsertCodexMcpConfig('', windowsLaunch);
    const second = upsertCodexMcpConfig(first, { ...windowsLaunch, command: 'D:\\Orkestrai.exe' });

    expect(second).toContain('command = "D:\\\\Orkestrai.exe"');
    expect(second.match(/\[mcp_servers\.orkestrai\.env\]/g)).toHaveLength(1);
    expect(second.match(/ELECTRON_RUN_AS_NODE/g)).toHaveLength(1);
    expect(second.match(/\[mcp_servers\.figma\]/g)).toHaveLength(1);
  });
});
