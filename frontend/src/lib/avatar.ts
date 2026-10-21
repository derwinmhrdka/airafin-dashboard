import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type AvatarMode = 'google' | 'color' | 'initial';

export function nameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0]?.toLocaleUpperCase() ?? '?';
}

export interface AvatarPref {
  mode: AvatarMode;
  seed: string;
}

function storageKey(nickname: string): string {
  return `airafin.avatar.${nickname.trim().toLowerCase()}`;
}

export function colorSeeds(nickname: string): string[] {
  const base = nickname.trim() || 'airafin';
  return [base, ...Array.from({ length: 11 }, (_, index) => `${base}#${index + 1}`)];
}

function fallback(nickname: string): AvatarPref {
  return { mode: 'google', seed: colorSeeds(nickname)[0] };
}

export const avatarPref = writable<AvatarPref>({ mode: 'google', seed: '' });

export function readAvatarPref(nickname: string): AvatarPref | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(storageKey(nickname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: string; seed?: string };
    const next = fallback(nickname);
    if (parsed.mode === 'color' || parsed.mode === 'animal') next.mode = 'color';
    else if (parsed.mode === 'initial' || parsed.mode === 'person') next.mode = 'initial';
    else if (parsed.mode === 'google') next.mode = 'google';
    else return null;
    if (typeof parsed.seed === 'string' && parsed.seed.trim()) next.seed = parsed.seed.trim();
    return next;
  } catch {
    return null;
  }
}

export function loadAvatarPref(nickname: string) {
  avatarPref.set(readAvatarPref(nickname) ?? fallback(nickname));
}

export function setAvatarPref(nickname: string, pref: AvatarPref) {
  avatarPref.set(pref);
  if (browser) localStorage.setItem(storageKey(nickname), JSON.stringify(pref));
}
