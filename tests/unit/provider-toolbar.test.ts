import { describe, expect, it } from 'vitest';
import {
  MAX_PINNED_AGENT_PROVIDERS,
  parsePinnedAgentProviders,
  setAgentProviderPinned,
} from '$lib/components/agent-room/provider-toolbar.js';

describe('provider toolbar pins', () => {
  it('parses, deduplicates and bounds persisted provider ids', () => {
    expect(parsePinnedAgentProviders('[" claude ","codex","claude","kimi","opencode","cursor"]')).toEqual([
      'claude',
      'codex',
      'kimi',
      'opencode',
    ]);
    expect(parsePinnedAgentProviders('invalid-json')).toEqual([]);
    expect(parsePinnedAgentProviders({})).toEqual([]);
    expect(MAX_PINNED_AGENT_PROVIDERS).toBe(4);
  });

  it('pins and unpins while preserving the selected order', () => {
    expect(setAgentProviderPinned(['claude'], 'codex', true)).toEqual({
      ids: ['claude', 'codex'],
      limitReached: false,
    });
    expect(setAgentProviderPinned(['claude', 'codex'], 'claude', false)).toEqual({
      ids: ['codex'],
      limitReached: false,
    });
  });

  it('refuses a fifth pinned provider without changing the preference', () => {
    const current = ['claude', 'codex', 'kimi', 'opencode'];
    expect(setAgentProviderPinned(current, 'cursor', true)).toEqual({ ids: current, limitReached: true });
  });
});
