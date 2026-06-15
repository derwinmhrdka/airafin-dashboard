import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/server/auth';

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
    path.startsWith('/_app/') ||
    path.startsWith('/fonts/') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const authed = isAuthenticated(event.cookies);

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

  if (!path.startsWith('/api/')) {
    return resolve(event);
  }

  const target = `${resolveBackendUrl()}${path}${event.url.search}`;
  const headers = new Headers(event.request.headers);
  headers.delete('host');

  if (event.request.method === 'POST' && path === '/api/transactions') {
    const token = env.API_SECRET_TOKEN;
    if (token) headers.set('X-API-Token', token);
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

  let response: Response;
  try {
    response = await fetch(target, {
      method: event.request.method,
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend unreachable';
    console.error(`API proxy failed: ${target} — ${message}`);
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
