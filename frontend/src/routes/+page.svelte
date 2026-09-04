<script lang="ts">
  import { page } from '$app/state';
  import { categoryChartFill } from '$lib/chart-colors';
  import AllocationBar from '$lib/components/AllocationBar.svelte';
  import CategoryProgress from '$lib/components/CategoryProgress.svelte';
  import HBarChart from '$lib/components/HBarChart.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { getSummary } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { planVsExpenseSlices } from '$lib/plan-vs-expense';
  import { periodFromUrl } from '$lib/period';
  import type { CategorySummary, DashboardSummary } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));

  function categoryHasData(c: CategorySummary): boolean {
    if (c.allocated > 0 || c.spent > 0) return true;
    return c.subcategories?.some((s) => s.allocated > 0 || s.spent > 0) ?? false;
  }

  let summary = $state<DashboardSummary | null>(null);
  let loading = $state(true);
  let error = $state('');
  /** 'general' or categoryId string */
  let planVsScope = $state('general');
  /** Category name filter from Plan Allocation bar */
  let allocationFilter = $state<string | null>(null);

  const chartCategories = $derived(
    summary?.categories.filter(categoryHasData) ?? [],
  );

  const planVsNumbers = $derived.by(() => {
    if (!summary) return { plan: 0, spent: 0, title: 'General' };
    if (planVsScope === 'general') {
      return {
        plan: summary.totalBudgetAllocated,
        spent: summary.totalSpent,
        title: 'General',
      };
    }
    const cat = summary.categories.find((c) => String(c.categoryId) === planVsScope);
    if (!cat) {
      return {
        plan: summary.totalBudgetAllocated,
        spent: summary.totalSpent,
        title: 'General',
      };
    }
    return { plan: cat.allocated, spent: cat.spent, title: cat.categoryName };
  });

  const planVsSlices = $derived(
    planVsExpenseSlices(planVsNumbers.plan, planVsNumbers.spent),
  );

  const allocationSlices = $derived(
    (summary?.categories ?? [])
      .filter((c) => c.allocated > 0)
      .map((c) => ({
        label: c.categoryName,
        value: c.allocated,
        color: categoryChartFill(c.categoryName),
      })),
  );

  const visibleCategories = $derived(
    (summary?.categories ?? [])
      .filter(categoryHasData)
      .filter((c) => allocationFilter == null || c.categoryName === allocationFilter),
  );

  const pocketGroups = $derived.by(() =>
    (summary?.picPocketTotals ?? [])
      .map((row) => ({
        pic: row.pic,
        pockets: row.pockets
          .filter((p) => p.total > 0 || p.spent > 0)
          .sort((a, b) => b.total - a.total),
      }))
      .filter((row) => row.pockets.length > 0),
  );

  async function loadData(activePeriod: string) {
    loading = true;
    error = '';
    allocationFilter = null;
    try {
      const summaryRes = await getSummary(activePeriod);
      summary = summaryRes;
    } catch (e) {
      summary = null;
      error = e instanceof Error ? e.message : 'Failed to load summary';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadData(period);
  });
</script>

