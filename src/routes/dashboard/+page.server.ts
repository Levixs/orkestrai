import type { PageServerLoad } from './$types';
import { ApiKeys } from '@beeblock/svelar/api-keys';
import { Teams } from '@beeblock/svelar/teams';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user as any;

  let apiKeyCount = 0;
  let teamCount = 0;

  try {
    const keys = await ApiKeys.listForUser(user.id);
    apiKeyCount = keys?.length ?? 0;
  } catch {}

  try {
    const teams = await Teams.getUserTeams(user.id);
    teamCount = teams?.length ?? 0;
  } catch {}

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role ?? 'user',
    },
    stats: {
      apiKeyCount,
      teamCount,
    },
  };
};
