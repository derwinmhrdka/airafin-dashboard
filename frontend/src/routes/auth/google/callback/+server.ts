import { redirect, isRedirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  consumeOAuthState,
  googleOAuthConfigured,
  resolvePicFromEmail,
  setSessionCookie,
} from '$lib/server/auth';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
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

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    redirect(303, `/login?error=${encodeURIComponent(errorParam)}`);
  }

  const code = url.searchParams.get('code')?.trim() ?? '';
  const state = url.searchParams.get('state')?.trim() ?? '';

  if (!code || !consumeOAuthState(cookies, state)) {
    redirect(303, '/login?error=invalid_state');
  }

  const config = getGoogleClientConfig();
  if (!config) {
    redirect(303, '/login?error=google_not_configured');
  }

  const origin = appOrigin(url, request);
  const redirectUri = googleCallbackRedirectUri(origin);
  const forwarded = request.headers.get('x-forwarded-proto');
  const secure = url.protocol === 'https:' || forwarded === 'https';

  let profile: { email: string; name?: string; email_verified?: boolean };
  try {
    const tokens = await exchangeGoogleCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
    });
    profile = await fetchGoogleUserInfo(tokens.access_token);
  } catch (e) {
    if (isRedirect(e)) throw e;
    console.error('Google OAuth callback failed:', e);
    redirect(303, '/login?error=google_failed');
  }

  if (profile.email_verified === false) {
    redirect(303, '/login?error=email_not_verified');
  }

  const pic = await resolvePicFromEmail(profile.email);
  if (!pic) {
    redirect(303, '/login?error=email_not_allowed');
  }

  setSessionCookie(
    cookies,
    {
      email: profile.email.toLowerCase(),
      pic,
      name: profile.name,
      auth: 'google',
      projectId: null,
    },
    secure,
  );

  redirect(303, '/');
};
