<script lang="ts">
  import { page } from '$app/stores';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { categoryStyle } from '$lib/categories';
  import {
    createTransaction,
    deleteTransaction,
    getCategories,
    getTransactions,
    updateTransaction,
  } from '$lib/api';
  import { formatCurrency, formatDate } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import type { Category, Transaction } from '$lib/types';

  const period = $derived(periodFromUrl($page.url.searchParams));
  const pics = ['Derwin', 'Anggita'] as const;
  const PAGE_SIZE = 5;

  let categories = $state<Category[]>([]);
  let transactions = $state<Transaction[]>([]);
  let total = $state(0);
  let hasMore = $state(false);
  let loading = $state(true);
  let loadingMore = $state(false);
  let saving = $state(false);
  let deletingId = $state<number | null>(null);
  let error = $state('');
  let success = $state('');

  let filterCategory = $state('');
  let filterPic = $state('');
  let filterSearch = $state('');

  let date = $state(new Date().toISOString().slice(0, 10));
  let categoryId = $state(0);
  let detail = $state('');
  let cost = $state('');
  let pic = $state<(typeof pics)[number]>('Derwin');

  let editingId = $state<number | null>(null);
  let editDate = $state('');
  let editCategoryId = $state(0);
  let editDetail = $state('');
  let editCost = $state('');
  let editPic = $state<(typeof pics)[number]>('Derwin');

  const filteredTransactions = $derived(
    transactions.filter((tx) => {
      if (filterCategory && tx.categoryId !== Number(filterCategory)) return false;
      if (filterPic && tx.pic !== filterPic) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        if (!tx.detail.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
  );

  const hasActiveFilters = $derived(
    Boolean(filterCategory || filterPic || filterSearch.trim()),
  );

  function clearFilters() {
    filterCategory = '';
    filterPic = '';
    filterSearch = '';
  }

  function sheetsMessage(sync?: { status: string; error?: string }): string {
    if (sync?.status === 'synced') return ' (DB + spreadsheet)';
    if (sync?.status === 'failed') return ' — spreadsheet sync failed';
    return '';
  }

  async function loadTransactions(activePeriod: string, reset = false) {
    if (reset) {
      loading = true;
    } else {
      if (!hasMore || loadingMore || loading) return;
      loadingMore = true;
    }

    error = '';
    try {
      const txRes = await getTransactions(activePeriod, {
        limit: PAGE_SIZE,
        offset: reset ? 0 : transactions.length,
      });

      transactions = reset
        ? txRes.transactions
        : [...transactions, ...txRes.transactions];
      total = txRes.total;
      hasMore = txRes.hasMore;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load transactions';
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function loadData(activePeriod: string) {
    error = '';
    loading = true;
    try {
      const catRes = await getCategories();
      categories = catRes.categories;
      if (!categoryId && categories.length) categoryId = categories[0].id;
      await loadTransactions(activePeriod, true);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
      loading = false;
    }
  }

  function infiniteScroll(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadTransactions(period, false);
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  $effect(() => {
    void loadData(period);
  });

  function startEdit(tx: Transaction) {
    editingId = tx.id;
    editDate = tx.date;
    editCategoryId = tx.categoryId;
    editDetail = tx.detail;
    editCost = tx.cost;
    editPic = tx.pic as (typeof pics)[number];
    error = '';
    success = '';
  }

  function cancelEdit() {
    editingId = null;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    error = '';
    success = '';

    try {
      const result = await createTransaction({
        date,
        categoryId,
        detail,
        cost: Number.parseFloat(cost),
        period,
        pic,
      });
      detail = '';
      cost = '';
      success = `Transaction saved${sheetsMessage(result.sheetsSync)}`;
      if (result.sheetsSync?.status === 'failed') {
        error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
      }
      await loadTransactions(period, true);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function handleEditSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (editingId == null) return;

    saving = true;
    error = '';
    success = '';

    try {
      const result = await updateTransaction(editingId, {
        date: editDate,
        categoryId: editCategoryId,
        detail: editDetail,
        cost: Number.parseFloat(editCost),
        pic: editPic,
      });
      success = `Transaction #${editingId} updated${sheetsMessage(result.sheetsSync)}`;
      if (result.sheetsSync?.status === 'failed') {
        error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
      }
      editingId = null;
      await loadTransactions(period, true);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update';
    } finally {
      saving = false;
    }
  }

  async function handleDelete(id: number, detail: string) {
    if (!confirm(`Delete "${detail}"?`)) return;

    deletingId = id;
    error = '';
    success = '';

    try {
      const result = await deleteTransaction(id);
      if (editingId === id) editingId = null;
      success = `Deleted "${detail}"${sheetsMessage(result.sheetsSync)}`;
      if (result.sheetsSync?.status === 'failed') {
        error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
      }
      transactions = transactions.filter((tx) => tx.id !== id);
      total = Math.max(0, total - 1);
      hasMore = transactions.length < total;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete';
    } finally {
      deletingId = null;
    }
  }
</script>

<section class="space-y-4">
  <form onsubmit={handleSubmit} class="space-y-3 border border-zinc-200 p-3 dark:border-zinc-800">
    <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Quick Insert</h2>

    <div class="grid grid-cols-2 gap-2">
      <label class="space-y-1">
        <span class="text-[11px] text-zinc-500">Date</span>
        <input
          type="date"
          bind:value={date}
          required
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
      </label>
      <label class="space-y-1">
        <span class="text-[11px] text-zinc-500">Cost</span>
        <input
          type="number"
          inputmode="decimal"
          bind:value={cost}
          required
          min="0"
          step="any"
          placeholder="0"
          class="w-full border border-zinc-200 bg-white px-2 py-2 font-mono text-sm dark:border-zinc-800 dark:bg-black"
        />
      </label>
    </div>

    <label class="block space-y-1">
      <span class="text-[11px] text-zinc-500">Category</span>
      <select
        bind:value={categoryId}
        required
        class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      >
        {#each categories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </label>

    <label class="block space-y-1">
      <span class="text-[11px] text-zinc-500">Detail</span>
      <input
        type="text"
        bind:value={detail}
        required
        placeholder="What was this for?"
        class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      />
    </label>

    <label class="block space-y-1">
      <span class="text-[11px] text-zinc-500">PIC</span>
      <select
        bind:value={pic}
        class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      >
        {#each pics as p}
          <option value={p}>{p}</option>
        {/each}
      </select>
    </label>

    {#if error && !editingId}
      <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
    {/if}
    {#if success && !editingId}
      <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
    {/if}

    <button
      type="submit"
      disabled={saving || loading}
      class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
    >
      {saving ? 'Saving…' : 'Add Transaction'}
    </button>
  </form>

  {#if editingId != null}
    <form onsubmit={handleEditSubmit} class="space-y-3 border border-zinc-400 p-3 dark:border-zinc-600">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Edit #{editingId}
        </h2>
        <button
          type="button"
          onclick={cancelEdit}
          class="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="text-[11px] text-zinc-500">Date</span>
          <input
            type="date"
            bind:value={editDate}
            required
            class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
          />
        </label>
        <label class="space-y-1">
          <span class="text-[11px] text-zinc-500">Cost</span>
          <input
            type="number"
            inputmode="decimal"
            bind:value={editCost}
            required
            min="0"
            step="any"
            class="w-full border border-zinc-200 bg-white px-2 py-2 font-mono text-sm dark:border-zinc-800 dark:bg-black"
          />
        </label>
      </div>

      <label class="block space-y-1">
        <span class="text-[11px] text-zinc-500">Category</span>
        <select
          bind:value={editCategoryId}
          required
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        >
          {#each categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-[11px] text-zinc-500">Detail</span>
        <input
          type="text"
          bind:value={editDetail}
          required
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
      </label>

      <label class="block space-y-1">
        <span class="text-[11px] text-zinc-500">PIC</span>
        <select
          bind:value={editPic}
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        >
          {#each pics as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>

      {#if error}
        <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
      {/if}
      {#if success}
        <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
      {/if}

      <button
        type="submit"
        disabled={saving}
        class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  {/if}

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Recent — {period}
      </h2>
      {#if hasActiveFilters}
        <button
          type="button"
          onclick={clearFilters}
          class="text-[10px] text-zinc-500 underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      {/if}
    </div>

    {#if !loading && total > 0}
      <div class="space-y-2 border border-zinc-200 p-2 dark:border-zinc-800">
        <input
          type="search"
          bind:value={filterSearch}
          placeholder="Search detail…"
          class="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-black"
        />
        <div class="grid grid-cols-2 gap-2">
          <select
            bind:value={filterCategory}
            class="border border-zinc-200 bg-white px-1.5 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-black"
          >
            <option value="">All categories</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
          <select
            bind:value={filterPic}
            class="border border-zinc-200 bg-white px-1.5 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-black"
          >
            <option value="">All PIC</option>
            {#each pics as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </div>
        <p class="text-[10px] text-zinc-500">
          {filteredTransactions.length} shown · loaded {transactions.length} of {total}
        </p>
      </div>
    {/if}

    {#if loading}
      <div class="h-32 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
    {:else if total === 0}
      <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No transactions this month.
      </p>
    {:else if filteredTransactions.length === 0}
      <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No transactions match your filters.
      </p>
    {:else}
      <div class="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th class="px-2 py-2 font-medium">Date</th>
              <th class="px-2 py-2 font-medium">Cat</th>
              <th class="px-2 py-2 font-medium">Detail</th>
              <th class="px-2 py-2 text-right font-medium">Cost</th>
              <th class="px-2 py-2 text-center font-medium">PIC</th>
              <th class="px-2 py-2 text-center font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredTransactions as tx}
              {@const style = categoryStyle(tx.categoryName)}
              <tr
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-900
                  {editingId === tx.id ? 'bg-zinc-50 dark:bg-zinc-900' : ''}"
              >
                <td class="px-2 py-2 whitespace-nowrap text-zinc-500">{formatDate(tx.date)}</td>
                <td class="px-2 py-2">
                  <span class="rounded px-1.5 py-0.5 text-[10px] {style.bg} {style.text}">
                    {tx.categoryName.slice(0, 8)}
                  </span>
                </td>
                <td class="max-w-[96px] truncate px-2 py-2" title={tx.detail}>{tx.detail}</td>
                <td class="px-2 py-2 text-right font-mono tabular-nums">
                  {formatCurrency(tx.cost)}
                </td>
                <td class="px-2 py-2 text-center">
                  <PicBadge name={tx.pic} />
                </td>
                <td class="px-1 py-2">
                  <div class="flex justify-center gap-1">
                    <button
                      type="button"
                      onclick={() => startEdit(tx)}
                      class="flex h-7 w-7 items-center justify-center border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      aria-label="Edit transaction"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onclick={() => handleDelete(tx.id, tx.detail)}
                      disabled={deletingId === tx.id}
                      class="flex h-7 w-7 items-center justify-center border border-red-200 text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
                      aria-label="Delete transaction"
                    >
                      {#if deletingId === tx.id}
                        <span class="text-[10px]">…</span>
                      {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      {/if}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if hasMore}
          <div
            use:infiniteScroll
            class="flex items-center justify-center border-t border-zinc-200 py-3 text-[10px] text-zinc-500 dark:border-zinc-800"
          >
            {loadingMore ? 'Loading more…' : 'Scroll for more'}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>
