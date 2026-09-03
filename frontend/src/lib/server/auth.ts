import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'airafin_session';
const OAUTH_STATE_COOKIE = 'airafin_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — “one time login”

export type SessionPic = string;

export interface SessionUser {
  email: string;
  pic: SessionPic;
  name?: string;
  auth: 'google' | 'password';
  /** Active workspace; null until user picks a project after login. */
  projectId: number | null;
}

function sessionSecret(): string {
  return env.SESSION_SECRET ?? 'airafin-session-secret';
}

function dashboardPassword(): string {
  return env.DASHBOARD_PASSWORD?.trim() ?? '';
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function encodeSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string): SessionUser | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return null;

  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser;
    if (!raw?.email || typeof raw.pic !== 'string' || !raw.pic.trim()) return null;
    if (raw.auth !== 'google' && raw.auth !== 'password') return null;
    const projectId =
      typeof raw.projectId === 'number' && Number.isFinite(raw.projectId) && raw.projectId > 0
        ? Math.trunc(raw.projectId)
        : null;
    return {
      email: String(raw.email).toLowerCase(),
      pic: String(raw.pic).trim(),
      name: raw.name ? String(raw.name) : undefined,
      auth: raw.auth,
      projectId,
    };
  } catch {
    return null;
  }
}

function resolveBackendUrl(): string {
  const raw = env.API_URL?.trim();
  if (raw && (raw.startsWith('http://') || raw.startsWith('https://'))) {
    return raw.replace(/\/$/, '');
  }
  return 'http://localhost:3081';
}

export async function listPicsFromBackend(): Promise<string[]> {
  try {
    const res = await fetch(`${resolveBackendUrl()}/api/settings/pics`);
    if (!res.ok) return ['Derwin', 'Anggita'];
    const data = (await res.json()) as { pics?: { name?: string }[] };
    const names = (data.pics ?? []).map((p) => p.name?.trim() ?? '').filter(Boolean);
    return names.length > 0 ? names : ['Derwin', 'Anggita'];
  } catch {
    return ['Derwin', 'Anggita'];
  }
}

export function isSuperUserEmail(email: string | undefined | null): boolean {
  const superEmail = env.AUTH_EMAIL?.split(',')[0]?.trim().toLowerCase() ?? '';
  return Boolean(superEmail && email?.trim().toLowerCase() === superEmail);
}

/** Look up allowed Google email → PIC from backend settings. */
export async function resolvePicFromEmail(email: string): Promise<SessionPic | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const res = await fetch(`${resolveBackendUrl()}/api/auth/resolve-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pic?: string };
    if (typeof data.pic === 'string' && data.pic.trim()) return data.pic.trim();
    return null;
  } catch (e) {
    console.error('resolvePicFromEmail failed:', e);
    return null;
  }
}

export function googleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
}

export function authenticatePassword(password: string): boolean {
  const expected = dashboardPassword();
  if (!expected) return false;
  return safeEqual(password, expected);
}

export function getSession(cookies: Cookies): SessionUser | null {
  const token = cookies.get(COOKIE_NAME);
  if (!token) return null;
  return decodeSession(token);
}

export function isAuthenticated(cookies: Cookies): boolean {
  return getSession(cookies) != null;
}

export function setSessionCookie(
  cookies: Cookies,
  user: SessionUser,
  secure = false,
): void {
  cookies.set(COOKIE_NAME, encodeSession(user), {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

export function createOAuthState(cookies: Cookies, secure = false): string {
  const state = randomBytes(24).toString('base64url');
  cookies.set(OAUTH_STATE_COOKIE, state, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 10,
  });
  return state;
}

export function consumeOAuthState(cookies: Cookies, state: string): boolean {
  const expected = cookies.get(OAUTH_STATE_COOKIE);
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
  if (!expected || !state) return false;
  return safeEqual(expected, state);
}
