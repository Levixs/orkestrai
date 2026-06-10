import { spawnSync } from 'node:child_process';
import { json, type RequestHandler } from '@sveltejs/kit';

function hasCommand(command: string) {
  const result = spawnSync(command, ['--version'], { shell: false, encoding: 'utf8' });
  return {
    installed: !result.error && result.status === 0,
    detail: result.error?.message ?? result.stdout.trim() ?? result.stderr.trim(),
  };
}

export const GET: RequestHandler = async () => {
  return json({
    data: {
      codex: hasCommand('codex'),
      claude: hasCommand('claude'),
    },
  });
};
