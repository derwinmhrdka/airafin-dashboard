<script lang="ts">
  import { page } from '$app/stores';
  import CategoryProgress from '$lib/components/CategoryProgress.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { getSummary, getTransactions, updateTransactionStatus } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import type { DashboardSummary, Transaction } from '$lib/types';

  const statuses = ['Done', 'On Going', 'Not Yet'] as const;

  const period = $derived(periodFromUrl($page.url.searchParams));

  let summary = $state<DashboardSummary | null>(null);
  let transactions = $state<Transaction[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filterStatus = $state('');
  let updatingId = $state<number | null>(null);

  const filteredTransactions = $derived(
    filterStatus
      ? transactions.filter((tx) => tx.status === filterStatus)
      : transactions,
  );

  async function loadData(activePeriod: string) {
    loading = true;
    error = '';
    try {
      const [summaryRes, txRes] = await Promise.all([
        getSummary(activePeriod),
        getTransactions(activePeriod),
      ]);
      summary = summaryRes;
      transactions = txRes.transactions;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load summary';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadData(period);
  });

  async function handleStatusChange(id: number, status: string) {
    updatingId = id;
    try {
      const { transaction } = await updateTransactionStatus(id, status);
      transactions = transactions.map((tx) => (tx.id === id ? { ...tx, status: transaction.status } : tx));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update status';
    } finally {
      updatingId = null;
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
    <div class="grid grid-cols-3 gap-2">
      <StatCard label="Income" value={summary.totalIncome} accent="income" />
      <StatCard label="Spent" value={summary.totalSpent} accent="spent" />
      <StatCard label="SISA" value={summary.totalSisa} accent="sisa" />
    </div>

    <div class="flex items-center justify-between border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
      <span class="text-zinc-500">Total Plan</span>
      <span class="font-mono tabular-nums">{summary.totalBudgetAllocated.toLocaleString('id-ID')}</span>
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
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Status</h2>
        <select
          bind:value={filterStatus}
          class="border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-zinc-800 dark:bg-black"
        >
          <option value="">All</option>
          {#each statuses as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      {#if filteredTransactions.length === 0}
        <p class="border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No transactions for this status.
        </p>
      {:else}
        <div class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {#each filteredTransactions as tx (tx.id)}
            <div class="flex items-center gap-2 px-3 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{tx.detail}</p>
                <p class="font-mono text-[11px] tabular-nums text-zinc-500">
                  {formatCurrency(tx.cost)} · {tx.categoryName}
                </p>
              </div>
              <PicBadge name={tx.pic} />
              <select
                value={tx.status}
                disabled={updatingId === tx.id}
                onchange={(e) => handleStatusChange(tx.id, e.currentTarget.value)}
                class="max-w-[5.5rem] border border-zinc-200 bg-white px-1 py-1 text-[10px] dark:border-zinc-800 dark:bg-black"
              >
                {#each statuses as s}
                  <option value={s}>{s}</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}
