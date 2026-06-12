import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { authenticate, isAuthenticated, setAuthCookie } from '$lib/server/auth';

export function load({ cookies }) {
  if (isAuthenticated(cookies)) {
    redirect(303, '/');
  }
  return {};
}

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const password = data.get('password')?.toString() ?? '';

    if (!authenticate(password)) {
      return fail(401, { incorrect: true });
    }

    setAuthCookie(cookies);
    redirect(303, '/');
  },
};
