import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import {
  authenticatePassword,
  getSession,
  isAdminEmail,
} from '$lib/server/auth';

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
    path === '/sw.js' ||
    path === '/manifest.webmanifest' ||
    path === '/favicon.ico' ||
    path === '/favicon.svg' ||
    path === '/robots.txt' ||
    path.startsWith('/icons/') ||
    path.startsWith('/_app/') ||
    path.startsWith('/fonts/')
  );
}

function isProjectDeletePath(path: string): boolean {
  return /^\/api\/projects\/\d+$/.test(path);
}

function isAdminProjectMutation(path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD') return false;
  if (!path.startsWith('/api/projects')) return false;
  return true;
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

  if (path === '/admin' || path.startsWith('/admin/')) {
    const ok = await isAdminEmail(session?.email);
    if (!ok) redirect(303, '/');
  }

  if (path.startsWith('/api/settings/auth-emails')) {
    const ok = await isAdminEmail(session?.email);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (
    path.startsWith('/api/settings/pics') &&
    event.request.method !== 'GET' &&
    !(await isAdminEmail(session?.email))
  ) {
    return new Response(JSON.stringify({ error: 'Admin only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isAdminProjectMutation(path, event.request.method)) {
    const ok = await isAdminEmail(session?.email);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const isInfoSkip = /^\/api\/info-updates\/\d+\/skip$/.test(path) && event.request.method === 'POST';
  const isInfoAdminWrite =
    path.startsWith('/api/info-updates') &&
    !isInfoSkip &&
    path !== '/api/info-updates/pending' &&
    event.request.method !== 'GET' &&
    event.request.method !== 'HEAD';
  const isInfoAdminRead =
    path.startsWith('/api/info-updates') &&
    path !== '/api/info-updates/pending' &&
    !isInfoSkip &&
    (event.request.method === 'GET' || event.request.method === 'HEAD');

  if (isInfoAdminWrite || isInfoAdminRead) {
    const ok = await isAdminEmail(session?.email);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
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
  if (session?.email) {
    headers.set('X-User-Email', session.email);
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

  // Super-user / admin + dashboard password required to delete a project.
  if (event.request.method === 'DELETE' && isProjectDeletePath(path)) {
    if (!(await isAdminEmail(session?.email))) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
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
