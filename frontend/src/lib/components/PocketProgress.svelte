<script lang="ts">
  import { formatCurrency } from '$lib/format';

  interface PocketSummary {
    label: string;
    planned: number;
    spent: number;
    sisa: number;
  }

  interface Props {
    item: PocketSummary;
    index: number;
  }

  let { item, index }: Props = $props();

  const pct = $derived(
    item.planned > 0 ? Math.min((item.spent / item.planned) * 100, 100) : 0,
  );
  const overBudget = $derived(item.sisa < 0);
</script>

<article
  class="animate-in border border-zinc-200 p-3 dark:border-zinc-800"
  style="animation: fadeUp 0.4s ease {index * 60}ms both"
>
  <div class="mb-2 flex items-center justify-between gap-2">
    <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      {item.label}
    </span>
    <span class="font-mono text-xs tabular-nums text-zinc-500">{pct.toFixed(0)}%</span>
  </div>

  <div class="mb-2 h-1.5 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
    <div
      class="h-full transition-all duration-700 ease-out {overBudget ? 'bg-red-600' : 'bg-zinc-700 dark:bg-zinc-300'}"
      style="width: {pct}%"
    ></div>
  </div>

  <div class="grid min-w-0 grid-cols-3 gap-1">
    <div class="min-w-0">
      <p class="text-[10px] text-zinc-500">Spent</p>
      <p class="stat-amount font-mono tabular-nums">{formatCurrency(item.spent)}</p>
    </div>
    <div class="min-w-0">
      <p class="text-[10px] text-zinc-500">Plan</p>
      <p class="stat-amount font-mono tabular-nums">{formatCurrency(item.planned)}</p>
    </div>
    <div class="min-w-0 text-right">
      <p class="text-[10px] text-zinc-500">Remaining</p>
      <p class="stat-amount font-mono tabular-nums {overBudget ? 'text-red-600 dark:text-red-400' : ''}">
        {formatCurrency(item.sisa)}
      </p>
    </div>
  </div>
</article>

<style>
  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
