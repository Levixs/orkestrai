import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PORTAL_PARTITION,
  isAllowedPortalUrl,
  portalWindowOpenResponse,
} = require('../../electron/portal-policy.cjs') as {
  PORTAL_PARTITION: string;
  isAllowedPortalUrl: (url: string) => boolean;
  portalWindowOpenResponse: (url: string, title?: string) => Record<string, unknown>;
};

describe('Electron Portal popup policy', () => {
  it('allows web popups and blocks privileged protocols', () => {
    expect(isAllowedPortalUrl('https://example.com/login')).toBe(true);
    expect(isAllowedPortalUrl('http://localhost:5173')).toBe(true);
    expect(isAllowedPortalUrl('about:blank')).toBe(true);
    expect(isAllowedPortalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedPortalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedPortalUrl('data:text/html,hello')).toBe(false);
  });

  it('keeps popup windows in the persistent sandboxed Portal session', () => {
    const response = portalWindowOpenResponse('https://example.com/auth', 'Portal') as {
      action: string;
      overrideBrowserWindowOptions: { title: string; webPreferences: Record<string, unknown> };
    };
    expect(response.action).toBe('allow');
    expect(response.overrideBrowserWindowOptions.title).toBe('Portal');
    expect(response.overrideBrowserWindowOptions.webPreferences).toMatchObject({
      partition: PORTAL_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it('denies invalid popup destinations without creating a window', () => {
    expect(portalWindowOpenResponse('orkestrai://join/secret')).toEqual({ action: 'deny' });
  });
});
