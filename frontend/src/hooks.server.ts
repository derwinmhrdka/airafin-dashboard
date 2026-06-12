import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

const BACKEND_URL = env.API_URL ?? 'http://localhost:3081';

export const handle: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/')) {
    return resolve(event);
  }

  const target = `${BACKEND_URL}${event.url.pathname}${event.url.search}`;
  const headers = new Headers(event.request.headers);
  headers.delete('host');

  if (event.request.method === 'POST' && event.url.pathname === '/api/transactions') {
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

  const response = await fetch(target, {
    method: event.request.method,
    headers,
    body,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
