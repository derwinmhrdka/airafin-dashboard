import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticatePassword, listPicsFromBackend, setSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const picRaw = typeof body.pic === 'string' ? body.pic.trim() : '';

  if (!authenticatePassword(password)) {
    return json({ error: 'Incorrect password' }, { status: 401 });
  }

  const allowed = await listPicsFromBackend();
  const pic = allowed.includes(picRaw) ? picRaw : null;
  if (!pic) {
    return json({ error: 'Select your PIC' }, { status: 400 });
  }

  const forwarded = request.headers.get('x-forwarded-proto');
  const secure = url.protocol === 'https:' || forwarded === 'https';
  setSessionCookie(
    cookies,
    {
      email: `password:${pic.toLowerCase()}@local`,
      pic,
      name: pic,
      auth: 'password',
      projectId: null,
    },
    secure,
  );
  return json({ ok: true, pic });
};
