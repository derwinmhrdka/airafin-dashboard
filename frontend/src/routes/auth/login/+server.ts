import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticate, setAuthCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';

  if (!authenticate(password)) {
    return json({ error: 'Incorrect password' }, { status: 401 });
  }

  const forwarded = request.headers.get('x-forwarded-proto');
  const secure = url.protocol === 'https:' || forwarded === 'https';
  setAuthCookie(cookies, secure);
  return json({ ok: true });
};
