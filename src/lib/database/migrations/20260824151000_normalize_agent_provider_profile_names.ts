import { Connection, Migration } from '@beeblock/svelar/database';

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

export function uniqueLegacyProfileNames(
  profiles: Array<{ id: string; provider_id: string; name: string }>,
): Array<{ id: string; name: string; normalizedName: string }> {
  const used = new Set<string>();
  return profiles.map((profile) => {
    const providerId = String(profile.provider_id);
    const base = String(profile.name).trim() || 'Profile';
    let name = base;
    let suffix = 2;
    while (used.has(`${providerId}\u0000${normalized(name)}`)) {
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    const normalizedName = normalized(name);
    used.add(`${providerId}\u0000${normalizedName}`);
    return { id: String(profile.id), name, normalizedName };
  });
}

export default class NormalizeAgentProviderProfileNames extends Migration {
  async up() {
    await this.schema.table('agent_provider_profiles', (table) => {
      // Nullable keeps SQLite upgrades valid when profiles already exist. Every
      // row is populated before the unique index is created below.
      table.string('normalized_name').nullable();
    });

    // Data backfill is deliberately kept in this low-level migration so the
    // same upgrade works before application models start querying the column.
    const profiles = await Connection.raw(
      'SELECT id, provider_id, name FROM agent_provider_profiles ORDER BY created_at',
    ) as Array<{ id: string; provider_id: string; name: string }>;
    for (const profile of uniqueLegacyProfileNames(profiles)) {
      await Connection.raw(
        'UPDATE agent_provider_profiles SET name = ?, normalized_name = ? WHERE id = ?',
        [profile.name, profile.normalizedName, profile.id],
      );
    }

    await this.schema.table('agent_provider_profiles', (table) => {
      table.uniqueIndex(['provider_id', 'normalized_name']);
    });
  }

  async down() {
    await this.schema.table('agent_provider_profiles', (table) => {
      table.dropColumn('normalized_name');
    });
  }
}
