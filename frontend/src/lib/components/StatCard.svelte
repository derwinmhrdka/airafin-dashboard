<script lang="ts">
  import { formatCurrency } from '$lib/format';

  interface Props {
    label: string;
    value: number;
    accent?: 'default' | 'income' | 'spent' | 'sisa';
  }

  let { label, value, accent = 'default' }: Props = $props();

  const accentMap = {
    default: 'text-black dark:text-white',
    income: 'text-emerald-600 dark:text-emerald-400',
    spent: 'text-red-600 dark:text-red-400',
    sisa: 'text-sky-600 dark:text-sky-400',
  } as const;

  const accentClass = $derived(accentMap[accent]);
</script>

<div class="flex flex-col gap-1 border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
  <span class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
  <span class="font-mono text-sm font-medium tabular-nums {accentClass}">
    {formatCurrency(value)}
  </span>
</div>
