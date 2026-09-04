<script lang="ts">
  import { page } from '$app/state';
  import {
    closeMonth,
    getCategories,
    getPlan,
    getPockets,
    getSummary,
    transferBudget,
    type CloseMonthBucket,
  } from '$lib/api';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import TransferPanel from '$lib/components/TransferPanel.svelte';
  import { withDeferredLoading } from '$lib/deferred-loading';
  import { formatAmountInput, formatCurrency, parseAmountInput } from '$lib/format';
  import { MAIN_SUB_LABEL } from '$lib/plan-allocations';
  import { periodFromUrl, shiftPeriod } from '$lib/period';
  import { defaultPic, isKnownPic, type Pic } from '$lib/pics';
  import type { Category, PlanChecklistItem } from '$lib/types';

  const DEFAULT_POCKETS = ['BCA', 'MANDIRI', 'SUPA', 'DANA', 'OVO', 'CASH', 'BIBIT'] as const;
  type Pocket = string;
  const DEFAULT_POCKET: Pocket = 'BCA';

  const period = $derived(periodFromUrl(page.url.searchParams));

  interface SubcategoryRow {
    key: string;
    name: string;
    amount: string;
    pic: Pic;
    pocket: Pocket;
  }

  let categories = $state<Category[]>([]);
  let subcategoryInputs = $state<Record<number, SubcategoryRow[]>>({});
  let pocketOptions = $state<Pocket[]>([...DEFAULT_POCKETS]);
  let pocketColors = $state<Record<string, string>>({});
  let checklistItems = $state<PlanChecklistItem[]>([]);
  let loading = $state(false);
  let hydrated = $state(false);
  let error = $state('');
  let success = $state('');

  let moveOpen = $state(false);
  let moveFromCategoryId = $state(0);
  let moveFromSub = $state('');
  let moveToCategoryId = $state(0);
  let moveToSub = $state('');
  let moveAmount = $state('');
  let moving = $state(false);
  let moveRemainingByKey = $state<Record<string, number>>({});

  let closeOpen = $state(false);
  let closeLoading = $state(false);
  let closing = $state(false);
  let closePreview = $state<CloseMonthBucket[]>([]);
  let closeNextPeriod = $state('');

  const closeSurplusTotal = $derived(
    closePreview.filter((b) => b.kind === 'surplus').reduce((sum, b) => sum + b.amount, 0),
  );
  const closeDeficitTotal = $derived(
    closePreview.filter((b) => b.kind === 'deficit').reduce((sum, b) => sum + b.amount, 0),
  );

  const moveFromSubs = $derived(
    (subcategoryInputs[moveFromCategoryId] ?? [])
      .map((row) => row.name.trim())
      .filter(Boolean),
  );
  const moveToSubs = $derived(
    (subcategoryInputs[moveToCategoryId] ?? [])
      .map((row) => row.name.trim())
      .filter(Boolean),
  );

  function moveBucketKey(categoryId: number, subName: string): string {
    return `${categoryId}|${subName.trim().toLowerCase()}`;
  }

  const moveAvailable = $derived.by(() => {
    if (!moveFromCategoryId) return 0;
    return moveRemainingByKey[moveBucketKey(Number(moveFromCategoryId), moveFromSub)] ?? 0;
  });

  const selectClass =
    'w-full appearance-none border border-zinc-200 bg-white py-2 pl-2.5 pr-7 text-xs font-medium dark:border-zinc-800 dark:bg-black';

  function applyPlanSubcategories(plan: Awaited<ReturnType<typeof getPlan>>) {
    const subs: Record<number, SubcategoryRow[]> = {};
    for (const cat of categories) {
      subs[cat.id] = [];
    }
    for (const sub of plan.subcategories ?? []) {
      if (!subs[sub.categoryId]) subs[sub.categoryId] = [];
      subs[sub.categoryId].push({
        key: `loaded-${sub.id}`,
        name: sub.name,
        amount: formatAmountInput(sub.allocatedAmount ?? ''),
        pic:
          sub.pic && isKnownPic(sub.pic)
            ? (sub.pic as Pic)
            : defaultPic(),
        pocket: sub.pocket?.trim() ? sub.pocket : DEFAULT_POCKET,
      });
    }
    subcategoryInputs = subs;
    checklistItems = plan.checklist ?? [];
  }

  async function reloadChecklist() {
    try {
      const plan = await getPlan(period);
      checklistItems = plan.checklist ?? [];
    } catch {
      /* keep current list */
    }
  }

  async function openMovePanel() {
    const first = categories[0]?.id ?? 0;
    const second = categories[1]?.id ?? first;
    moveFromCategoryId = first;
    moveToCategoryId = second;
    moveFromSub = '';
    moveToSub = '';
    moveAmount = '';
    moveOpen = true;
    closeOpen = false;
    error = '';
    success = '';

    try {
      const summary = await getSummary(period);
      const remaining: Record<string, number> = {};
      for (const cat of summary.categories) {
        const namedSubs = cat.subcategories.filter((s) => s.name !== MAIN_SUB_LABEL);
        if (namedSubs.length === 0) {
          remaining[moveBucketKey(cat.categoryId, '')] = Math.max(0, cat.sisa);
          continue;
        }
        for (const sub of cat.subcategories) {
          const keySub = sub.name === MAIN_SUB_LABEL ? '' : sub.name;
          remaining[moveBucketKey(cat.categoryId, keySub)] = Math.max(0, sub.sisa);
        }
      }
      moveRemainingByKey = remaining;
    } catch (e) {
      moveRemainingByKey = {};
      error = e instanceof Error ? e.message : 'Failed to load remaining budgets';
    }
  }

  async function openClosePanel() {
    moveOpen = false;
    closeOpen = true;
    closeLoading = true;
    closePreview = [];
    closeNextPeriod = shiftPeriod(period, 1);
    error = '';
    success = '';

    try {
      const summary = await getSummary(period);
      const buckets: CloseMonthBucket[] = [];
      for (const cat of summary.categories) {
        const namedSubs = cat.subcategories.filter((s) => s.name !== MAIN_SUB_LABEL);
        if (namedSubs.length === 0) {
          const sisa = Math.round(cat.sisa);
          if (sisa === 0) continue;
          buckets.push({
            categoryId: cat.categoryId,
            categoryName: cat.categoryName,
            subcategoryName: MAIN_SUB_LABEL,
            amount: Math.abs(sisa),
            kind: sisa > 0 ? 'surplus' : 'deficit',
            pic: '',
          });
          continue;
        }
        for (const sub of cat.subcategories) {
          const sisa = Math.round(sub.sisa);
          if (sisa === 0) continue;
          buckets.push({
            categoryId: cat.categoryId,
            categoryName: cat.categoryName,
            subcategoryName: sub.name,
            amount: Math.abs(sisa),
            kind: sisa > 0 ? 'surplus' : 'deficit',
            pic: sub.pic || '',
          });
        }
      }
      closePreview = buckets;
      if (buckets.length === 0) {
        error = `Nothing to close for ${period} — all buckets are settled.`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load close preview';
    } finally {
      closeLoading = false;
    }
  }

  async function handleCloseMonth() {
    if (closePreview.length === 0) {
      error = `Nothing to close for ${period}.`;
      return;
    }

    const surplusNote =
      closeSurplusTotal > 0
        ? `\n\nSurplus ${formatCurrency(closeSurplusTotal)} will be added as income and budget in ${closeNextPeriod}.`
        : '';
    const deficitNote =
      closeDeficitTotal > 0
        ? `\n\nDeficit ${formatCurrency(closeDeficitTotal)} will be recorded as Detail expenses in ${closeNextPeriod} (plan unchanged).`
        : '';

    if (
      !confirm(
        `Close ${period} and carry into ${closeNextPeriod}?${surplusNote}${deficitNote}\n\nThis cannot be undone automatically.`,
      )
    ) {
      return;
    }

    closing = true;
    error = '';
    success = '';
    try {
      const result = await closeMonth(period);
      closeOpen = false;
      success = `Closed ${result.fromPeriod} → ${result.toPeriod}. Surplus ${formatCurrency(result.totals.surplus)} added to income & plan; deficit ${formatCurrency(result.totals.deficit)} recorded on Detail. Switch period to review ${result.toPeriod}.`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to close month';
    } finally {
      closing = false;
    }
  }

  async function handleMoveAllocation() {
    const amount = parseAmountInput(moveAmount);
    const fromCategoryId = Number(moveFromCategoryId);
    const toCategoryId = Number(moveToCategoryId);
    if (!fromCategoryId || !toCategoryId) {
      error = 'Choose from and to categories.';
      return;
    }
    if (amount <= 0) {
      error = 'Enter an amount to move.';
      return;
    }
    if (amount > moveAvailable) {
      error = `Only ${formatCurrency(moveAvailable)} remaining to move.`;
      return;
    }
    if (
      fromCategoryId === toCategoryId &&
      moveFromSub.trim().toLowerCase() === moveToSub.trim().toLowerCase()
    ) {
      error = 'From and to must be different.';
      return;
    }

    moving = true;
    error = '';
    success = '';
    try {
      await transferBudget({
        period,
        amount,
        from: {
          categoryId: fromCategoryId,
          subcategoryName: moveFromSub.trim() || undefined,
        },
        to: {
          categoryId: toCategoryId,
          subcategoryName: moveToSub.trim() || undefined,
        },
      });
      const plan = await getPlan(period);
      applyPlanSubcategories(plan);
      const fromCat = categories.find((c) => c.id === fromCategoryId)?.name ?? '';
      const toCat = categories.find((c) => c.id === toCategoryId)?.name ?? '';
      const fromLabel = moveFromSub.trim() || MAIN_SUB_LABEL;
      const toLabel = moveToSub.trim() || MAIN_SUB_LABEL;
      success = `Moved ${formatCurrency(amount)} from ${fromCat} / ${fromLabel} → ${toCat} / ${toLabel}`;
      moveOpen = false;
      moveAmount = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to move allocation';
    } finally {
      moving = false;
    }
  }

  async function loadData(activePeriod: string) {
    error = '';
    success = '';
    await withDeferredLoading(
      (v) => {
        loading = v;
      },
      async () => {
        try {
          const [catRes, plan, pocketRes] = await Promise.all([
            getCategories(),
            getPlan(activePeriod),
            getPockets(),
          ]);
          categories = catRes.categories;
          pocketOptions = pocketRes.pockets.map((p) => p.name);
          if (pocketOptions.length === 0) pocketOptions = [...DEFAULT_POCKETS];
          pocketColors = Object.fromEntries(
            pocketRes.pockets.map((p) => [p.name.toUpperCase(), p.color || '#71717a']),
          );
          applyPlanSubcategories(plan);
        } catch (e) {
          error = e instanceof Error ? e.message : 'Failed to load transfer data';
        } finally {
          hydrated = true;
        }
      },
    );
  }

  $effect(() => {
    void loadData(period);
  });
</script>

<section class="mx-auto w-full space-y-6 md:space-y-8">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-[11px] uppercase tracking-wider text-zinc-500">Transfer · {period}</p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        onclick={openClosePanel}
        class="border border-zinc-300 px-2.5 py-1 text-[11px] font-medium dark:border-zinc-600"
      >
        Close Month
      </button>
      <button
        type="button"
        onclick={openMovePanel}
        class="border border-zinc-300 px-2.5 py-1 text-[11px] font-medium dark:border-zinc-600"
      >
        Move Allocation
      </button>
    </div>
  </div>

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}
  {#if success}
    <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
  {/if}

  {#if closeOpen}
    <div class="space-y-3 rounded-sm border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Close <span class="font-mono">{period}</span>
        → <span class="font-mono">{closeNextPeriod}</span>
      </p>

      {#if closeLoading}
        <p class="text-[11px] text-zinc-500">Loading remaining…</p>
      {:else if closePreview.length === 0}
        <p class="text-[11px] text-zinc-500">Nothing to close — all buckets settled.</p>
      {:else}
        <div class="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
          <table class="w-full text-left text-[11px]">
            <thead class="border-b border-zinc-200 bg-white text-[10px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-black">
              <tr>
                <th class="px-2 py-1.5 font-medium">Category</th>
                <th class="px-2 py-1.5 font-medium">Sub</th>
                <th class="px-2 py-1.5 text-right font-medium">Amount</th>
                <th class="px-2 py-1.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {#each closePreview as row}
                <tr class="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td class="px-2 py-1.5">{row.categoryName}</td>
                  <td class="px-2 py-1.5 text-zinc-500">{row.subcategoryName}</td>
                  <td class="px-2 py-1.5 text-right font-mono tabular-nums">{formatCurrency(row.amount)}</td>
                  <td class="px-2 py-1.5">
                    {#if row.kind === 'surplus'}
                      <span class="text-emerald-700 dark:text-emerald-400">Carry to plan + income</span>
                    {:else}
                      <span class="text-amber-700 dark:text-amber-400">Deficit</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap gap-3 text-[10px] text-zinc-500">
          {#if closeSurplusTotal > 0}
            <span>
              Surplus
              <span class="font-mono text-emerald-700 dark:text-emerald-400">{formatCurrency(closeSurplusTotal)}</span>
              → income &amp; plan in {closeNextPeriod}
            </span>
          {/if}
          {#if closeDeficitTotal > 0}
            <span>
              Deficit
              <span class="font-mono text-amber-700 dark:text-amber-400">{formatCurrency(closeDeficitTotal)}</span>
              → Detail in {closeNextPeriod}
            </span>
          {/if}
        </div>
      {/if}

      <p class="text-[10px] text-zinc-500">
        Surplus → Detail Carryover. Deficit → next-month expense.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          disabled={closing || closeLoading || closePreview.length === 0}
          onclick={handleCloseMonth}
          class="border border-black bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
        >
          {closing ? 'Closing…' : 'Close Month'}
        </button>
        <button
          type="button"
          disabled={closing}
          onclick={() => (closeOpen = false)}
          class="border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  {#if moveOpen}
    <div class="space-y-3 rounded-sm border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Move allocation within <span class="font-mono">{period}</span>
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-2">
          <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">From</p>
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] text-zinc-500">Category</span>
            <div class="relative">
              <select
                bind:value={moveFromCategoryId}
                class={selectClass}
                aria-label="Move from category"
                onchange={() => {
                  moveFromSub = '';
                }}
              >
                {#each categories as cat}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] text-zinc-500">Sub category</span>
            <div class="relative">
              <select bind:value={moveFromSub} class={selectClass} aria-label="Move from sub category">
                <option value="">{MAIN_SUB_LABEL}</option>
                {#each moveFromSubs as name}
                  <option value={name}>{name}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
          <p class="text-[10px] text-zinc-500">
            Remaining:
            <span class="font-mono text-zinc-700 dark:text-zinc-300">{formatCurrency(moveAvailable)}</span>
          </p>
        </div>

        <div class="space-y-2">
          <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">To</p>
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] text-zinc-500">Category</span>
            <div class="relative">
              <select
                bind:value={moveToCategoryId}
                class={selectClass}
                aria-label="Move to category"
                onchange={() => {
                  moveToSub = '';
                }}
              >
                {#each categories as cat}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] text-zinc-500">Sub category</span>
            <div class="relative">
              <select bind:value={moveToSub} class={selectClass} aria-label="Move to sub category">
                <option value="">{MAIN_SUB_LABEL}</option>
                {#each moveToSubs as name}
                  <option value={name}>{name}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
        </div>
      </div>

      <label class="block max-w-[12rem] space-y-1">
        <span class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Amount</span>
        <AmountInput bind:value={moveAmount} aria-label="Amount to move" />
      </label>

      <p class="text-[10px] text-zinc-500">
        Moves leftover plan (allocation − spent). Writes Detail immediately.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          disabled={moving}
          onclick={handleMoveAllocation}
          class="border border-black bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
        >
          {moving ? 'Moving…' : 'Move'}
        </button>
        <button
          type="button"
          disabled={moving}
          onclick={() => (moveOpen = false)}
          class="border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  {#if loading || !hydrated}
    <div class="h-32 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
  {:else}
    <TransferPanel
      {period}
      {categories}
      {subcategoryInputs}
      {pocketOptions}
      {pocketColors}
      items={checklistItems}
      onChange={reloadChecklist}
    />
  {/if}
</section>
