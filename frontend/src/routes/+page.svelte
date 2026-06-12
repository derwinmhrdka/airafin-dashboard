<script lang="ts">
  import { page } from '$app/state';
  import CategoryProgress from '$lib/components/CategoryProgress.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { getReimbursements, getSummary, markReimbursementPaid } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import { picInitial } from '$lib/pics';
  import type { DashboardSummary, ReimbursementItem } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));

  let summary = $state<DashboardSummary | null>(null);
  let reimbursements = $state<ReimbursementItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let payingId = $state<number | null>(null);

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
  <section class="space-y-4">
    <p class="text-[11px] uppercase tracking-wider text-zinc-500">Overview · {period}</p>
    <div class="grid min-w-0 grid-cols-3 gap-1">
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

    <div class="space-y-2">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">By Category</h2>
      {#each summary.categories.filter((c) => c.allocated > 0 || c.spent > 0) as item, i}
        <CategoryProgress {item} index={i} />
      {:else}
        <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No budget data yet. Set your plan in the Plan tab.
        </p>
      {/each}
    </div>

    <div class="space-y-2">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Reimbursements</h2>
      <p class="text-[10px] text-zinc-500">
        Plan PIC paid by someone else — mark Paid when settled (updates PIC in Detail).
      </p>

      {#if reimbursements.length === 0}
        <p class="border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No pending reimbursements.
        </p>
      {:else}
        <div class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {#each reimbursements as item (item.id)}
            <div class="flex items-center gap-2 px-3 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{item.detail}</p>
                <p class="font-mono text-[11px] tabular-nums text-zinc-500">
                  {formatCurrency(item.cost)} · {item.categoryName}
                </p>
                <p class="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                  <span>Plan {picInitial(item.planPic)}</span>
                  <span aria-hidden="true">→</span>
                  <span>Paid {picInitial(item.pic)}</span>
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
