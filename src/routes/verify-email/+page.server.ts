import type { PageServerLoad } from './$types';
import { auth } from '../../app.js';

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token');
  const id = url.searchParams.get('id');

  if (!token || !id) {
    return { success: false, message: 'Invalid verification link.' };
  }

  const success = await auth.verifyEmail(token, id);

  if (success) {
    return { success: true, message: 'Your email has been verified!' };
  }

  return { success: false, message: 'Invalid or expired verification link. Please request a new one.' };
};
