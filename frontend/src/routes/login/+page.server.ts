import { redirect } from '@sveltejs/kit';
import { googleOAuthConfigured, isAuthenticated, listPicsFromBackend } from '$lib/server/auth';

export async function load({ cookies }) {
  if (isAuthenticated(cookies)) {
    redirect(303, '/');
  }
  return {
    googleEnabled: googleOAuthConfigured(),
    pics: await listPicsFromBackend(),
  };
}
