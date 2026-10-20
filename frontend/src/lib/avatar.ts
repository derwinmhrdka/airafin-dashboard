import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type AvatarMode = 'google' | 'animal' | 'person';

export interface AvatarPref {
  mode: AvatarMode;
  seed: string;
}

function storageKey(nickname: string): string {
  return `airafin.avatar.${nickname.trim().toLowerCase()}`;
}

export function animalSeeds(nickname: string): string[] {
  const base = nickname.trim() || 'airafin';
  return [base, ...Array.from({ length: 11 }, (_, index) => `${base}#${index + 1}`)];
}

function fallback(nickname: string): AvatarPref {
  return { mode: 'google', seed: animalSeeds(nickname)[0] };
}

export const avatarPref = writable<AvatarPref>({ mode: 'google', seed: '' });

export function loadAvatarPref(nickname: string) {
  const next = fallback(nickname);
  if (browser) {
    try {
      const raw = localStorage.getItem(storageKey(nickname));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AvatarPref>;
        if (parsed.mode === 'animal' || parsed.mode === 'google' || parsed.mode === 'person') {
          next.mode = parsed.mode;
        }
        if (typeof parsed.seed === 'string' && parsed.seed.trim()) next.seed = parsed.seed.trim();
      }
    } catch {
      /* keep fallback */
    }
  }
  avatarPref.set(next);
}

export function setAvatarPref(nickname: string, pref: AvatarPref) {
  avatarPref.set(pref);
  if (browser) localStorage.setItem(storageKey(nickname), JSON.stringify(pref));
}
