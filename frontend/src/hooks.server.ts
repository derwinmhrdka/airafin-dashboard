import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { authenticatePassword, getSession, isSuperUserEmail } from '$lib/server/auth';

/** Internal backend URL — must include http:// host (never a path like /api). */
function resolveBackendUrl(): string {
  const raw = env.API_URL?.trim();
  if (raw && (raw.startsWith('http://') || raw.startsWith('https://'))) {
    return raw.replace(/\/$/, '');
  }
  return 'http://backend:3081';
}

function isPublicPath(path: string): boolean {
  return (
    path === '/login' ||
    path === '/auth/login' ||
    path === '/auth/google' ||
    path === '/auth/google/callback' ||
    path === '/auth/logout' ||
    path.startsWith('/_app/') ||
    path.startsWith('/fonts/') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'
  );
}

function isProjectDeletePath(path: string): boolean {
  return /^\/api\/projects\/\d+$/.test(path);
}

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const session = getSession(event.cookies);
  event.locals.session = session;
  const authed = session != null;

  if (authed && path === '/login') {
    redirect(303, '/');
  }

  if (!authed && !isPublicPath(path)) {
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    redirect(303, '/login');
  }

  if (path.startsWith('/api/settings/auth-emails') && !isSuperUserEmail(session?.email)) {
    return new Response(JSON.stringify({ error: 'Super user only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (
    path.startsWith('/api/settings/pics') &&
    event.request.method !== 'GET' &&
    !isSuperUserEmail(session?.email)
  ) {
    return new Response(JSON.stringify({ error: 'Super user only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!path.startsWith('/api/')) {
    return resolve(event);
  }

  const target = `${resolveBackendUrl()}${path}${event.url.search}`;
  const headers = new Headers(event.request.headers);
  headers.delete('host');
  for (const name of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(name);
  }

  if (event.request.method === 'POST' && path === '/api/transactions') {
    const token = env.API_SECRET_TOKEN;
    if (token) headers.set('X-API-Token', token);
  }

  if (session?.projectId) {
    headers.set('X-Project-Id', String(session.projectId));
  }

  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(event.request.method)) {
    const text = await event.request.text();
    if (text) {
      body = text;
    } else {
      headers.delete('content-type');
      headers.delete('content-length');
    }
  }

  // Super-user + dashboard password required to delete a project.
  if (event.request.method === 'DELETE' && isProjectDeletePath(path)) {
    if (!isSuperUserEmail(session?.email)) {
      return new Response(JSON.stringify({ error: 'Super user only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    let password = '';
    try {
      const parsed = body ? (JSON.parse(body) as { password?: string }) : {};
      password = typeof parsed.password === 'string' ? parsed.password : '';
    } catch {
      password = '';
    }
    if (!authenticatePassword(password)) {
      return new Response(JSON.stringify({ error: 'Incorrect password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Backend delete expects empty/no password body
    body = undefined;
    headers.delete('content-type');
    headers.delete('content-length');
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: event.request.method,
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend unreachable';
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    console.error(`API proxy failed: ${target} — ${message}${cause ? ` (${cause})` : ''}`);
    return new Response(
      JSON.stringify({
        error: 'Backend unreachable',
        detail: message,
        target,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
