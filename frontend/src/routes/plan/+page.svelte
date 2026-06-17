<script lang="ts">
  import { page } from '$app/state';
  import { createCategory, getCategories, getPlan, getPockets, savePlan } from '$lib/api';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { formatAmountInput, formatCurrency, parseAmountInput } from '$lib/format';
  import {
    mainCategoryRemainder,
    picPlanSummary,
    subAmountTotal,
    subExceedsCategory,
    totalPlanFromCategories,
  } from '$lib/plan-allocations';
  import {
    listYearOptionsForPeriod,
    MONTH_NAMES,
    periodFromParts,
    periodFromUrl,
    periodParts,
  } from '$lib/period';
  import { DEFAULT_PIC, PICS, picInitial, type Pic } from '$lib/pics';
  import type { Category, PlanData } from '$lib/types';

  const DEFAULT_INCOMES = ['Gaji Derwin', 'Gaji Anggita'] as const;
  const DEFAULT_POCKETS = ['BCA', 'MANDIRI', 'SUPA', 'DANA', 'OVO', 'CASH', 'BIBIT'] as const;
  type Pocket = string;
  const DEFAULT_POCKET: Pocket = 'BCA';

  const period = $derived(periodFromUrl(page.url.searchParams));

  const removeBtnClass =
    'flex h-6 w-6 shrink-0 items-center justify-center bg-transparent text-base leading-none font-light text-red-600 dark:bg-transparent dark:text-red-500 md:h-8 md:w-8 md:text-xl';

  interface IncomeRow {
    key: string;
    source: string;
    amount: string;
  }

  interface SubcategoryRow {
    key: string;
    name: string;
    amount: string;
    pic: Pic;
    pocket: Pocket;
  }

  let categories = $state<Category[]>([]);
  let incomeRows = $state<IncomeRow[]>([]);
  let budgetInputs = $state<Record<number, string>>({});
  let picInputs = $state<Record<number, Pic>>({});
  let pocketInputs = $state<Record<number, Pocket>>({});
  let pocketOptions = $state<Pocket[]>([...DEFAULT_POCKETS]);
  let subcategoryInputs = $state<Record<number, SubcategoryRow[]>>({});
  let newCategoryName = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let addingCategory = $state(false);
  let error = $state('');
  let success = $state('');
  let copyOpen = $state(false);
  let copyMonth = $state(0);
  let copyYear = $state(new Date().getFullYear());
  let copying = $state(false);

  const copyYears = $derived(listYearOptionsForPeriod(copyYear));

  const selectClass =
    'w-full appearance-none border border-zinc-200 bg-white py-2 pl-2.5 pr-7 text-xs font-medium dark:border-zinc-800 dark:bg-black';

  function defaultIncomeRows(): IncomeRow[] {
    return DEFAULT_INCOMES.map((source, i) => ({
      key: `default-${i}`,
      source,
      amount: '',
    }));
  }

  function addIncomeRow() {
    incomeRows = [
      ...incomeRows,
      { key: `extra-${Date.now()}`, source: '', amount: '' },
    ];
  }

  function removeIncomeRow(key: string) {
    incomeRows = incomeRows.filter((row) => row.key !== key);
  }

  function applyPlanToForm(plan: PlanData) {
    incomeRows =
      plan.incomes.length > 0
        ? plan.incomes.map((income, i) => ({
            key: `copied-${income.id ?? i}-${Date.now()}`,
            source: income.source,
            amount: formatAmountInput(income.amount),
          }))
        : defaultIncomeRows();

    const inputs: Record<number, string> = {};
    const pics: Record<number, Pic> = {};
    const pockets: Record<number, Pocket> = {};
    const subs: Record<number, SubcategoryRow[]> = {};
    for (const cat of categories) {
      inputs[cat.id] = '';
      pics[cat.id] = DEFAULT_PIC;
      pockets[cat.id] = DEFAULT_POCKET;
      subs[cat.id] = [];
    }
    for (const b of plan.budgets) {
      inputs[b.categoryId] = formatAmountInput(b.allocatedAmount);
      if (b.pic && (PICS as readonly string[]).includes(b.pic)) {
        pics[b.categoryId] = b.pic as Pic;
      }
      if (b.pocket?.trim()) {
        pockets[b.categoryId] = b.pocket;
      }
    }
    for (const sub of plan.subcategories ?? []) {
      if (!subs[sub.categoryId]) subs[sub.categoryId] = [];
      subs[sub.categoryId].push({
        key: `copied-${sub.id}-${Date.now()}`,
        name: sub.name,
        amount: formatAmountInput(sub.allocatedAmount ?? ''),
        pic:
          sub.pic && (PICS as readonly string[]).includes(sub.pic)
            ? (sub.pic as Pic)
            : DEFAULT_PIC,
        pocket:
          sub.pocket?.trim() ? sub.pocket : DEFAULT_POCKET,
      });
    }
    budgetInputs = inputs;
    picInputs = pics;
    pocketInputs = pockets;
    subcategoryInputs = subs;
  }

  function defaultCopySourceParts(): { month: number; year: number } {
    const parts = periodParts(period);
    if (parts.month === 0) {
      return { month: 11, year: parts.year - 1 };
    }
    return { month: parts.month - 1, year: parts.year };
  }

  function openCopyPanel() {
    const defaults = defaultCopySourceParts();
    copyMonth = defaults.month;
    copyYear = defaults.year;
    copyOpen = true;
    error = '';
    success = '';
  }

  async function handleCopyPlan() {
    const sourcePeriod = periodFromParts(copyMonth, copyYear);
    if (sourcePeriod === period) {
      error = 'Choose a different month than the current plan.';
      return;
    }

    copying = true;
    error = '';
    success = '';
    try {
      const plan = await getPlan(sourcePeriod);
      applyPlanToForm(plan);
      copyOpen = false;
      success = `Copied plan from ${sourcePeriod}. Review and click Save Plan to apply.`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to copy plan';
    } finally {
      copying = false;
    }
  }

  async function loadData(activePeriod: string) {
    loading = true;
    error = '';
    success = '';
    try {
      const [catRes, plan, pocketRes] = await Promise.all([
        getCategories(),
        getPlan(activePeriod),
        getPockets(),
      ]);
      categories = catRes.categories;
      pocketOptions = pocketRes.pockets.map((p) => p.name);
      if (pocketOptions.length === 0) pocketOptions = [...DEFAULT_POCKETS];
      applyPlanToForm(plan);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load plan';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadData(period);
  });

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    addingCategory = true;
    error = '';
    try {
      const { category } = await createCategory(name);
      categories = [...categories, category];
      budgetInputs = { ...budgetInputs, [category.id]: '' };
      picInputs = { ...picInputs, [category.id]: DEFAULT_PIC };
      pocketInputs = { ...pocketInputs, [category.id]: DEFAULT_POCKET };
      subcategoryInputs = { ...subcategoryInputs, [category.id]: [] };
      newCategoryName = '';
      success = `Category "${category.name}" added`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add category';
    } finally {
      addingCategory = false;
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    error = '';
    success = '';

    const incomes = incomeRows
      .map((row) => ({
        source: row.source.trim(),
        amount: parseAmountInput(row.amount),
      }))
      .filter((row) => row.source && row.amount > 0);

    const budgets = categories
      .map((cat) => ({
        categoryId: cat.id,
        allocatedAmount: parseAmountInput(budgetInputs[cat.id] || ''),
        pic: picInputs[cat.id] ?? DEFAULT_PIC,
        pocket: pocketInputs[cat.id] ?? DEFAULT_POCKET,
      }))
      .filter((b) => b.allocatedAmount > 0);

    try {
      const subcategories = categories.flatMap((cat) => {
        const subs = (subcategoryInputs[cat.id] ?? []).filter((row) => row.name.trim());
        if (subExceedsCategory(budgetInputs[cat.id] || '', subs)) {
          throw new Error(
            `Sub-categories for ${cat.name} exceed the category budget. Subs split the main amount, not add on top.`,
          );
        }
        return subs.map((row) => ({
          categoryId: cat.id,
          name: row.name.trim(),
          allocatedAmount: parseAmountInput(row.amount || ''),
          pic: row.pic,
          pocket: row.pocket,
        }));
      });

      await savePlan({ period, incomes, budgets, subcategories });
      success = `Plan saved for ${period}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save plan';
    } finally {
      saving = false;
    }
  }

  const totalBudget = $derived(totalPlanFromCategories(categories.map((c) => c.id), budgetInputs));

  const totalIncome = $derived(
    incomeRows.reduce((sum, row) => sum + parseAmountInput(row.amount || ''), 0),
  );

  const picSummary = $derived(
    picPlanSummary({ incomeRows, categories, budgetInputs, picInputs, subcategoryInputs }),
  );

  const transferNote = $derived.by(() => {
    const rows = picSummary;
    const surplus = rows.find((r) => r.balancing > 0);
    const deficit = rows.find((r) => r.balancing < 0);
    if (!surplus || !deficit) return '';

    const amount = Math.min(surplus.balancing, Math.abs(deficit.balancing));
    return `${surplus.pic} transfer ${formatCurrency(amount)} to ${deficit.pic}`;
  });

  function addSubcategory(categoryId: number) {
    subcategoryInputs = {
      ...subcategoryInputs,
      [categoryId]: [
        ...(subcategoryInputs[categoryId] ?? []),
        {
          key: `new-${Date.now()}`,
          name: '',
          amount: '',
          pic: DEFAULT_PIC,
          pocket: DEFAULT_POCKET,
        },
      ],
    };
  }

  function removeSubcategory(categoryId: number, key: string) {
    subcategoryInputs = {
      ...subcategoryInputs,
      [categoryId]: (subcategoryInputs[categoryId] ?? []).filter((row) => row.key !== key),
    };
  }
</script>

<section class="mx-auto w-full space-y-4 md:space-y-6">
  {#if loading}
    <div class="h-48 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[11px] uppercase tracking-wider text-zinc-500">Plan · {period}</p>
      <button
        type="button"
        onclick={openCopyPanel}
        class="border border-zinc-300 px-2.5 py-1 text-[11px] font-medium dark:border-zinc-600"
      >
        Copy Plan
      </button>
    </div>

    {#if copyOpen}
      <div class="space-y-3 rounded-sm border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Copy plan into <span class="font-mono">{period}</span> from
        </p>
        <div class="grid grid-cols-2 gap-2">
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Month
            </span>
            <div class="relative">
              <select bind:value={copyMonth} class={selectClass} aria-label="Copy from month">
                {#each MONTH_NAMES as name, index}
                  <option value={index}>{name}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
          <label class="block min-w-0">
            <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Year
            </span>
            <div class="relative">
              <select bind:value={copyYear} class={selectClass} aria-label="Copy from year">
                {#each copyYears as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
                aria-hidden="true"
              >▼</span>
            </div>
          </label>
        </div>
        <p class="text-[10px] text-zinc-500">
          Copies income, category budgets, PIC, and sub-categories. You still need to save.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            disabled={copying}
            onclick={handleCopyPlan}
            class="border border-black bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
          >
            {copying ? 'Copying…' : 'Copy'}
          </button>
          <button
            type="button"
            disabled={copying}
            onclick={() => (copyOpen = false)}
            class="border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-3 md:space-y-4">
      <fieldset class="space-y-3 rounded-sm border border-zinc-200 p-3 dark:border-zinc-800">
        <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Income — {period}
        </legend>
        <div class="space-y-2">
            {#each incomeRows as row (row.key)}
              <div class="flex items-end gap-2">
                <label class="min-w-0 flex-1 space-y-1">
                  <span class="text-[11px] text-zinc-500">Source</span>
                  <input
                    type="text"
                    bind:value={row.source}
                    placeholder="e.g. Gaji, Bonus"
                    class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
                  />
                </label>
                <label class="w-32 shrink-0 space-y-1">
                  <span class="text-[11px] text-zinc-500">Amount</span>
                  <AmountInput bind:value={row.amount} class="text-right" />
                </label>
                {#if incomeRows.length > 1}
                  <button
                    type="button"
                    onclick={() => removeIncomeRow(row.key)}
                    class="mb-0.5 {removeBtnClass}"
                    aria-label="Remove income"
                  >
                    ×
                  </button>
                {/if}
              </div>
            {/each}

            <button
              type="button"
              onclick={addIncomeRow}
              class="w-full border border-dashed border-zinc-300 py-2 text-xs text-zinc-500 dark:border-zinc-700"
            >
              + Add income
            </button>

            <p class="text-right text-xs text-zinc-500">
              Total Income:
              <span class="font-mono text-black dark:text-white">{formatCurrency(totalIncome)}</span>
            </p>
        </div>
      </fieldset>

      <fieldset class="space-y-3 rounded-sm border border-zinc-200 p-3 dark:border-zinc-800">
        <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Budget per Category
        </legend>

        <div class="space-y-2 text-[11px]">
          <div
            class="grid grid-cols-[minmax(0,1fr)_5.2rem_1.8rem_3.4rem_1rem] items-center gap-x-1 border-b border-zinc-200 pb-2 text-[9px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800"
          >
            <span class="text-center">Category</span>
            <span class="text-center">Budget</span>
            <span class="text-center">PIC</span>
            <span class="text-center">Pocket</span>
            <span class="text-center" title="Action">✎</span>
          </div>

          {#each categories as cat (cat.id)}
            <div class="space-y-1.5 border-l-2 border-zinc-300 pl-1 dark:border-zinc-700">
              <div class="grid grid-cols-[minmax(0,1fr)_5.2rem_1.8rem_3.4rem_1rem] items-center gap-x-1 rounded-sm bg-zinc-50/80 px-1 py-1 dark:bg-zinc-900/60">
                <p class="min-w-0 truncate text-[10px] font-semibold sm:text-xs">{cat.name}</p>
                <div class="min-w-0">
                  <AmountInput
                    bind:value={budgetInputs[cat.id]}
                    aria-label="Budget for {cat.name}"
                      class="w-full px-1 py-1 text-right text-[11px]"
                  />
                </div>
                <select
                  bind:value={picInputs[cat.id]}
                      class="h-7 w-full border border-zinc-200 bg-white px-0 text-center text-[8px] font-semibold dark:border-zinc-800 dark:bg-black"
                  aria-label="PIC for {cat.name}"
                >
                  {#each PICS as p}
                    <option value={p}>{picInitial(p)}</option>
                  {/each}
                </select>
                <select
                  bind:value={pocketInputs[cat.id]}
                      class="h-7 w-full border border-zinc-200 bg-white px-0.5 text-[8px] dark:border-zinc-800 dark:bg-black"
                  aria-label="Pocket for {cat.name}"
                >
                  {#each pocketOptions as pocket}
                    <option value={pocket}>{pocket}</option>
                  {/each}
                </select>
                <span class="block min-h-8" aria-hidden="true"></span>
              </div>

              {#each subcategoryInputs[cat.id] ?? [] as sub (sub.key)}
                <div class="grid grid-cols-[minmax(0,1fr)_5.2rem_1.8rem_3.4rem_1rem] items-center gap-x-1">
                  <div class="min-w-0">
                    <input
                      type="text"
                      bind:value={sub.name}
                      placeholder="Sub category"
                        class="w-full border border-zinc-200 bg-white px-2 py-1.5 text-[10px] dark:border-zinc-800 dark:bg-black"
                      aria-label="Sub category for {cat.name}"
                    />
                  </div>
                  <AmountInput
                    bind:value={sub.amount}
                    aria-label="Budget for sub category {sub.name || 'new'}"
                      class="w-full px-1 py-1 text-right text-[11px]"
                  />
                  <select
                    bind:value={sub.pic}
                          class="h-7 w-full border border-zinc-200 bg-white px-0 text-center text-[8px] font-semibold dark:border-zinc-800 dark:bg-black"
                    aria-label="PIC for sub category"
                  >
                    {#each PICS as p}
                      <option value={p}>{picInitial(p)}</option>
                    {/each}
                  </select>
                  <select
                    bind:value={sub.pocket}
                          class="h-7 w-full border border-zinc-200 bg-white px-0.5 text-[8px] dark:border-zinc-800 dark:bg-black"
                    aria-label="Pocket for sub category"
                  >
                    {#each pocketOptions as pocket}
                      <option value={pocket}>{pocket}</option>
                    {/each}
                  </select>
                  <div class="flex justify-center">
                    <button
                      type="button"
                      onclick={() => removeSubcategory(cat.id, sub.key)}
                      class={removeBtnClass}
                      aria-label="Remove sub category"
                    >
                      ×
                    </button>
                  </div>
                </div>
              {/each}

              <button
                type="button"
                onclick={() => addSubcategory(cat.id)}
                class="ml-2 border border-dashed border-zinc-300 px-2 py-1 text-[9px] text-zinc-500 dark:border-zinc-700"
              >
                + Sub category
              </button>

              {#if (subcategoryInputs[cat.id] ?? []).length > 0}
                {@const subs = subcategoryInputs[cat.id] ?? []}
                {@const mainRemainder = mainCategoryRemainder(budgetInputs[cat.id] || '', subs)}
                {@const overSub = subExceedsCategory(budgetInputs[cat.id] || '', subs)}
                <div class="grid grid-cols-[minmax(0,1fr)_5.2rem_1.8rem_3.4rem_1rem] items-center gap-x-1 border-t border-dashed border-zinc-200 pt-1 text-zinc-500 dark:border-zinc-800">
                  <p class="text-xs italic">Main</p>
                  <span class="font-mono text-right text-xs tabular-nums">{formatCurrency(mainRemainder)}</span>
                  <span class="text-center text-[9px]">{picInitial(picInputs[cat.id] ?? DEFAULT_PIC)}</span>
                  <span class="truncate text-center text-[9px]">{pocketInputs[cat.id] ?? DEFAULT_POCKET}</span>
                  <span></span>
                </div>
                {#if overSub}
                  <p class="ml-2 text-[9px] text-red-600 dark:text-red-400">
                    Sub total {formatCurrency(subAmountTotal(subs))} exceeds category {formatCurrency(parseAmountInput(budgetInputs[cat.id] || ''))}.
                  </p>
                {/if}
              {/if}
            </div>
          {/each}
        </div>

        <div class="flex gap-2 pt-1">
          <input
            type="text"
            bind:value={newCategoryName}
            placeholder="New category name"
            class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
          />
          <button
            type="button"
            onclick={handleAddCategory}
            disabled={addingCategory || !newCategoryName.trim()}
            class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
          >
            {addingCategory ? '…' : '+ Add'}
          </button>
        </div>

        <p class="text-right text-xs text-zinc-500">
          Total Plan:
          <span class="font-mono text-black dark:text-white">{formatCurrency(totalBudget)}</span>
        </p>
      </fieldset>

      <fieldset class="space-y-3 rounded-sm border border-zinc-200 p-3 dark:border-zinc-800">
        <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Per PIC
        </legend>
        <div class="space-y-2">
            <p class="text-[10px] text-zinc-500">
              Balancing = Income − Plan. A negative balance means that PIC needs more from the other.
            </p>

            <div
              class="grid grid-cols-[minmax(0,4.5rem)_1fr_1fr] items-center gap-x-2 gap-y-2 border-b border-zinc-200 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 md:grid-cols-[minmax(0,4.5rem)_1fr_1fr_1fr] dark:border-zinc-800"
            >
              <span>PIC</span>
              <span class="hidden text-right md:block">Income</span>
              <span class="text-right">Plan</span>
              <span class="text-right">Balancing</span>
            </div>

            {#each picSummary as row (row.pic)}
              <div
                class="grid grid-cols-[minmax(0,4.5rem)_1fr_1fr] items-center gap-x-2 py-0.5 text-xs md:grid-cols-[minmax(0,4.5rem)_1fr_1fr_1fr]"
              >
                <PicBadge name={row.pic} />
                <span class="hidden font-mono text-right tabular-nums md:block">{formatCurrency(row.income)}</span>
                <span class="font-mono text-right tabular-nums">{formatCurrency(row.plan)}</span>
                <span
                  class="font-mono text-right tabular-nums
                    {row.balancing > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : row.balancing < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-500'}"
                >
                  {formatCurrency(row.balancing)}
                </span>
              </div>
            {/each}

            {#if transferNote}
              <p class="border-t border-zinc-200 pt-2 text-[11px] text-amber-700 dark:border-zinc-800 dark:text-amber-400">
                {transferNote}
              </p>
            {/if}
        </div>
      </fieldset>

      {#if error}
        <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
      {/if}
      {#if success}
        <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
      {/if}

      <button
        type="submit"
        disabled={saving}
        class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
      >
        {saving ? 'Saving…' : 'Save Plan'}
      </button>
    </form>
  {/if}
</section>
