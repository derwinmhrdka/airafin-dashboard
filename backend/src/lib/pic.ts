export const VALID_PIC = ['Derwin', 'Anggita'] as const;
export type Pic = (typeof VALID_PIC)[number];

export function isValidPic(value: string): value is Pic {
  return (VALID_PIC as readonly string[]).includes(value);
}
