import { listLogos } from 'idn-finlogos';

/** Pocket nicknames that are not the catalog brand name. */
const EXTRA: Record<string, string> = {
  supa: 'superbank',
};

function compact(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

const byKey = new Map<string, string>();

function remember(key: string, slug: string) {
  if (!key || byKey.has(key)) return;
  byKey.set(key, slug);
}

for (const logo of listLogos()) {
  remember(logo.slug, logo.slug);
  remember(compact(logo.slug), logo.slug);
  remember(compact(logo.name), logo.slug);
  for (const alias of logo.aliases) {
    remember(alias.toLowerCase(), logo.slug);
    remember(compact(alias), logo.slug);
  }
}

/** Catalog slug for a pocket/bank name, or null when there is no match. */
export function bankSlug(name: string): string | null {
  const raw = name.trim();
  if (!raw) return null;
  const extra = EXTRA[raw.toLowerCase()];
  return byKey.get(raw.toLowerCase()) ?? byKey.get(compact(raw)) ?? (extra ? byKey.get(extra) : undefined) ?? null;
}

export interface BankChoice {
  slug: string;
  name: string;
  search: string;
}

/** Extra artwork of the same brand: alt, old, and vertical lockups. */
const VARIANT = /-(?:old-alt|new-alt|alt-2|alt|old|vertical)$/;

function pictureGroup(slug: string): string {
  return slug.replace(VARIANT, '');
}

function pictureRank(slug: string): number {
  if (!VARIANT.test(slug)) return 0;
  if (slug.includes('-old')) return 3;
  if (slug.endsWith('-vertical')) return 2;
  return 1;
}

function displayName(name: string): string {
  return name.replace(/\s+\((?:old alt|alt-2|alt|old|vertical)\)$/i, '').trim() || name;
}

const POCKET_CATEGORIES = new Set(['bank-logo', 'e-wallet']);

const bankChoices: BankChoice[] = [];
const groups = new Map<string, ReturnType<typeof listLogos>>();

for (const logo of listLogos()) {
  if (!POCKET_CATEGORIES.has(logo.category)) continue;
  const key = pictureGroup(logo.slug);
  const group = groups.get(key);
  if (group) group.push(logo);
  else groups.set(key, [logo]);
}

for (const logos of groups.values()) {
  logos.sort((a, b) => pictureRank(a.slug) - pictureRank(b.slug) || a.slug.length - b.slug.length);
  const chosen = logos[0];
  const name = displayName(chosen.name);
  remember(compact(name), chosen.slug);
  remember(pictureGroup(chosen.slug), chosen.slug);
  bankChoices.push({
    slug: chosen.slug,
    name,
    search: compact(logos.map((logo) => `${logo.name} ${logo.slug} ${logo.aliases.join(' ')}`).join(' ')),
  });
}

bankChoices.sort((a, b) => a.name.localeCompare(b.name));

/** Catalog names matching a typed query, best matches first. */
export function searchBanks(query: string, limit = 20): BankChoice[] {
  const q = compact(query);
  if (!q) return [];

  return bankChoices
    .map((choice) => {
      const name = compact(choice.name);
      const slug = compact(choice.slug);
      const rank = name === q || slug === q ? 0 : name.startsWith(q) || slug.startsWith(q) ? 1 : choice.search.includes(q) ? 2 : -1;
      return { choice, rank };
    })
    .filter((row) => row.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.choice.name.localeCompare(b.choice.name))
    .slice(0, limit)
    .map((row) => row.choice);
}
