import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMacPlatform } from '$lib/components/agent-room/platform.js';

describe('isMacPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when navigator.platform mentions Mac', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(isMacPlatform()).toBe(true);
  });

  it('returns false on other platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(isMacPlatform()).toBe(false);
  });

  it('returns false when navigator is unavailable (SSR)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isMacPlatform()).toBe(false);
  });
});
