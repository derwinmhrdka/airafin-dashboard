import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, isAdminEmail, setSessionCookie } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

function resolveBackendUrl(): string {
  const raw = env.API_URL?.trim();
  if (raw && (raw.startsWith('http://') || raw.startsWith('https://'))) {
    return raw.replace(/\/$/, '');
  }
  return 'http://backend:3081';
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const session = getSession(cookies);
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clear = body.clear === true;
  const projectIdRaw = body.projectId;
  const projectId =
    typeof projectIdRaw === 'number'
      ? projectIdRaw
      : typeof projectIdRaw === 'string'
        ? Number.parseInt(projectIdRaw, 10)
        : NaN;

  const forwarded = request.headers.get('x-forwarded-proto');
  const secure = url.protocol === 'https:' || forwarded === 'https';

  if (clear) {
    setSessionCookie(cookies, { ...session, projectId: null }, secure);
    return json({ ok: true, projectId: null });
  }

  if (!Number.isFinite(projectId) || projectId <= 0) {
    return json({ error: 'Valid projectId is required' }, { status: 400 });
  }

  const id = Math.trunc(projectId);

  try {
    const isAdmin = await isAdminEmail(session.email);
    const listUrl = isAdmin
      ? `${resolveBackendUrl()}/api/projects?all=1`
      : `${resolveBackendUrl()}/api/projects`;
    const res = await fetch(listUrl, {
      headers: { 'X-User-Email': session.email },
    });
    if (!res.ok) {
      return json({ error: 'Failed to verify project access' }, { status: 502 });
    }
    const data = (await res.json()) as { projects?: { id: number }[] };
    const allowed = (data.projects ?? []).some((p) => p.id === id);
    if (!allowed) {
      return json({ error: 'Project not assigned to this user' }, { status: 403 });
    }
  } catch {
    return json({ error: 'Backend unreachable' }, { status: 502 });
  }

  setSessionCookie(cookies, { ...session, projectId: id }, secure);
  return json({ ok: true, projectId: id });
};
