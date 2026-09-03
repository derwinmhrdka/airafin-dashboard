import { redirect } from '@sveltejs/kit';
import { googleOAuthConfigured, isAuthenticated } from '$lib/server/auth';

export function load({ cookies }) {
  if (isAuthenticated(cookies)) {
    redirect(303, '/');
  }
  return {
    googleEnabled: googleOAuthConfigured(),
  };
}
