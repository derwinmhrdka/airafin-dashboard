<script lang="ts">
  import {
    createChecklistItem,
    deleteChecklistItem,
    updateChecklistItem,
  } from '$lib/api';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { formatCurrency, parseAmountInput, toAmountNumber } from '$lib/format';
  import { DEFAULT_PIC, PICS, type Pic } from '$lib/pics';
  import type { Category, PlanChecklistItem } from '$lib/types';

  interface SubOption {
    key: string;
    categoryId: number;
    categoryName: string;
    name: string;
    amount: number;
    pic: Pic;
    pocket: string;
  }

  interface Props {
    period: string;
    categories: Category[];
    subcategoryInputs: Record<
      number,
      readonly { name: string; amount: string; pic: Pic; pocket: string }[]
    >;
    pocketOptions: string[];
    pocketColors: Record<string, string>;
    items: PlanChecklistItem[];
    onChange: () => void | Promise<void>;
  }

  let {
    period,
    categories,
    subcategoryInputs,
    pocketOptions,
    pocketColors,
    items,
    onChange,
  }: Props = $props();

  let formOpen = $state(false);
  let selectedKey = $state('');
  let senderPic = $state<Pic>(DEFAULT_PIC);
  let receiverPic = $state<Pic>('Anggita');
  let pocket = $state('');
  let saving = $state(false);
  let togglingId = $state<number | null>(null);
  let formError = $state('');

  const subOptions = $derived.by((): SubOption[] => {
    const opts: SubOption[] = [];
    for (const cat of categories) {
      for (const sub of subcategoryInputs[cat.id] ?? []) {
        const name = sub.name.trim();
        if (!name) continue;
        const amount = parseAmountInput(sub.amount || '');
        if (amount <= 0) continue;
        opts.push({
          key: `${cat.id}|${name.toLowerCase()}`,
          categoryId: cat.id,
          categoryName: cat.name,
          name,
          amount,
          pic: sub.pic,
          pocket: sub.pocket,
        });
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  });

  const selectedOption = $derived(subOptions.find((o) => o.key === selectedKey));

  const pocketTotals = $derived.by(() => {
    const byPocket = new Map<string, Map<string, number>>();
    for (const item of items) {
      if (item.done) continue;
      const p = item.pocket?.trim().toUpperCase() || '—';
      const sender = item.senderPic?.trim() || '?';
      const amt = toAmountNumber(item.amount);
      if (!byPocket.has(p)) byPocket.set(p, new Map());
      const picMap = byPocket.get(p)!;
      picMap.set(sender, (picMap.get(sender) ?? 0) + amt);
    }
    return [...byPocket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pocketName, picMap]) => ({
        pocket: pocketName,
        color: pocketColors[pocketName] ?? '#71717a',
        pics: [...picMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([pic, total]) => ({ pic, total })),
      }));
  });

  const pendingCount = $derived(items.filter((i) => !i.done).length);
  const doneCount = $derived(items.filter((i) => i.done).length);

  function otherPic(p: Pic): Pic {
    return PICS.find((x) => x !== p) ?? DEFAULT_PIC;
  }

  function pocketDotColor(name: string): string {
    return pocketColors[name?.trim().toUpperCase()] ?? '#71717a';
  }

  function openForm() {
    formOpen = true;
    formError = '';
    selectedKey = subOptions[0]?.key ?? '';
    applySelectionDefaults();
  }

  function applySelectionDefaults() {
    const opt = selectedOption;
    if (!opt) return;
    senderPic = opt.pic;
    receiverPic = otherPic(opt.pic);
    pocket = opt.pocket || pocketOptions[0] || 'BCA';
  }

  function cancelForm() {
    formOpen = false;
    formError = '';
  }

  async function handleSave() {
    const opt = selectedOption;
    if (!opt) {
      formError = 'Choose an item';
      return;
    }
    if (senderPic === receiverPic) {
      formError = 'Sender ≠ receiver';
      return;
    }

    saving = true;
    formError = '';
    try {
      await createChecklistItem({
        period,
        categoryId: opt.categoryId,
        subcategoryName: opt.name,
        amount: opt.amount,
        senderPic,
        receiverPic,
        pocket,
      });
      formOpen = false;
      await onChange();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function toggleDone(item: PlanChecklistItem) {
    togglingId = item.id;
    try {
      await updateChecklistItem(item.id, !item.done);
      await onChange();
    } finally {
      togglingId = null;
    }
  }

  async function removeItem(id: number) {
    try {
      await deleteChecklistItem(id);
      await onChange();
    } catch {
      /* ignore */
    }
  }
</script>

<fieldset class="space-y-3 rounded-sm border border-zinc-200 p-3 dark:border-zinc-800">
  <legend class="flex w-full items-center justify-between gap-2 px-1">
    <span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Checklist</span>
    <span class="flex items-center gap-1.5 text-[10px] tabular-nums text-zinc-400">
      {#if pendingCount > 0}
        <span class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {pendingCount}
        </span>
      {/if}
      {#if doneCount > 0}
        <span class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 px-1 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
          {doneCount}
        </span>
      {/if}
    </span>
  </legend>

  {#if !formOpen}
    <button
      type="button"
      onclick={openForm}
      disabled={subOptions.length === 0}
      class="flex w-full items-center justify-center gap-2 border border-dashed border-zinc-300 py-2.5 text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      aria-label="Add transfer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
      <span>Add transfer</span>
    </button>
  {:else}
    <div class="space-y-3 rounded-sm border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
      <label class="block space-y-1">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">Item</span>
        <select
          bind:value={selectedKey}
          onchange={applySelectionDefaults}
          class="w-full border border-zinc-200 bg-white py-2 pl-2 text-sm dark:border-zinc-800 dark:bg-black"
        >
          {#each subOptions as opt (opt.key)}
            <option value={opt.key}>
              {opt.name} · {formatCurrency(opt.amount)}
            </option>
          {/each}
        </select>
      </label>

      {#if selectedOption}
        <p class="text-center font-mono text-lg tabular-nums tracking-tight">
          {formatCurrency(selectedOption.amount)}
        </p>
      {/if}

      <div class="flex items-center justify-center gap-2">
        <div class="flex flex-col items-center gap-1">
          <span class="text-[9px] uppercase tracking-wider text-zinc-400">From</span>
          <div class="flex gap-1">
            {#each PICS as p}
              <button
                type="button"
                onclick={() => {
                  senderPic = p;
                  if (receiverPic === p) receiverPic = otherPic(p);
                }}
                class="rounded-full transition ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950
                  {senderPic === p ? 'ring-zinc-900 dark:ring-white' : 'ring-transparent opacity-50 hover:opacity-100'}"
                aria-label="Sender {p}"
                aria-pressed={senderPic === p}
              >
                <PicBadge name={p} />
              </button>
            {/each}
          </div>
        </div>

        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-zinc-400" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>

        <div class="flex flex-col items-center gap-1">
          <span class="text-[9px] uppercase tracking-wider text-zinc-400">To</span>
          <div class="flex gap-1">
            {#each PICS as p}
              <button
                type="button"
                onclick={() => {
                  receiverPic = p;
                  if (senderPic === p) senderPic = otherPic(p);
                }}
                class="rounded-full transition ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950
                  {receiverPic === p ? 'ring-zinc-900 dark:ring-white' : 'ring-transparent opacity-50 hover:opacity-100'}"
                aria-label="Receiver {p}"
                aria-pressed={receiverPic === p}
              >
                <PicBadge name={p} />
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap justify-center gap-1.5">
        {#each pocketOptions as p}
          <button
            type="button"
            onclick={() => (pocket = p)}
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition
              {pocket === p
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}"
            aria-pressed={pocket === p}
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style="background-color: {pocketDotColor(p)}"
              aria-hidden="true"
            ></span>
            {p}
          </button>
        {/each}
      </div>

      {#if formError}
        <p class="text-center text-[11px] text-red-600 dark:text-red-400">{formError}</p>
      {/if}

      <div class="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onclick={handleSave}
          class="flex flex-1 items-center justify-center gap-1.5 border border-black bg-black py-2 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
        >
          {#if saving}
            …
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          {/if}
        </button>
        <button
          type="button"
          disabled={saving}
          onclick={cancelForm}
          class="flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-300 text-zinc-500 dark:border-zinc-600"
          aria-label="Cancel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  {#if items.length > 0}
    <ul class="space-y-1.5">
      {#each items as item (item.id)}
        <li
          class="flex items-center gap-2 rounded-sm border px-2 py-2 transition
            {item.done
            ? 'border-emerald-200 bg-emerald-50/80 opacity-75 dark:border-emerald-900 dark:bg-emerald-950/30'
            : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black'}"
        >
          <button
            type="button"
            disabled={togglingId === item.id}
            onclick={() => toggleDone(item)}
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition
              {item.done
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-zinc-300 bg-zinc-100 text-transparent hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-800'}"
            aria-label={item.done ? 'Mark pending' : 'Mark done'}
          >
            {#if item.done}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            {/if}
          </button>

          <div class="min-w-0 flex-1 {item.done ? 'pointer-events-none' : ''}">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-medium {item.done ? 'text-emerald-800 line-through dark:text-emerald-200' : ''}">
                {item.subcategoryName}
              </span>
              <span class="ml-auto shrink-0 font-mono text-xs tabular-nums {item.done ? 'text-emerald-700 dark:text-emerald-300' : ''}">
                {formatCurrency(item.amount)}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-[10px]">
              <span
                class="inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold uppercase tracking-wide
                  {item.done ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  style="background-color: {pocketDotColor(item.pocket)}"
                  aria-hidden="true"
                ></span>
                {item.pocket || '—'}
              </span>
              <PicBadge name={item.senderPic} />
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-zinc-400" aria-hidden="true">
                <path d="M5 12h12" />
                <path d="m13 7 5 5-5 5" />
              </svg>
              <PicBadge name={item.receiverPic} />
            </div>
          </div>

          {#if !item.done}
            <button
              type="button"
              onclick={() => removeItem(item.id)}
              class="flex h-6 w-6 shrink-0 items-center justify-center text-zinc-400 hover:text-red-500"
              aria-label="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !formOpen}
    <p class="py-2 text-center text-[11px] text-zinc-400">No transfers yet</p>
  {/if}

  {#if pocketTotals.length > 0}
    <div class="space-y-2 border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
      <p class="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Pending by pocket</p>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each pocketTotals as group (group.pocket)}
          <div class="rounded-sm border border-zinc-200 p-2 dark:border-zinc-800">
            <div class="mb-1.5 flex items-center gap-1.5">
              <span
                class="h-2.5 w-2.5 rounded-full"
                style="background-color: {group.color}"
                aria-hidden="true"
              ></span>
              <span class="text-[11px] font-semibold uppercase tracking-wide">{group.pocket}</span>
            </div>
            <ul class="space-y-0.5">
              {#each group.pics as row (row.pic)}
                <li class="flex items-center justify-between gap-2">
                  <PicBadge name={row.pic} />
                  <span class="font-mono text-xs tabular-nums">{formatCurrency(row.total)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</fieldset>
