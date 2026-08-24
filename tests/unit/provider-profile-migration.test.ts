import { describe, expect, it } from 'vitest';
import { uniqueLegacyProfileNames } from '$lib/database/migrations/20260824151000_normalize_agent_provider_profile_names.js';

describe('provider profile name migration', () => {
  it('deduplicates case variants without colliding with existing suffixes', () => {
    const migrated = uniqueLegacyProfileNames([
      { id: '1', provider_id: 'codex', name: 'Work' },
      { id: '2', provider_id: 'codex', name: 'work' },
      { id: '3', provider_id: 'codex', name: 'work (2)' },
      { id: '4', provider_id: 'claude', name: 'work' },
    ]);

    expect(migrated).toEqual([
      { id: '1', name: 'Work', normalizedName: 'work' },
      { id: '2', name: 'work (2)', normalizedName: 'work (2)' },
      { id: '3', name: 'work (2) (2)', normalizedName: 'work (2) (2)' },
      { id: '4', name: 'work', normalizedName: 'work' },
    ]);
  });
});
