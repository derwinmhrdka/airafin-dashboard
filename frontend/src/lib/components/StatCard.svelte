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

<div class="min-w-0 border border-zinc-200 px-1.5 py-2 dark:border-zinc-800">
  <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
  <p class="stat-amount mt-0.5 font-mono font-semibold tabular-nums {accentClass}">
    {formatCurrency(value)}
  </p>
</div>
