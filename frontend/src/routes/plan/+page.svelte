<script lang="ts">
  import { onMount } from 'svelte';
  import { createCategory, getCategories, getPlan, savePlan } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { currentPeriod } from '$lib/period';
  import type { Category } from '$lib/types';

  const period = currentPeriod();
  const DEFAULT_INCOMES = ['Gaji Derwin', 'Gaji Anggita'] as const;

  interface IncomeRow {
    key: string;
    source: string;
    amount: string;
  }

  let categories = $state<Category[]>([]);
  let incomeRows = $state<IncomeRow[]>([]);
  let budgetInputs = $state<Record<number, string>>({});
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

  async function loadData() {
    loading = true;
    error = '';
    try {
      const [catRes, plan] = await Promise.all([getCategories(), getPlan(period)]);
      categories = catRes.categories;

      incomeRows =
        plan.incomes.length > 0
          ? plan.incomes.map((income, i) => ({
              key: `loaded-${income.id ?? i}`,
              source: income.source,
              amount: income.amount,
            }))
          : defaultIncomeRows();

      const inputs: Record<number, string> = {};
      for (const cat of categories) inputs[cat.id] = '';
      for (const b of plan.budgets) inputs[b.categoryId] = b.allocatedAmount;
      budgetInputs = inputs;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load plan';
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    addingCategory = true;
    error = '';
    try {
      const { category } = await createCategory(name);
      categories = [...categories, category];
      budgetInputs = { ...budgetInputs, [category.id]: '' };
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
        amount: Number.parseFloat(row.amount || '0'),
      }))
      .filter((row) => row.source && row.amount > 0);

    const budgets = categories
      .map((cat) => ({
        categoryId: cat.id,
        allocatedAmount: Number.parseFloat(budgetInputs[cat.id] || '0'),
      }))
      .filter((b) => b.allocatedAmount > 0);

    try {
      await savePlan({ period, incomes, budgets });
      success = 'Plan saved for ' + period;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save plan';
    } finally {
      saving = false;
    }
  }

  const totalBudget = $derived(
    Object.values(budgetInputs).reduce((sum, v) => sum + (Number.parseFloat(v || '0') || 0), 0),
  );
  const totalIncome = $derived(
    incomeRows.reduce((sum, row) => sum + (Number.parseFloat(row.amount || '0') || 0), 0),
  );
</script>

<section class="space-y-4">
  {#if loading}
    <div class="h-48 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
  {:else}
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
            <label class="w-32 space-y-1">
              <span class="text-[11px] text-zinc-500">Amount</span>
              <input
                type="number"
                inputmode="decimal"
                bind:value={row.amount}
                min="0"
                placeholder="0"
                class="w-full border border-zinc-200 bg-white px-2 py-2 font-mono text-sm dark:border-zinc-800 dark:bg-black"
              />
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

        {#each categories as cat (cat.id)}
          <label class="flex items-center justify-between gap-3">
            <span class="text-sm">{cat.name}</span>
            <input
              type="number"
              inputmode="decimal"
              bind:value={budgetInputs[cat.id]}
              min="0"
              placeholder="0"
              class="w-32 border border-zinc-200 bg-white px-2 py-1.5 text-right font-mono text-sm dark:border-zinc-800 dark:bg-black"
            />
          </label>
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
