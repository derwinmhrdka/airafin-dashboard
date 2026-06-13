<script lang="ts">
  import { page } from '$app/state';
  import { createCategory, getCategories, getPlan, savePlan } from '$lib/api';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import { formatAmountInput, formatCurrency, parseAmountInput } from '$lib/format';
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

  const period = $derived(periodFromUrl(page.url.searchParams));

  const budgetGrid =
    'grid grid-cols-[minmax(0,1fr)_5.75rem_2.25rem_1.75rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_2.5rem_2rem] md:grid-cols-[minmax(0,1fr)_8rem_3rem_2.5rem] md:gap-x-3';

  const removeBtnClass =
    'flex h-8 w-8 shrink-0 items-center justify-center bg-transparent text-xl leading-none font-light text-red-600 dark:bg-transparent dark:text-red-500';

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
  }

  let categories = $state<Category[]>([]);
  let incomeRows = $state<IncomeRow[]>([]);
  let budgetInputs = $state<Record<number, string>>({});
  let picInputs = $state<Record<number, Pic>>({});
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
    const subs: Record<number, SubcategoryRow[]> = {};
    for (const cat of categories) {
      inputs[cat.id] = '';
      pics[cat.id] = DEFAULT_PIC;
      subs[cat.id] = [];
    }
    for (const b of plan.budgets) {
      inputs[b.categoryId] = formatAmountInput(b.allocatedAmount);
      if (b.pic && (PICS as readonly string[]).includes(b.pic)) {
        pics[b.categoryId] = b.pic as Pic;
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
      });
    }
    budgetInputs = inputs;
    picInputs = pics;
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
      const [catRes, plan] = await Promise.all([getCategories(), getPlan(activePeriod)]);
      categories = catRes.categories;
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
      }))
      .filter((b) => b.allocatedAmount > 0);

    const subcategories = categories.flatMap((cat) =>
      (subcategoryInputs[cat.id] ?? [])
        .filter((row) => row.name.trim())
        .map((row) => ({
          categoryId: cat.id,
          name: row.name.trim(),
          allocatedAmount: parseAmountInput(row.amount || ''),
          pic: row.pic,
        })),
    );

    try {
      await savePlan({ period, incomes, budgets, subcategories });
      success = `Plan saved for ${period}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save plan';
    } finally {
      saving = false;
    }
  }

  const totalBudget = $derived(
    Object.values(budgetInputs).reduce((sum, v) => sum + parseAmountInput(v || ''), 0) +
      Object.values(subcategoryInputs)
        .flat()
        .reduce((sum, row) => sum + parseAmountInput(row.amount || ''), 0),
  );
  const totalIncome = $derived(
    incomeRows.reduce((sum, row) => sum + parseAmountInput(row.amount || ''), 0),
  );

  function addSubcategory(categoryId: number) {
    subcategoryInputs = {
      ...subcategoryInputs,
      [categoryId]: [
        ...(subcategoryInputs[categoryId] ?? []),
        { key: `new-${Date.now()}`, name: '', amount: '', pic: DEFAULT_PIC },
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
      <div class="space-y-3 border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
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

    <form onsubmit={handleSubmit} class="space-y-4">
      <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
        <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Income — {period}
        </legend>

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
      </fieldset>

      <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
        <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Budget per Category
        </legend>

        <div
          class="{budgetGrid} gap-y-1 border-b border-zinc-200 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800"
        >
          <span class="min-w-0 text-center">Category</span>
          <span class="min-w-0 text-center">Budget</span>
          <span class="min-w-0 text-center">PIC</span>
          <span class="min-w-0 text-center">Action</span>
        </div>

        {#each categories as cat (cat.id)}
          <div class="space-y-1.5">
            <div class={budgetGrid}>
              <span class="min-w-0 truncate text-sm">{cat.name}</span>
              <div class="min-w-0">
                <AmountInput
                  bind:value={budgetInputs[cat.id]}
                  aria-label="Budget for {cat.name}"
                  class="w-full px-1.5 py-1.5 text-right"
                />
              </div>
              <div class="flex justify-center">
                <select
                  bind:value={picInputs[cat.id]}
                  class="h-8 w-9 border border-zinc-200 bg-white px-0 text-center text-[10px] font-semibold leading-8 dark:border-zinc-800 dark:bg-black"
                  aria-label="PIC for {cat.name}"
                  title={picInputs[cat.id]}
                >
                  {#each PICS as p}
                    <option value={p}>{picInitial(p)}</option>
                  {/each}
                </select>
              </div>
              <span class="block min-h-8" aria-hidden="true"></span>
            </div>

            {#each subcategoryInputs[cat.id] ?? [] as sub (sub.key)}
              <div class={budgetGrid}>
                <div class="min-w-0 pl-3">
                  <input
                    type="text"
                    bind:value={sub.name}
                    placeholder="Sub category"
                    class="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-black"
                    aria-label="Sub category for {cat.name}"
                  />
                </div>
                <div class="min-w-0">
                  <AmountInput
                    bind:value={sub.amount}
                    aria-label="Budget for sub category {sub.name || 'new'}"
                    class="w-full px-1.5 py-1.5 text-right"
                  />
                </div>
                <div class="flex justify-center">
                  <select
                    bind:value={sub.pic}
                    class="h-8 w-9 border border-zinc-200 bg-white px-0 text-center text-[10px] font-semibold leading-8 dark:border-zinc-800 dark:bg-black"
                    aria-label="PIC for sub category"
                    title={sub.pic}
                  >
                    {#each PICS as p}
                      <option value={p}>{picInitial(p)}</option>
                    {/each}
                  </select>
                </div>
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
              class="ml-3 border border-dashed border-zinc-300 px-2 py-1 text-[10px] text-zinc-500 dark:border-zinc-700"
            >
              + Sub category
            </button>
          </div>
        {/each}

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