{#if loading}
  <div class="space-y-3">
    <div class="grid grid-cols-3 gap-2">
      {#each Array(3) as _}
        <div class="h-16 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
      {/each}
    </div>
    {#each Array(4) as _}
      <div class="h-24 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
    {/each}
  </div>
{:else if error}
  <p class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
    {error}
  </p>
{:else if summary}
  <section class="mx-auto w-full space-y-4 md:space-y-6">
    <p class="text-[11px] uppercase tracking-wider text-zinc-500 md:text-xs">Overview · {period}</p>
    <div class="grid min-w-0 grid-cols-3 gap-1 md:gap-3">
      <StatCard label="Income" value={summary.totalIncome} accent="income" />
      <StatCard label="Spent" value={summary.totalSpent} accent="spent" />
      <StatCard label="Remaining" value={summary.totalSisa} accent="sisa" />
    </div>

    <div class="flex min-w-0 items-center justify-between gap-2 border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <span class="shrink-0 text-xs text-zinc-500">Total Plan</span>
      <span class="stat-amount font-mono font-medium tabular-nums">
        {formatCurrency(summary.totalBudgetAllocated)}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <article class="border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="mb-3 space-y-2">
          <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Spent vs Remaining</h2>
          <label class="block space-y-1">
            <span class="text-[10px] text-zinc-500">Category</span>
            <select
              bind:value={planVsScope}
              class="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-black"
            >
              <option value="general">All categories</option>
              {#each chartCategories as cat (cat.categoryId)}
                <option value={String(cat.categoryId)}>{cat.categoryName}</option>
              {/each}
            </select>
          </label>
          <p class="text-[10px] text-zinc-500">
            {planVsNumbers.title}: Plan {formatCurrency(planVsNumbers.plan)} · Spent
            {formatCurrency(planVsNumbers.spent)}
          </p>
        </div>
        <HBarChart slices={planVsSlices} emptyLabel="No plan data" />
      </article>

      <article class="border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="mb-3">
          <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Plan Allocation</h2>
          <p class="mt-1 text-[10px] text-zinc-500">
            Share of plan per category ({formatCurrency(summary.totalBudgetAllocated)}). Tap a
            segment to filter below.
          </p>
        </div>
        <AllocationBar
          slices={allocationSlices}
          selected={allocationFilter}
          emptyLabel="No plan yet"
          onSelect={(label) => {
            allocationFilter = label;
          }}
        />
      </article>
    </div>

    <div class="space-y-2 md:space-y-3" data-allocation-filtered>
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">By Category</h2>
        {#if allocationFilter}
          <button
            type="button"
            class="text-[10px] text-zinc-500 underline-offset-2 transition-opacity hover:underline"
            onclick={() => (allocationFilter = null)}
          >
            Show all
          </button>
        {/if}
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {#each visibleCategories as item, i (item.categoryId)}
          <div class="allocation-card" style="animation-delay: {Math.min(i, 6) * 40}ms">
            <CategoryProgress {item} index={0} />
          </div>
        {:else}
          <p
            class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 md:col-span-full"
          >
            No plan yet
          </p>
        {/each}
      </div>
    </div>

    {#if pocketGroups.length > 0}
      <div class="space-y-2 md:space-y-3">
        <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Pocket</h2>
        <div class="space-y-2">
          {#each pocketGroups as group (group.pic)}
            <details class="border border-zinc-200 p-3 dark:border-zinc-800">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-2">
                <PicBadge name={group.pic} />
                <span class="text-[10px] uppercase tracking-wider text-zinc-500">
                  {group.pockets.length} pockets
                </span>
              </summary>
              <div class="mt-2 space-y-2">
                {#each group.pockets as pocket}
                  {@const pct = pocket.total > 0 ? Math.min((pocket.spent / pocket.total) * 100, 100) : 0}
                  {@const overBudget = pocket.sisa < 0}
                  {@const subItems = pocket.items}
                  <div class="border border-zinc-200 p-2 dark:border-zinc-800">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <span
                        class="rounded px-2 py-0.5 text-xs font-medium text-white"
                        style="background-color: {pocket.color}"
                      >
                        {pocket.pocket}
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
                        <p class="stat-amount font-mono tabular-nums">{formatCurrency(pocket.spent)}</p>
                      </div>
                      <div class="min-w-0">
                        <p class="text-[10px] text-zinc-500">Plan</p>
                        <p class="stat-amount font-mono tabular-nums">{formatCurrency(pocket.total)}</p>
                      </div>
                      <div class="min-w-0 text-right">
                        <p class="text-[10px] text-zinc-500">Remaining</p>
                        <p class="stat-amount font-mono tabular-nums {overBudget ? 'text-red-600 dark:text-red-400' : ''}">
                          {formatCurrency(pocket.sisa)}
                        </p>
                      </div>
                    </div>
                    {#if subItems.length > 0}
                      <div class="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
                        <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2 gap-y-1">
                          <p class="text-[9px] uppercase tracking-wider text-zinc-400">Spent On</p>
                          <p class="text-right text-[9px] uppercase tracking-wider text-zinc-400">Spent</p>
                          <p class="text-right text-[9px] uppercase tracking-wider text-zinc-400">Remaining</p>
                          {#each subItems as it (it.name)}
                            {@const itLeft = it.plan - it.spent}
                            <span class="min-w-0 truncate text-[10px] text-zinc-600 dark:text-zinc-400">{it.name}</span>
                            <span class="text-right font-mono text-[10px] tabular-nums text-zinc-700 dark:text-zinc-300">
                              {formatCurrency(it.spent)}
                            </span>
                            <span
                              class="text-right font-mono text-[10px] tabular-nums {itLeft < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-zinc-500'}"
                            >
                              {formatCurrency(itLeft)}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          {/each}
        </div>
      </div>
    {/if}
  </section>
{:else}
  <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
    Unable to load overview. Try refreshing the page.
  </p>
{/if}

<style>
  .allocation-card {
    animation: allocationIn 280ms ease-out both;
  }

  @keyframes allocationIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .allocation-card {
      animation: none;
    }
  }
</style>
