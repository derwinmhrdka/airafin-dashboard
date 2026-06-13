<script lang="ts">
  import { page } from '$app/state';
  import { categoryChartFill } from '$lib/chart-colors';
  import CategoryProgress from '$lib/components/CategoryProgress.svelte';
  import PieChart from '$lib/components/PieChart.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { getReimbursements, getSummary, markReimbursementPaid } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { planVsExpenseSlices } from '$lib/plan-vs-expense';
  import { periodFromUrl } from '$lib/period';
  import { picInitial } from '$lib/pics';
  import type { CategorySummary, DashboardSummary, ReimbursementItem } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));

  function categoryHasData(c: CategorySummary): boolean {
    if (c.allocated > 0 || c.spent > 0) return true;
    return c.subcategories?.some((s) => s.allocated > 0 || s.spent > 0) ?? false;
  }

  let summary = $state<DashboardSummary | null>(null);
  let reimbursements = $state<ReimbursementItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let payingId = $state<number | null>(null);
  /** 'general' or categoryId string */
  let planVsScope = $state('general');

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

  /** Plan owner → who paid: how much is still owed per pair. */
  const reimbursementTotals = $derived.by(() => {
    const byPair = new Map<string, number>();
    for (const item of reimbursements) {
      const key = `${item.planPic}\0${item.pic}`;
      const cost = Number.parseFloat(item.cost) || 0;
      byPair.set(key, (byPair.get(key) ?? 0) + cost);
    }
    return [...byPair.entries()]
      .map(([key, total]) => {
        const [planPic, paidBy] = key.split('\0');
        return { planPic, paidBy, total };
      })
      .sort((a, b) => b.total - a.total);
  });

  async function loadData(activePeriod: string) {
    loading = true;
    error = '';
    try {
      const summaryRes = await getSummary(activePeriod);
      summary = summaryRes;

      try {
        const reimbRes = await getReimbursements(activePeriod);
        reimbursements = reimbRes.reimbursements;
      } catch {
        reimbursements = [];
      }
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

  async function handlePaid(item: ReimbursementItem) {
    payingId = item.id;
    error = '';
    try {
      await markReimbursementPaid(item.id);
      reimbursements = reimbursements.filter((r) => r.id !== item.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark as paid';
    } finally {
      payingId = null;
    }
  }
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
      <StatCard label="SISA" value={summary.totalSisa} accent="sisa" />
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
          <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Plan vs Expenses</h2>
          <label class="block space-y-1">
            <span class="text-[10px] text-zinc-500">Category</span>
            <select
              bind:value={planVsScope}
              class="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-black"
            >
              <option value="general">General (all categories)</option>
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
        <PieChart slices={planVsSlices} emptyLabel="No plan data" />
      </article>

      <article class="border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="mb-3">
          <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Plan Allocation</h2>
          <p class="mt-1 text-[10px] text-zinc-500">
            Share of total plan per category ({formatCurrency(summary.totalBudgetAllocated)}).
          </p>
        </div>
        <PieChart slices={allocationSlices} emptyLabel="Set plan in Plan tab" />
      </article>
    </div>

    <div class="space-y-2 md:space-y-3">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">By Category</h2>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {#each summary.categories.filter(categoryHasData) as item, i}
        <CategoryProgress {item} index={i} />
      {:else}
        <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 md:col-span-full">
          No budget data yet. Set your plan in the Plan tab.
        </p>
      {/each}
      </div>
    </div>

    <div class="space-y-2">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Reimbursements</h2>
      <p class="text-[10px] text-zinc-500">
        Plan owner paid by someone else — mark Paid when settled (updates Paid by in Detail).
      </p>

      {#if reimbursementTotals.length > 0}
        <div
          class="space-y-1.5 border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Totals owed</p>
          {#each reimbursementTotals as row (row.planPic + row.paidBy)}
            <div class="flex items-center justify-between gap-2 text-xs">
              <div class="flex min-w-0 items-center gap-1.5">
                <PicBadge name={row.planPic} />
                <span class="text-[10px] text-zinc-400" aria-hidden="true">→</span>
                <PicBadge name={row.paidBy} />
                <span
                  class="truncate text-[10px] text-zinc-500"
                  title="{row.planPic} owes {row.paidBy}"
                >
                  {picInitial(row.planPic)} owes {picInitial(row.paidBy)}
                </span>
              </div>
              <span class="shrink-0 font-mono tabular-nums">{formatCurrency(row.total)}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if reimbursements.length === 0}
        <p class="border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No pending reimbursements.
        </p>
      {:else}
        <div
          class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800 md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-zinc-200 md:dark:bg-zinc-800"
        >
          {#each reimbursements as item (item.id)}
            <div class="flex items-center gap-2 bg-white px-3 py-2.5 dark:bg-black md:gap-3 md:px-4 md:py-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{item.detail}</p>
                <p class="font-mono text-[11px] tabular-nums text-zinc-500">
                  {formatCurrency(item.cost)} · {item.categoryName}{#if item.subCategory?.trim()}
                    · {item.subCategory.trim()}{/if}
                </p>
                <p class="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                  <span>Plan {picInitial(item.planPic)}</span>
                  <span aria-hidden="true">→</span>
                  <span>By {picInitial(item.pic)}</span>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <PicBadge name={item.planPic} />
                <span class="text-[10px] text-zinc-400">→</span>
                <PicBadge name={item.pic} />
              </div>
              <button
                type="button"
                disabled={payingId === item.id}
                onclick={() => handlePaid(item)}
                class="shrink-0 border border-zinc-300 px-2 py-1 text-[10px] font-medium disabled:opacity-50 dark:border-zinc-600"
              >
                {payingId === item.id ? '…' : 'Paid'}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{:else}
  <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
    Unable to load overview. Try refreshing the page.
  </p>
{/if}
