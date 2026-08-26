import { describe, expect, it } from 'vitest';
import { updateOrkestraiGitExclude } from '$lib/modules/agent-room/infrastructure/bridge-git-exclude.js';

describe('bridge git excludes', () => {
  it('unhides user-owned files from the exact legacy block', () => {
    const current = [
      '# local excludes',
      '.orkestrai/',
      '.claude/skills/orkestrai/',
      '.cline/skills/orkestrai/',
      '.devin/skills/orkestrai/',
      '.agents/skills/orkestrai/',
      '.mcp.json',
      '.cursor/mcp.json',
      '.cline/mcp.json',
      '.devin/mcp_config.json',
      '.agents/mcp_config.json',
      'opencode.json',
      'AGENTS.md',
      '',
    ].join('\r\n');

    const next = updateOrkestraiGitExclude(current);

    expect(next).toContain('.orkestrai/');
    expect(next).not.toContain('.mcp.json');
    expect(next).not.toContain('AGENTS.md');
    expect(next).toContain('\r\n');
  });

  it('preserves independently maintained excludes outside the legacy block', () => {
    const current = '# mine\nAGENTS.md\n';
    const next = updateOrkestraiGitExclude(current);
    expect(next).toContain('# mine\nAGENTS.md\n');
  });
});
