import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createOAuthState, googleOAuthConfigured } from '$lib/server/auth';
import {
  buildGoogleAuthorizeUrl,
  getGoogleClientConfig,
  googleCallbackRedirectUri,
} from '$lib/server/google-oauth';
import { env } from '$env/dynamic/private';

function appOrigin(url: URL, request: Request): string {
  const configured = env.ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwarded = request.headers.get('x-forwarded-proto');
  const proto = forwarded === 'https' ? 'https' : url.protocol.replace(':', '');
  return `${proto}://${url.host}`;
}

export const GET: RequestHandler = async ({ cookies, url, request }) => {
  if (!googleOAuthConfigured()) {
    redirect(303, '/login?error=google_not_configured');
  }

  const config = getGoogleClientConfig();
  if (!config) {
    redirect(303, '/login?error=google_not_configured');
  }

  const forwarded = request.headers.get('x-forwarded-proto');
  const secure = url.protocol === 'https:' || forwarded === 'https';
  const state = createOAuthState(cookies, secure);
  const origin = appOrigin(url, request);
  const redirectUri = googleCallbackRedirectUri(origin);

  redirect(
    303,
    buildGoogleAuthorizeUrl({
      clientId: config.clientId,
      redirectUri,
      state,
    }),
  );
};
