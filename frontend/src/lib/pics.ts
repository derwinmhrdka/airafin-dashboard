import { get, writable } from 'svelte/store';

export type Pic = string;

export const FALLBACK_PICS = ['Derwin', 'Anggita'] as const;

export const picNames = writable<string[]>([...FALLBACK_PICS]);

export function setPicNames(names: string[]) {
  const next = names.map((n) => n.trim()).filter(Boolean);
  picNames.set(next.length > 0 ? next : [...FALLBACK_PICS]);
}

export function defaultPic(list?: readonly string[]): string {
  const names = list ?? get(picNames);
  return names.includes('Derwin') ? 'Derwin' : (names[0] ?? 'Derwin');
}

/** @deprecated Use defaultPic() — kept so existing initial state compiles. */
export const DEFAULT_PIC = 'Derwin';

export function isKnownPic(name: string, list?: readonly string[]): boolean {
  return (list ?? get(picNames)).includes(name);
}

export function otherPic(pic: string, list?: readonly string[]): string {
  const names = list ?? get(picNames);
  return names.find((x) => x !== pic) ?? defaultPic(names);
}

export function picRank(name: string, list?: readonly string[]): number {
  const names = list ?? get(picNames);
  const idx = names.indexOf(name);
  return idx === -1 ? names.length : idx;
}

export function picInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Map income source label to PIC (e.g. "Gaji Derwin" → Derwin). */
export function incomePicFromSource(source: string, list?: readonly string[]): string | null {
  const s = source.toLowerCase();
  const names = [...(list ?? get(picNames))].sort((a, b) => b.length - a.length);
  return names.find((p) => s.includes(p.toLowerCase())) ?? null;
}
