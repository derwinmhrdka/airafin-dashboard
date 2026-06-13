<script lang="ts">
  import { page } from '$app/state';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import DetailPreview from '$lib/components/DetailPreview.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { categoryStyle } from '$lib/categories';
  import {
    createTransaction,
    deleteTransaction,
    getCategories,
    getPlan,
    getTransactions,
    updateTransaction,
  } from '$lib/api';
  import { formatAmountInput, formatCurrency, formatDate, parseAmountInput } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import { DEFAULT_PIC, PICS, type Pic } from '$lib/pics';
  import type { Category, Transaction } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const PAGE_SIZE = 5;

  let categories = $state<Category[]>([]);
  let categoryPicById = $state<Record<number, Pic>>({});
  let subPicByKey = $state<Record<string, Pic>>({});
  let subcategoriesByCategory = $state<Record<number, string[]>>({});
  let transactions = $state<Transaction[]>([]);
  let total = $state(0);
  let monthTotal = $state(0);
  let hasMore = $state(false);
  let loading = $state(true);
  let filterLoading = $state(false);
  let loadingMore = $state(false);
  let saving = $state(false);
  let deletingId = $state<number | null>(null);
  let error = $state('');
  let success = $state('');

  let filterCategory = $state('');
  let filterPic = $state('');
  let filterSearch = $state('');
  let debouncedSearch = $state('');
  let filtersReady = $state(false);

  let date = $state(new Date().toISOString().slice(0, 10));
  let categoryId = $state(0);
  let subCategory = $state('');
  let detail = $state('');
  let cost = $state('');
  let pic = $state<Pic>(DEFAULT_PIC);

  let editingId = $state<number | null>(null);
  let formEl = $state<HTMLFormElement | null>(null);

  function picForCategory(catId: number): Pic {
    const fromPlan = categoryPicById[catId];
    if (fromPlan && (PICS as readonly string[]).includes(fromPlan)) return fromPlan;
    return DEFAULT_PIC;
  }

  const hasActiveFilters = $derived(
    Boolean(filterCategory || filterPic || filterSearch.trim() || debouncedSearch.trim()),
  );

  const showFilters = $derived(monthTotal > 0 || hasActiveFilters);

  function currentFilters() {
    return {
      categoryId: filterCategory || undefined,
      pic: filterPic || undefined,
      search: debouncedSearch.trim() || undefined,
    };
  }

  function clearFilters() {
    filterCategory = '';
    filterPic = '';
    filterSearch = '';
    debouncedSearch = '';
  }

  const subCategoryOptions = $derived(subcategoriesByCategory[categoryId] ?? []);

  function expectedPlanPic(tx: Transaction): Pic | '' {
    const sub = tx.subCategory?.trim();
    if (sub) {
      const subPic = subPicByKey[`${tx.categoryId}|${sub.toLowerCase()}`];
      if (subPic) return subPic;
    }
    return categoryPicById[tx.categoryId] ?? '';
  }

  function picDiffersFromPlan(tx: Transaction): boolean {
    const planPic = expectedPlanPic(tx);
    const txPic = tx.pic?.trim() ?? '';
    if (!planPic || !txPic) return false;
    return txPic !== planPic;
  }

  function resetInsertForm() {
    date = new Date().toISOString().slice(0, 10);
    if (categories.length) categoryId = categories[0].id;
    subCategory = '';
    detail = '';
    cost = '';
    pic = picForCategory(categoryId);
  }

  function sheetsMessage(sync?: { status: string; error?: string }): string {
    if (sync?.status === 'synced') return ' (DB + spreadsheet)';
    if (sync?.status === 'failed') return ' — spreadsheet sync failed';
    return '';
  }

  async function loadTransactions(
    activePeriod: string,
    reset = false,
    opts?: { filterOnly?: boolean },
  ) {
    if (reset) {
      if (opts?.filterOnly) {
        filterLoading = true;
      } else {
        loading = true;
      }
    } else {
      if (!hasMore || loadingMore || loading || filterLoading) return;
      loadingMore = true;
    }

    error = '';
    try {
      const txRes = await getTransactions(activePeriod, {
        limit: PAGE_SIZE,
        offset: reset ? 0 : transactions.length,
        ...currentFilters(),
      });

      transactions = reset
        ? txRes.transactions
        : [...transactions, ...txRes.transactions];
      total = txRes.total;
      monthTotal = txRes.monthTotal;
      hasMore = txRes.hasMore;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load transactions';
    } finally {
      loading = false;
      filterLoading = false;
      loadingMore = false;
    }
  }

  async function loadData(activePeriod: string) {
    error = '';
    loading = true;
    try {
      const [catRes, plan] = await Promise.all([getCategories(), getPlan(activePeriod)]);
      categories = catRes.categories;
      categoryPicById = Object.fromEntries(
        plan.budgets
          .filter((b) => b.pic && (PICS as readonly string[]).includes(b.pic))
          .map((b) => [b.categoryId, b.pic as Pic]),
      );
      subPicByKey = Object.fromEntries(
        (plan.subcategories ?? [])
          .filter((s) => s.pic && (PICS as readonly string[]).includes(s.pic))
          .map((s) => [`${s.categoryId}|${s.name.trim().toLowerCase()}`, s.pic as Pic]),
      );
      subcategoriesByCategory = Object.fromEntries(
        categories.map((cat) => [
          cat.id,
          (plan.subcategories ?? [])
            .filter((s) => s.categoryId === cat.id)
            .map((s) => s.name),
        ]),
      );
      if (!categoryId && categories.length) categoryId = categories[0].id;
      pic = picForCategory(categoryId);
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

  $effect(() => {
    const q = filterSearch;
    const timer = setTimeout(() => {
      debouncedSearch = q;
    }, 300);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    filterCategory;
    filterPic;
    debouncedSearch;
    if (!filtersReady) {
      filtersReady = true;
      return;
    }
    void loadTransactions(period, true, { filterOnly: true });
  });

  $effect(() => {
    if (!categoryId) return;
    if (editingId == null) {
      pic = picForCategory(categoryId);
    }
    if (subCategoryOptions.length === 0) {
      subCategory = '';
    } else if (subCategory && !subCategoryOptions.includes(subCategory)) {
      subCategory = '';
    }
  });

  function startEdit(tx: Transaction) {
    editingId = tx.id;
    date = tx.date;
    categoryId = tx.categoryId;
    subCategory = tx.subCategory ?? '';
    detail = tx.detail;
    cost = formatAmountInput(tx.cost);
    pic = (PICS as readonly string[]).includes(tx.pic) ? (tx.pic as Pic) : picForCategory(tx.categoryId);
    error = '';
    success = '';
    queueMicrotask(() => {
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function cancelEdit() {
    editingId = null;
    resetInsertForm();
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    error = '';
    success = '';

    const body = {
      date,
      categoryId,
      subCategory: subCategory.trim(),
      detail,
      cost: parseAmountInput(cost),
      pic,
    };

    try {
      if (editingId != null) {
        const id = editingId;
        const result = await updateTransaction(id, body);
        success = `Transaction #${id} updated${sheetsMessage(result.sheetsSync)}`;
        if (result.sheetsSync?.status === 'failed') {
          error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
        }
        editingId = null;
        resetInsertForm();
      } else {
        const result = await createTransaction({ ...body, period });
        success = `Transaction saved${sheetsMessage(result.sheetsSync)}`;
        if (result.sheetsSync?.status === 'failed') {
          error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
        }
        detail = '';
        cost = '';
      }
      await loadTransactions(period, true);
    } catch (e) {
      error = e instanceof Error ? e.message : editingId != null ? 'Failed to update' : 'Failed to save';
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
      if (editingId === id) {
        editingId = null;
        resetInsertForm();
      }
      success = `Deleted "${detail}"${sheetsMessage(result.sheetsSync)}`;
      if (result.sheetsSync?.status === 'failed') {
        error = result.sheetsSync.error ?? 'Spreadsheet sync failed';
      }
      transactions = transactions.filter((tx) => tx.id !== id);
      total = Math.max(0, total - 1);
      monthTotal = Math.max(0, monthTotal - 1);
      hasMore = transactions.length < total;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete';
    } finally {
      deletingId = null;
    }
  }
</script>

<section class="space-y-4 lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
  <form
    bind:this={formEl}
    onsubmit={handleSubmit}
    class="space-y-3 border p-3 scroll-mt-3 lg:sticky lg:top-4
      {editingId != null
      ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
      : 'border-zinc-200 dark:border-zinc-800'}"
  >
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {#if editingId != null}
          Edit #{editingId} · {period}
        {:else}
          Quick Insert · {period}
        {/if}
      </h2>
      {#if editingId != null}
        <button
          type="button"
          onclick={cancelEdit}
          class="flex h-7 w-7 shrink-0 items-center justify-center border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          aria-label="Cancel edit"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label class="min-w-0 space-y-1">
        <span class="text-[11px] text-zinc-500">Date</span>
        <input
          type="date"
          bind:value={date}
          required
          class="box-border w-full min-w-0 max-w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
      </label>
      <label class="min-w-0 space-y-1">
        <span class="text-[11px] text-zinc-500">Cost</span>
        <AmountInput bind:value={cost} required />
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

    {#if subCategoryOptions.length > 0}
      <label class="block space-y-1">
        <span class="text-[11px] text-zinc-500">Sub Category</span>
        <select
          bind:value={subCategory}
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        >
          <option value="">Main (default)</option>
          {#each subCategoryOptions as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
    {/if}

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
      <span class="text-[11px] text-zinc-500">Paid by</span>
      <select
        bind:value={pic}
        class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        aria-label="Paid by"
      >
        {#each PICS as p}
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
      disabled={saving || loading}
      class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
    >
      {saving ? 'Saving…' : editingId != null ? 'Save Changes' : 'Add Transaction'}
    </button>
  </form>

  <div class="min-w-0 space-y-2">
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

    {#if showFilters}
      <div class="space-y-2 border border-zinc-200 p-2 dark:border-zinc-800">
        <input
          type="search"
          bind:value={filterSearch}
          placeholder="Search detail…"
          enterkeyhint="search"
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
            <option value="">All paid by</option>
            {#each PICS as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </div>
        <p class="text-[10px] text-zinc-500">
          {transactions.length} loaded of {total}{hasActiveFilters ? ' matching' : ''}
          {#if hasActiveFilters && monthTotal > total}
            · {monthTotal} total this month
          {/if}
        </p>
      </div>
    {/if}

    {#if loading}
      <div class="h-32 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
    {:else if monthTotal === 0}
      <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No transactions this month.
      </p>
    {:else if total === 0 && !filterLoading}
      <p class="border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No transactions match your filters.
      </p>
    {:else}
      <div
        class="overflow-x-auto border border-zinc-200 transition-opacity dark:border-zinc-800
          {filterLoading ? 'pointer-events-none opacity-50' : ''}"
      >
        <table class="w-full text-left text-xs">
          <thead class="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th class="px-2 py-2 text-center font-medium">Date</th>
              <th class="px-2 py-2 text-center font-medium">Cat</th>
              <th class="px-2 py-2 text-center font-medium">Sub</th>
              <th class="px-2 py-2 text-center font-medium">Detail</th>
              <th class="px-2 py-2 text-center font-medium">Cost</th>
              <th class="px-2 py-2 text-center font-medium">By</th>
              <th class="px-2 py-2 text-center font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {#each transactions as tx}
              {@const style = categoryStyle(tx.categoryName)}
              {@const picMismatch = picDiffersFromPlan(tx)}
              <tr
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-900
                  {picMismatch ? 'bg-amber-50 dark:bg-amber-950/35' : ''}
                  {editingId === tx.id ? 'ring-1 ring-inset ring-amber-400 dark:ring-amber-600' : ''}"
              >
                <td class="px-2 py-2 whitespace-nowrap text-zinc-500">{formatDate(tx.date)}</td>
                <td class="px-2 py-2">
                  <span class="rounded px-1.5 py-0.5 text-[10px] {style.bg} {style.text}">
                    {tx.categoryName.slice(0, 8)}
                  </span>
                </td>
                <td class="max-w-[56px] truncate px-2 py-2 text-[10px] text-zinc-500 md:max-w-[8rem]">
                  {tx.subCategory?.trim() || '—'}
                </td>
                <td class="max-w-[96px] px-2 py-2 md:max-w-none md:min-w-[10rem]">
                  <DetailPreview text={tx.detail} />
                </td>
                <td class="px-2 py-2 text-right font-mono tabular-nums">
                  {formatCurrency(tx.cost)}
                </td>
                <td class="px-2 py-2 text-center">
                  {#if tx.pic?.trim()}
                    <PicBadge name={tx.pic} />
                  {:else}
                    <span class="text-[10px] text-zinc-400">—</span>
                  {/if}
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
