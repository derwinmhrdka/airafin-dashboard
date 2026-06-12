<script lang="ts">
  import { page } from '$app/state';
  import { createCategory, getCategories, getPlan, savePlan } from '$lib/api';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import { formatAmountInput, formatCurrency, parseAmountInput } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import { DEFAULT_PIC, PICS, picInitial, type Pic } from '$lib/pics';
  import type { Category } from '$lib/types';

  const DEFAULT_INCOMES = ['Gaji Derwin', 'Gaji Anggita'] as const;

  const period = $derived(periodFromUrl(page.url.searchParams));

  interface IncomeRow {
    key: string;
    source: string;
    amount: string;
  }

  interface SubcategoryRow {
    key: string;
    name: string;
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

  async function loadData(activePeriod: string) {
    loading = true;
    error = '';
    success = '';
    try {
      const [catRes, plan] = await Promise.all([getCategories(), getPlan(activePeriod)]);
      categories = catRes.categories;

      incomeRows =
        plan.incomes.length > 0
          ? plan.incomes.map((income, i) => ({
              key: `loaded-${income.id ?? i}`,
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
          key: `loaded-${sub.id}`,
          name: sub.name,
          pic:
            sub.pic && (PICS as readonly string[]).includes(sub.pic)
              ? (sub.pic as Pic)
              : DEFAULT_PIC,
        });
      }
      budgetInputs = inputs;
      picInputs = pics;
      subcategoryInputs = subs;
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
    Object.values(budgetInputs).reduce((sum, v) => sum + parseAmountInput(v || ''), 0),
  );
  const totalIncome = $derived(
    incomeRows.reduce((sum, row) => sum + parseAmountInput(row.amount || ''), 0),
  );

  function addSubcategory(categoryId: number) {
    subcategoryInputs = {
      ...subcategoryInputs,
      [categoryId]: [
        ...(subcategoryInputs[categoryId] ?? []),
        { key: `new-${Date.now()}`, name: '', pic: DEFAULT_PIC },
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

<section class="space-y-4">
  {#if loading}
    <div class="h-48 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
  {:else}
    <p class="text-[11px] uppercase tracking-wider text-zinc-500">Plan · {period}</p>
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
                class="mb-0.5 border border-zinc-200 px-2 py-2 text-xs text-zinc-500 dark:border-zinc-800"
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
          class="grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] gap-x-1.5 gap-y-1 border-b border-zinc-200 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800"
        >
          <span>Category</span>
          <span class="text-right">Budget</span>
          <span class="text-center">PIC</span>
        </div>

        {#each categories as cat (cat.id)}
          <div class="space-y-1.5">
            <div class="grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] items-center gap-x-1.5">
              <span class="truncate text-sm">{cat.name}</span>
              <AmountInput
                bind:value={budgetInputs[cat.id]}
                aria-label="Budget for {cat.name}"
                class="px-1.5 py-1.5 text-right"
              />
              <div class="flex justify-center">
                <select
                  bind:value={picInputs[cat.id]}
                  class="w-9 border border-zinc-200 bg-white px-0 py-1.5 text-center text-[10px] font-semibold dark:border-zinc-800 dark:bg-black"
                  aria-label="PIC for {cat.name}"
                  title={picInputs[cat.id]}
                >
                  {#each PICS as p}
                    <option value={p}>{picInitial(p)}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#each subcategoryInputs[cat.id] ?? [] as sub (sub.key)}
              <div
                class="grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] items-center gap-x-1.5 pl-3"
              >
                <input
                  type="text"
                  bind:value={sub.name}
                  placeholder="Sub category"
                  class="min-w-0 border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-black"
                  aria-label="Sub category for {cat.name}"
                />
                <span class="text-center text-[10px] text-zinc-400">—</span>
                <div class="flex items-center justify-center gap-0.5">
                  <select
                    bind:value={sub.pic}
                    class="w-9 border border-zinc-200 bg-white px-0 py-1.5 text-center text-[10px] font-semibold dark:border-zinc-800 dark:bg-black"
                    aria-label="PIC for sub category"
                    title={sub.pic}
                  >
                    {#each PICS as p}
                      <option value={p}>{picInitial(p)}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    onclick={() => removeSubcategory(cat.id, sub.key)}
                    class="border border-zinc-200 px-1.5 py-1.5 text-[10px] text-zinc-500 dark:border-zinc-800"
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
