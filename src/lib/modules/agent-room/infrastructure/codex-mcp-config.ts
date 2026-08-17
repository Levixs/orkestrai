export type CodexMcpLaunch = {
  command: string;
  args: string[];
  electronRuntime: boolean;
};

export const FIGMA_MCP_URL = 'https://mcp.figma.com/mcp';

type SectionRange = { bodyStart: number; bodyEnd: number };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionRange(source: string, name: string): SectionRange | null {
  const header = new RegExp(`^\\[${escapeRegExp(name)}\\][ \\t]*\\r?$`, 'm').exec(source);
  if (!header) return null;
  const lineEnd = source.indexOf('\n', header.index + header[0].length);
  const bodyStart = lineEnd === -1 ? source.length : lineEnd + 1;
  const nextHeader = /^\[[^\]\r\n]+\][ \t]*\r?$/gm;
  nextHeader.lastIndex = bodyStart;
  const next = nextHeader.exec(source);
  return { bodyStart, bodyEnd: next?.index ?? source.length };
}

function replaceSectionKeys(source: string, name: string, entries: Record<string, string>): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const range = sectionRange(source, name);
  const entryNames = new Set(Object.keys(entries));
  const desired = Object.entries(entries).map(([key, value]) => `${key} = ${value}`);

  if (!range) {
    const prefix = source.trimEnd();
    return `${prefix}${prefix ? `${eol}${eol}` : ''}[${name}]${eol}${desired.join(eol)}${eol}`;
  }

  const body = source.slice(range.bodyStart, range.bodyEnd);
  const preserved = body
    .split(/\r?\n/)
    .filter((line) => {
      const key = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
      return !key || !entryNames.has(key);
    })
    .join(eol)
    .replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
  const replacement = `${desired.join(eol)}${preserved ? `${eol}${preserved}` : ''}${eol}${eol}`;
  return `${source.slice(0, range.bodyStart)}${replacement}${source.slice(range.bodyEnd)}`;
}

/** Atualiza somente as secoes do Orkestrai e preserva o restante do config.toml. */
export function upsertCodexMcpConfig(current: string, launch: CodexMcpLaunch): string {
  const args = launch.args.map((value) => JSON.stringify(value)).join(', ');
  let next = replaceSectionKeys(current, 'mcp_servers.orkestrai', {
    command: JSON.stringify(launch.command),
    args: `[${args}]`,
  });
  if (launch.electronRuntime) {
    next = replaceSectionKeys(next, 'mcp_servers.orkestrai.env', {
      ELECTRON_RUN_AS_NODE: '"1"',
    });
  }
  next = replaceSectionKeys(next, 'mcp_servers.figma', {
    url: JSON.stringify(FIGMA_MCP_URL),
  });
  return next;
}
