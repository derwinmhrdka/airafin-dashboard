export const PICS = ['Derwin', 'Anggita'] as const;
export type Pic = (typeof PICS)[number];

export const DEFAULT_PIC: Pic = 'Derwin';

export function picInitial(name: string): string {
  if (name === 'Derwin') return 'D';
  if (name === 'Anggita') return 'A';
  return name.charAt(0).toUpperCase() || '?';
}
