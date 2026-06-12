import { redirect } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth';

export function load({ cookies }) {
  if (isAuthenticated(cookies)) {
    redirect(303, '/');
  }
  return {};
}
