<script lang="ts">
  import { page } from '$app/state';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import DetailPreview from '$lib/components/DetailPreview.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { categoryStyle, defaultCategoryId } from '$lib/categories';
  import {
    createTransaction,
    deleteTransaction,
    getCategories,
    getPlan,
    getSummary,
    getTransactions,
    suggestTransactions,
    updateTransaction,
  } from '$lib/api';
  import { formatAmountInput, formatCurrency, formatDate, parseAmountInput } from '$lib/format';
  import { MAIN_SUB_LABEL } from '$lib/plan-allocations';
  import { periodFromUrl } from '$lib/period';
  import { defaultPic, isKnownPic, picNames, type Pic } from '$lib/pics';
  import type { Category, DashboardSummary, Transaction, TransactionSuggestion } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const picList = $derived($picNames);
  const PAGE_SIZE = 5;

  let categories = $state<Category[]>([]);
  let categoryPicById = $state<Record<number, Pic>>({});
  let subPicByKey = $state<Record<string, Pic>>({});
  let subcategoriesByCategory = $state<Record<number, string[]>>({});
  let subSisaByKey = $state<Record<string, number>>({});
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
  let pic = $state<Pic>(defaultPic());

  let editingId = $state<number | null>(null);
  let formEl = $state<HTMLFormElement | null>(null);

  let suggestions = $state<TransactionSuggestion[]>([]);
  let suggestOpen = $state(false);
  let suggestLoading = $state(false);
  let suggestIndex = $state(-1);
  let suggestSeq = 0;
  let skipSuggest = $state(false);
  let skipPicAuto = $state(false);

  function defaultPicForSelection(catId: number, sub: string = subCategory): Pic {
    const trimmed = sub.trim();
    if (trimmed) {
      const subPic = subPicByKey[`${catId}|${trimmed.toLowerCase()}`];
      if (subPic && isKnownPic(subPic, picList)) return subPic;
    }
    const fromPlan = categoryPicById[catId];
    if (fromPlan && isKnownPic(fromPlan, picList)) return fromPlan;
    return defaultPic(picList);
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

  const selectedSubRemaining = $derived.by(() => {
    if (subCategoryOptions.length === 0) return null;
    const key = `${categoryId}|${(subCategory.trim() || MAIN_SUB_LABEL).toLowerCase()}`;
    const value = subSisaByKey[key];
    return value === undefined ? null : value;
  });

  function applySummary(summary: DashboardSummary) {
    const map: Record<string, number> = {};
    for (const cat of summary.categories) {
      for (const sub of cat.subcategories ?? []) {
        map[`${cat.categoryId}|${sub.name.trim().toLowerCase()}`] = sub.sisa;
      }
    }
    subSisaByKey = map;
  }

  function expectedPlanPic(tx: Transaction): Pic | '' {
    const sub = tx.subCategory?.trim();
    if (sub) {
      const subPic = subPicByKey[`${tx.categoryId}|${sub.toLowerCase()}`];
      if (subPic) return subPic;
    }
    return categoryPicById[tx.categoryId] ?? '';
  }

  function picDiffersFromPlan(tx: Transaction): boolean {
    if (tx.status === 'Transfer' || tx.status === 'Carryover') return false;
    const planPic = expectedPlanPic(tx);
    const txPic = tx.pic?.trim() ?? '';
    if (!planPic || !txPic) return false;
    return txPic !== planPic;
  }

  function isBudgetMove(tx: Transaction): boolean {
    return tx.status === 'Transfer';
  }

  function isCarryover(tx: Transaction): boolean {
    return tx.status === 'Carryover';
  }

  function resetInsertForm() {
    date = new Date().toISOString().slice(0, 10);
    if (categories.length) categoryId = defaultCategoryId(categories);
    subCategory = '';
    detail = '';
    cost = '';
    skipPicAuto = false;
    pic = defaultPicForSelection(categoryId);
    clearSuggestions();
  }

  function clearSuggestions() {
    suggestions = [];
    suggestOpen = false;
    suggestIndex = -1;
    suggestLoading = false;
  }

  async function loadSuggestions(query: string) {
    const q = query.trim();
    if (q.length < 3) {
      clearSuggestions();
      return;
    }
    const seq = ++suggestSeq;
    suggestLoading = true;
    try {
      const res = await suggestTransactions(q, 5);
      if (seq !== suggestSeq) return;
      suggestions = res.suggestions;
      suggestOpen = res.suggestions.length > 0;
      suggestIndex = res.suggestions.length > 0 ? 0 : -1;
    } catch {
      if (seq !== suggestSeq) return;
      clearSuggestions();
    } finally {
      if (seq === suggestSeq) suggestLoading = false;
    }
  }

  function applySuggestion(item: TransactionSuggestion) {
    skipSuggest = true;
    skipPicAuto = true;
    detail = item.detail;
    if (!cost.trim()) {
      cost = formatAmountInput(item.cost);
    }
    if (categories.some((c) => c.id === item.categoryId)) {
      categoryId = item.categoryId;
      const opts = subcategoriesByCategory[item.categoryId] ?? [];
      const sub = item.subCategory?.trim() ?? '';
      subCategory = sub && opts.includes(sub) ? sub : '';
    }
    if (isKnownPic(item.pic, picList)) {
      pic = item.pic;
    } else {
      pic = defaultPicForSelection(categoryId, subCategory);
    }
    clearSuggestions();
  }

  function onDetailInput() {
    skipSuggest = false;
  }

  function onDetailKeydown(e: KeyboardEvent) {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = (suggestIndex + 1) % suggestions.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = (suggestIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === 'Enter' && suggestIndex >= 0 && suggestIndex < suggestions.length) {
      e.preventDefault();
      applySuggestion(suggestions[suggestIndex]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearSuggestions();
    }
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
      const [catRes, plan, summary] = await Promise.all([
        getCategories(),
        getPlan(activePeriod),
        getSummary(activePeriod),
      ]);
      categories = catRes.categories;
      categoryPicById = Object.fromEntries(
        plan.budgets
          .filter((b) => b.pic && isKnownPic(b.pic, picList))
          .map((b) => [b.categoryId, b.pic as Pic]),
      );
      subPicByKey = Object.fromEntries(
        (plan.subcategories ?? [])
          .filter((s) => s.pic && isKnownPic(s.pic, picList))
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
      applySummary(summary);
      if (!categoryId && categories.length) categoryId = defaultCategoryId(categories);
      pic = defaultPicForSelection(categoryId);
      await loadTransactions(activePeriod, true);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
      loading = false;
    }
  }

  async function refreshSubRemaining(activePeriod: string) {
    try {
      applySummary(await getSummary(activePeriod));
    } catch {
      /* keep last known */
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
    const q = detail;
    if (skipSuggest) return;
    const timer = setTimeout(() => {
      void loadSuggestions(q);
    }, 350);
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
    if (subCategoryOptions.length === 0) {
      subCategory = '';
    } else if (subCategory && !subCategoryOptions.includes(subCategory)) {
      subCategory = '';
    }
    if (editingId == null && !skipPicAuto) {
      pic = defaultPicForSelection(categoryId, subCategory);
    }
  });

  function startEdit(tx: Transaction) {
    skipSuggest = true;
    editingId = tx.id;
    date = tx.date;
    categoryId = tx.categoryId;
    subCategory = tx.subCategory ?? '';
    detail = tx.detail;
    cost = formatAmountInput(tx.cost);
    pic = isKnownPic(tx.pic, picList)
      ? tx.pic
      : defaultPicForSelection(tx.categoryId, tx.subCategory ?? '');
    error = '';
    success = '';
    clearSuggestions();
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
      void refreshSubRemaining(period);
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
      void refreshSubRemaining(period);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete';
    } finally {
      deletingId = null;
    }
  }

  const fieldClass =
    'w-full border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600';
  const labelClass = 'text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400';
</script>

<section class="space-y-4 lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
  <form
    bind:this={formEl}
    onsubmit={handleSubmit}
    class="space-y-3.5 border p-3.5 scroll-mt-3 lg:sticky lg:top-4
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

    <label class="block space-y-1.5">
      <span class={labelClass}>Date</span>
      <input type="date" bind:value={date} required class="box-border min-w-0 max-w-full {fieldClass}" />
    </label>

    <label class="block space-y-1.5">
      <span class={labelClass}>Category</span>
      <select
        bind:value={categoryId}
        required
        class={fieldClass}
        onchange={() => {
          skipPicAuto = false;
        }}
      >
        {#each categories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </label>

    {#if subCategoryOptions.length > 0}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <label for="detail-sub-category" class={labelClass}>Sub Category</label>
          {#if selectedSubRemaining != null}
            <span
              class="inline-flex items-center gap-1 font-mono text-[10px] font-light tabular-nums
                {selectedSubRemaining < 0
                ? 'text-red-500/90 dark:text-red-400/90'
                : 'text-zinc-400'}"
              title="Remaining balance"
              aria-label="Remaining {formatCurrency(selectedSubRemaining)}"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="opacity-70"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12" />
                <path d="M8 10h6a2 2 0 1 1 0 4H8" />
              </svg>
              {formatCurrency(selectedSubRemaining)}
            </span>
          {/if}
        </div>
        <select
          id="detail-sub-category"
          bind:value={subCategory}
          class={fieldClass}
          onchange={() => {
            skipPicAuto = false;
          }}
        >
          <option value="">{MAIN_SUB_LABEL}</option>
          {#each subCategoryOptions as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="relative space-y-1.5">
      <label for="detail-text" class={labelClass}>Detail</label>
      <input
        id="detail-text"
        type="text"
        bind:value={detail}
        required
        placeholder="What was this for?"
        autocomplete="off"
        class={fieldClass}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestOpen}
        aria-controls="detail-suggestions"
        aria-activedescendant={suggestIndex >= 0 ? `detail-suggestion-${suggestIndex}` : undefined}
        oninput={onDetailInput}
        onkeydown={onDetailKeydown}
        onblur={() => {
          // Delay so mousedown/click on suggestion can fire first.
          setTimeout(() => clearSuggestions(), 150);
        }}
      />
      {#if suggestOpen && suggestions.length > 0}
        <ul
          id="detail-suggestions"
          role="listbox"
          class="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {#each suggestions as item, i (item.id)}
            <li role="option" aria-selected={suggestIndex === i} id="detail-suggestion-{i}">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left text-xs transition
                  {suggestIndex === i
                  ? 'bg-zinc-100 dark:bg-zinc-900'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/70'}"
                onmousedown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
                onmouseenter={() => (suggestIndex = i)}
              >
                <span class="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {item.detail}
                </span>
                <span class="shrink-0 font-mono tabular-nums text-zinc-500">
                  {formatCurrency(item.cost)}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if suggestLoading && detail.trim().length >= 3}
        <p class="text-[10px] font-light text-zinc-400">Looking up…</p>
      {/if}
    </div>

    <label class="block space-y-1.5">
      <span class={labelClass}>Cost</span>
      <AmountInput bind:value={cost} required class={fieldClass} />
    </label>

    <div class="space-y-1.5">
      <span class={labelClass} id="detail-paid-by-label">Paid By</span>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="detail-paid-by-label">
        {#each picList as p}
          <button
            type="button"
            onclick={() => (pic = p)}
            class="inline-flex items-center gap-2 border px-2.5 py-1.5 text-xs transition
              {pic === p
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-300 dark:hover:border-zinc-600'}"
            aria-pressed={pic === p}
            aria-label="Paid by {p}"
          >
            <span class="scale-110">
              <PicBadge name={p} />
            </span>
            <span class="font-medium">{p}</span>
          </button>
        {/each}
      </div>
    </div>

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
            aria-label="Category"
          >
            <option value="">All categories</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
          <select
            bind:value={filterPic}
            class="border border-zinc-200 bg-white px-1.5 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-black"
            aria-label="Paid by"
          >
            <option value="">All paid by</option>
            {#each picList as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </div>
        <p class="text-[10px] text-zinc-500">
          {transactions.length} loaded of {total}{hasActiveFilters ? ' matching' : ''}
          {#if hasActiveFilters && monthTotal > total}
            · {monthTotal} this month
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
        No matches.
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
              {@const budgetMove = isBudgetMove(tx)}
              {@const carryover = isCarryover(tx)}
              <tr
                class="border-b border-zinc-100 last:border-0 dark:border-zinc-900
                  {budgetMove ? 'bg-sky-50/70 dark:bg-sky-950/25' : ''}
                  {carryover ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : ''}
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
                  {#if budgetMove}
                    <span class="mr-1 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">Move</span>
                  {:else if carryover}
                    <span class="mr-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">Carry</span>
                  {/if}
                  <DetailPreview text={tx.detail} />
                </td>
                <td class="px-2 py-2 text-right font-mono tabular-nums {budgetMove ? 'text-sky-700 dark:text-sky-300' : ''} {carryover ? 'text-emerald-700 dark:text-emerald-300' : ''}">
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
            {loadingMore ? 'Loading…' : 'Scroll for more'}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>
