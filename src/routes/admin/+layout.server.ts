import { guardAuth } from '@beeblock/svelar/auth';

export const load = guardAuth('/dashboard', { role: 'admin' });
