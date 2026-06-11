import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

const BACKEND_URL = env.API_URL ?? 'http://localhost:3001';

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

  const hasBody = !['GET', 'HEAD'].includes(event.request.method);
  const response = await fetch(target, {
    method: event.request.method,
    headers,
    body: hasBody ? await event.request.text() : undefined,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
