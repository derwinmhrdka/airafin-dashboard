<script lang="ts">
  import { categoryStyle } from '$lib/categories';
  import { formatCurrency } from '$lib/format';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import type { CategorySummary } from '$lib/types';

  interface Props {
    item: CategorySummary;
    index: number;
  }

  let { item, index }: Props = $props();

  const style = $derived(categoryStyle(item.categoryName));
  const pct = $derived(
    item.allocated > 0 ? Math.min((item.spent / item.allocated) * 100, 100) : 0,
  );
  const overBudget = $derived(item.sisa < 0);
  const hasSubs = $derived((item.subcategories?.length ?? 0) > 0);

  let subsOpen = $state(false);
</script>

<article
  class="animate-in border border-zinc-200 p-3 dark:border-zinc-800"
  style="animation: fadeUp 0.4s ease {index * 60}ms both"
>
  <div class="mb-2 flex items-center justify-between gap-2">
    <span class="rounded px-2 py-0.5 text-xs font-medium {style.bg} {style.text}">
      {item.categoryName}
    </span>
    <span class="font-mono text-xs tabular-nums text-zinc-500">
      {pct.toFixed(0)}%
    </span>
  </div>

  <div class="mb-2 h-1.5 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
    <div
      class="h-full transition-all duration-700 ease-out {overBudget ? 'bg-red-600' : style.bar}"
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
      <p class="stat-amount font-mono tabular-nums">{formatCurrency(item.allocated)}</p>
    </div>
    <div class="min-w-0 text-right">
      <p class="text-[10px] text-zinc-500">SISA</p>
      <p class="stat-amount font-mono tabular-nums {overBudget ? 'text-red-600 dark:text-red-400' : ''}">
        {formatCurrency(item.sisa)}
      </p>
    </div>
  </div>

  {#if hasSubs}
    <div class="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left text-[9px] font-medium uppercase tracking-wider text-zinc-500"
        aria-expanded={subsOpen}
        onclick={() => {
          subsOpen = !subsOpen;
        }}
      >
        <span>Sub Category</span>
        <span class="font-mono text-[10px] normal-case tracking-normal text-zinc-400" aria-hidden="true">
          {subsOpen ? '−' : '+'}
        </span>
      </button>

      {#if subsOpen}
        <div class="mt-1.5 space-y-1.5">
          {#each item.subcategories as sub (sub.name)}
            {@const subOver = sub.sisa < 0}
            <div class="space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800">
              <div class="flex min-w-0 items-center gap-1">
                <p class="min-w-0 flex-1 truncate text-[9px] text-zinc-500">{sub.name}</p>
                {#if sub.pic}
                  <PicBadge name={sub.pic} />
                {/if}
              </div>
              <div class="grid min-w-0 grid-cols-3 gap-0.5">
                <div class="min-w-0">
                  <p class="text-[8px] text-zinc-400">Spent</p>
                  <p class="font-mono text-[9px] tabular-nums">{formatCurrency(sub.spent)}</p>
                </div>
                <div class="min-w-0">
                  <p class="text-[8px] text-zinc-400">Plan</p>
                  <p class="font-mono text-[9px] tabular-nums">{formatCurrency(sub.allocated)}</p>
                </div>
                <div class="min-w-0 text-right">
                  <p class="text-[8px] text-zinc-400">SISA</p>
                  <p
                    class="font-mono text-[9px] tabular-nums {subOver
                      ? 'text-red-600 dark:text-red-400'
                      : ''}"
                  >
                    {formatCurrency(sub.sisa)}
                  </p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
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
