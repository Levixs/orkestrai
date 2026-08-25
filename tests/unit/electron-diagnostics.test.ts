import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createDiagnosticsLogger, redactDiagnosticText } = require('../../electron/diagnostics.cjs') as {
  createDiagnosticsLogger: (directory: string, options?: { maxBytes?: number; backups?: number }) => {
    filePath: string;
    write: (level: string, scope: string, ...values: unknown[]) => void;
  };
  redactDiagnosticText: (value: unknown) => string;
};

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Electron diagnostics', () => {
  it('redacts credentials before they reach disk', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orkestrai-diagnostics-'));
    directories.push(directory);
    const logger = createDiagnosticsLogger(directory);

    logger.write('error', 'renderer', 'Authorization: Bearer secret-token', {
      password: 'hunter2',
      api_key: 'sk-abcdefghijklmnopqrstuvwxyz123456',
    });

    const contents = fs.readFileSync(logger.filePath, 'utf8');
    expect(contents).toContain('[ERROR] [renderer]');
    expect(contents).not.toContain('secret-token');
    expect(contents).not.toContain('hunter2');
    expect(contents).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(contents.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('rotates bounded log files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orkestrai-diagnostics-'));
    directories.push(directory);
    const logger = createDiagnosticsLogger(directory, { maxBytes: 1_024, backups: 2 });

    for (let index = 0; index < 20; index += 1) logger.write('error', 'server', `failure-${index}-${'x'.repeat(120)}`);

    expect(fs.existsSync(logger.filePath)).toBe(true);
    expect(fs.existsSync(`${logger.filePath}.1`)).toBe(true);
    expect(fs.statSync(logger.filePath).size).toBeLessThanOrEqual(1_200);
  });

  it('redacts common standalone provider tokens', () => {
    expect(redactDiagnosticText('github_pat_abcdefghijklmnopqrstuvwxyz1234567890')).toBe('[REDACTED]');
    expect(redactDiagnosticText('APP_KEY=base64:private-value')).not.toContain('private-value');
    expect(redactDiagnosticText('https://user:pass@example.com/callback?code=oauth-code&state=nonce')).toBe(
      'https://[REDACTED]@example.com/callback?code=[REDACTED]&state=[REDACTED]'
    );
  });
});
