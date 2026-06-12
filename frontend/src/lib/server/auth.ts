import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'airafin_session';

function sessionSecret(): string {
  return env.SESSION_SECRET ?? 'airafin-session-secret';
}

function dashboardPassword(): string {
  return env.DASHBOARD_PASSWORD?.trim() ?? '';
}

function expectedToken(): string {
  return createHmac('sha256', sessionSecret()).update('airafin-authenticated').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function authenticate(password: string): boolean {
  const expected = dashboardPassword();
  if (!expected) return false;
  return safeEqual(password, expected);
}

export function isAuthenticated(cookies: Cookies): boolean {
  const token = cookies.get(COOKIE_NAME);
  if (!token) return false;
  return safeEqual(token, expectedToken());
}

export function setAuthCookie(cookies: Cookies, secure = false): void {
  cookies.set(COOKIE_NAME, expectedToken(), {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
