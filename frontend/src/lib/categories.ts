/** Badge colors mapped from the original spreadsheet. */
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  Emergency: {
    bg: 'bg-red-900/15 dark:bg-red-900/30',
    text: 'text-red-900 dark:text-red-300',
    bar: 'bg-red-800',
  },
  Daily: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-900 dark:text-amber-200',
    bar: 'bg-amber-500',
  },
  Primary: {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-900 dark:text-sky-200',
    bar: 'bg-sky-500',
  },
  Transport: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    bar: 'bg-zinc-500',
  },
  Savings: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-800 dark:text-emerald-200',
    bar: 'bg-emerald-500',
  },
  'Personal Savings': {
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-800 dark:text-teal-200',
    bar: 'bg-teal-500',
  },
  Maintenance: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-200',
    bar: 'bg-orange-500',
  },
  Family: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-800 dark:text-violet-200',
    bar: 'bg-violet-500',
  },
  Entertain: {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-800 dark:text-pink-200',
    bar: 'bg-pink-500',
  },
};

export function categoryStyle(name: string) {
  return (
    CATEGORY_COLORS[name] ?? {
      bg: 'bg-zinc-100 dark:bg-zinc-800',
      text: 'text-zinc-700 dark:text-zinc-300',
      bar: 'bg-zinc-400',
    }
  );
}

export function defaultCategoryId(
  categories: readonly { id: number; name: string }[],
): number {
  const daily = categories.find((c) => c.name.toLowerCase() === 'daily');
  return daily?.id ?? categories[0]?.id ?? 0;
}
