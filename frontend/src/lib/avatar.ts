import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { saveMyAvatar } from '$lib/api';
import type { PicSetting } from '$lib/types';

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

export interface SharedAvatar extends AvatarPref {
  picture: string;
}

export const avatarPref = writable<AvatarPref>({ mode: 'google', seed: '' });

/** Saved face for every PIC, shared across logins. */
export const avatarByPic = writable<Record<string, SharedAvatar>>({});

function normalizeMode(mode: string | undefined): AvatarMode | null {
  if (mode === 'color' || mode === 'animal') return 'color';
  if (mode === 'initial' || mode === 'person') return 'initial';
  if (mode === 'google') return 'google';
  return null;
}

function remember(nickname: string, pref: AvatarPref, picture: string | undefined) {
  const key = nickname.trim().toLowerCase();
  if (!key) return;
  avatarByPic.update((map) => {
    const prev = map[key];
    return {
      ...map,
      [key]: {
        mode: pref.mode,
        seed: pref.seed,
        picture: picture !== undefined ? picture : (prev?.picture ?? ''),
      },
    };
  });
}

export function readAvatarPref(nickname: string): AvatarPref | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(storageKey(nickname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: string; seed?: string };
    const next = fallback(nickname);
    const mode = normalizeMode(parsed.mode);
    if (!mode) return null;
    next.mode = mode;
    if (typeof parsed.seed === 'string' && parsed.seed.trim()) next.seed = parsed.seed.trim();
    return next;
  } catch {
    return null;
  }
}

export function loadAvatarPref(nickname: string) {
  avatarPref.set(readAvatarPref(nickname) ?? fallback(nickname));
}

function writeLocal(nickname: string, pref: AvatarPref) {
  avatarPref.set(pref);
  if (browser) localStorage.setItem(storageKey(nickname), JSON.stringify(pref));
}

/** Apply a face already stored for this login, without writing it again. */
export function adoptAvatarPref(nickname: string, pref: AvatarPref, picture = '') {
  writeLocal(nickname, pref);
  remember(nickname, pref, picture);
}

export function setAvatarPref(nickname: string, pref: AvatarPref, picture?: string) {
  writeLocal(nickname, pref);
  remember(nickname, pref, picture);
  if (!browser || !nickname.trim()) return;
  void saveMyAvatar({ mode: pref.mode, seed: pref.seed, picture }).catch(() => {});
}

/** Load every PIC face, then keep this login in step with the saved one. */
export function syncAvatars(rows: PicSetting[], mineName: string, minePicture: string) {
  const next: Record<string, SharedAvatar> = {};
  for (const row of rows) {
    const mode = normalizeMode(row.avatarMode);
    const name = row.name.trim();
    if (!mode || !name) continue;
    next[name.toLowerCase()] = {
      mode,
      seed: row.avatarSeed?.trim() || name,
      picture: row.avatarPicture?.trim() || '',
    };
  }
  avatarByPic.set(next);

  const mine = mineName.trim();
  if (!mine) return;
  const saved = next[mine.toLowerCase()];
  if (saved) {
    if (saved.mode === 'google' && minePicture && minePicture !== saved.picture) {
      setAvatarPref(mine, { mode: saved.mode, seed: saved.seed }, minePicture);
    } else {
      adoptAvatarPref(mine, { mode: saved.mode, seed: saved.seed }, saved.picture || minePicture);
    }
    return;
  }
  const local = readAvatarPref(mine);
  if (local) setAvatarPref(mine, local, local.mode === 'google' ? minePicture : undefined);
  else loadAvatarPref(mine);
}
