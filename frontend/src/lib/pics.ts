export const PICS = ['Derwin', 'Anggita'] as const;
export type Pic = (typeof PICS)[number];

export const DEFAULT_PIC: Pic = 'Derwin';

export function picInitial(name: string): string {
  if (name === 'Derwin') return 'D';
  if (name === 'Anggita') return 'A';
  return name.charAt(0).toUpperCase() || '?';
}

/** Map income source label to PIC (e.g. "Gaji Derwin" → Derwin). */
export function incomePicFromSource(source: string): Pic | null {
  const s = source.toLowerCase();
  if (s.includes('derwin')) return 'Derwin';
  if (s.includes('anggita')) return 'Anggita';
  return null;
}
