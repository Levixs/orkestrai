import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('default locale', () => {
  it('uses English before persisted settings are available', () => {
    const project = JSON.parse(readFileSync('project.inlang/settings.json', 'utf8')) as { baseLocale: string };
    const splash = readFileSync('electron/splash.html', 'utf8');

    expect(project.baseLocale).toBe('en');
    expect(splash).toContain('<html lang="en">');
    expect(splash).toContain('Orchestrate everything. Achieve anything.');
    expect(splash).toContain('aria-label="Loading..."');
    expect(splash).not.toMatch(/Orquestre|Carregando/);
  });
});
