<script lang="ts">
  import {
    createChecklistItem,
    deleteChecklistItem,
    getReimbursements,
    markReimbursementPaid,
    updateChecklistItem,
  } from '$lib/api';
  import AmountInput from '$lib/components/AmountInput.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import TransferChecklistButton from '$lib/components/TransferChecklistButton.svelte';
  import TransferPendingDetails from '$lib/components/TransferPendingDetails.svelte';
  import { formatCurrency, parseAmountInput } from '$lib/format';
  import { groupTransferItems } from '$lib/reimbursements';
  import {
    collectPendingLines,
    computeDirectedPairRows,
    computePocketNetRows,
    computeTransferNetRows,
    linesForDirectedPair,
    linesForNetPair,
    linesForPocketNet,
    type TransferPendingLine,
  } from '$lib/transfer-pending';
  import { DEFAULT_PIC, PICS, type Pic } from '$lib/pics';
  import type { Category, PlanChecklistItem, ReimbursementItem } from '$lib/types';

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

  let reimbursements = $state<ReimbursementItem[]>([]);
  let reimbLoading = $state(true);
  let error = $state('');
  let payingId = $state<number | null>(null);
  let payingBulkKey = $state<string | null>(null);
  let expandedKey = $state<string | null>(null);

  let formOpen = $state(false);
  let itemQuery = $state('');
  let itemFocused = $state(false);
  let customAmount = $state('');
  let senderPic = $state<Pic>(DEFAULT_PIC);
  let receiverPic = $state<Pic>('Anggita');
  let pocket = $state('');
  let saving = $state(false);
  let togglingId = $state<number | null>(null);
  let formError = $state('');

  const pendingLines = $derived(collectPendingLines({ checklistItems: items, reimbursements }));
  const directedPairRows = $derived(computeDirectedPairRows(pendingLines));
  const pocketNetRows = $derived(computePocketNetRows(pendingLines));
  const transferNetRows = $derived(computeTransferNetRows(pendingLines));
  const grouped = $derived(groupTransferItems({ checklistItems: items, reimbursements }));

  const pocketNetGroups = $derived.by(() => {
    const map = new Map<string, typeof pocketNetRows>();
    for (const row of pocketNetRows) {
      const list = map.get(row.pocket) ?? [];
      list.push(row);
      map.set(row.pocket, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pocket, rows]) => ({
        pocket,
        color: pocketColors[pocket] ?? '#71717a',
        rows,
      }));
  });

  const subOptions = $derived.by((): SubOption[] => {
    const opts: SubOption[] = [];
    for (const cat of categories) {
      for (const sub of subcategoryInputs[cat.id] ?? []) {
        const name = sub.name.trim();
        if (!name) continue;
        opts.push({
          key: `${cat.id}|${name.toLowerCase()}`,
          categoryId: cat.id,
          categoryName: cat.name,
          name,
          amount: parseAmountInput(sub.amount || ''),
          pic: sub.pic,
          pocket: sub.pocket,
        });
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  });

  const filteredOptions = $derived.by(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return subOptions;
    return subOptions.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.categoryName.toLowerCase().includes(q),
    );
  });

  const matchedOption = $derived.by(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return undefined;
    return subOptions.find((o) => o.name.toLowerCase() === q);
  });

  const isCustomItem = $derived(Boolean(itemQuery.trim() && !matchedOption));

  const saveAmount = $derived.by(() => {
    if (matchedOption && matchedOption.amount > 0) return matchedOption.amount;
    return parseAmountInput(customAmount);
  });

  const showSuggestions = $derived(
    formOpen && itemFocused && (filteredOptions.length > 0 || isCustomItem),
  );

  const pendingCount = $derived(
    items.filter((i) => !i.done).length + reimbursements.length,
  );
  const doneCount = $derived(items.filter((i) => i.done).length);

  const hasContent = $derived(
    grouped.balancing.length > 0 ||
      grouped.pairs.length > 0 ||
      reimbursements.length > 0 ||
      items.length > 0,
  );

  function otherPic(p: Pic): Pic {
    return PICS.find((x) => x !== p) ?? DEFAULT_PIC;
  }

  function pocketDotColor(name: string): string {
    return pocketColors[name?.trim().toUpperCase()] ?? '#71717a';
  }

  function toggleExpanded(key: string) {
    expandedKey = expandedKey === key ? null : key;
  }

  async function settleLines(toSettle: TransferPendingLine[]) {
    const checklistIds = new Set(
      toSettle.filter((l) => l.checklistId != null).map((l) => l.checklistId!),
    );
    const reimbIds = new Set(
      toSettle.filter((l) => l.reimbursementId != null).map((l) => l.reimbursementId!),
    );

    for (const line of toSettle) {
      if (line.reimbursementId != null) {
        await markReimbursementPaid(line.reimbursementId);
      }
    }
    for (const line of toSettle) {
      if (line.checklistId != null) {
        await updateChecklistItem(line.checklistId, true);
      }
    }

    reimbursements = reimbursements.filter((r) => !reimbIds.has(r.id));
    if (checklistIds.size > 0) {
      await onChange();
    }
  }

  async function handleSettleDirected(senderPic: string, receiverPic: string, bulkKey: string) {
    payingBulkKey = bulkKey;
    error = '';
    try {
      await settleLines(linesForDirectedPair(pendingLines, senderPic, receiverPic));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to settle transfer';
      try {
        const reimbRes = await getReimbursements(period);
        reimbursements = reimbRes.reimbursements;
        await onChange();
      } catch {
        /* keep partial state */
      }
    } finally {
      payingBulkKey = null;
    }
  }

  async function handleSettleNet(personA: string, personB: string, bulkKey: string) {
    payingBulkKey = bulkKey;
    error = '';
    try {
      await settleLines(linesForNetPair(pendingLines, personA, personB));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to settle net transfer';
      try {
        const reimbRes = await getReimbursements(period);
        reimbursements = reimbRes.reimbursements;
        await onChange();
      } catch {
        /* keep partial state */
      }
    } finally {
      payingBulkKey = null;
    }
  }

  async function handleSettlePocketNet(
    pocket: string,
    senderPic: string,
    receiverPic: string,
    bulkKey: string,
  ) {
    payingBulkKey = bulkKey;
    error = '';
    try {
      await settleLines(linesForPocketNet(pendingLines, pocket, senderPic, receiverPic));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to settle pocket transfer';
      try {
        const reimbRes = await getReimbursements(period);
        reimbursements = reimbRes.reimbursements;
        await onChange();
      } catch {
        /* keep partial state */
      }
    } finally {
      payingBulkKey = null;
    }
  }

  function isBulkPaying(): boolean {
    return payingBulkKey != null || payingId != null;
  }

  async function loadReimbursements(activePeriod: string) {
    reimbLoading = true;
    error = '';
    try {
      const reimbRes = await getReimbursements(activePeriod);
      reimbursements = reimbRes.reimbursements;
    } catch (e) {
      reimbursements = [];
      error = e instanceof Error ? e.message : 'Failed to load reimbursements';
    } finally {
      reimbLoading = false;
    }
  }

  $effect(() => {
    void loadReimbursements(period);
  });

  function openForm() {
    formOpen = true;
    formError = '';
    itemQuery = '';
    customAmount = '';
    senderPic = DEFAULT_PIC;
    receiverPic = 'Anggita';
    pocket = 'BCA';
  }

  function pickOption(opt: SubOption) {
    itemQuery = opt.name;
    senderPic = opt.pic;
    receiverPic = otherPic(opt.pic);
    pocket = opt.pocket || 'BCA';
    itemFocused = false;
  }

  function cancelForm() {
    formOpen = false;
    formError = '';
    itemFocused = false;
  }

  async function handleSave() {
    const name = itemQuery.trim();
    if (!name) {
      formError = 'Item required';
      return;
    }
    if (senderPic === receiverPic) {
      formError = 'Sender ≠ receiver';
      return;
    }
    const amount = saveAmount;
    if (amount <= 0) {
      formError = isCustomItem ? 'Enter amount' : 'Item has no budget amount';
      return;
    }

    saving = true;
    formError = '';
    try {
      await createChecklistItem({
        period,
        categoryId: matchedOption?.categoryId ?? null,
        subcategoryName: name,
        amount,
        senderPic,
        receiverPic,
        pocket,
      });
      formOpen = false;
      itemFocused = false;
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

  async function handlePaid(item: ReimbursementItem) {
    payingId = item.id;
    error = '';
    try {
      await markReimbursementPaid(item.id);
      reimbursements = reimbursements.filter((r) => r.id !== item.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark as paid';
    } finally {
      payingId = null;
    }
  }
</script>

<fieldset class="space-y-3 rounded-sm border border-zinc-200 p-3 dark:border-zinc-800">
  <legend class="flex w-full items-center justify-between gap-2 px-1">
    <span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Transfer</span>
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

  <p class="text-[10px] text-zinc-500">
    Plan transfers + auto reimbursements from Detail (Paid by ≠ plan PIC). Mark checklist when transferred; mark Paid to settle Detail.
  </p>

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}

  {#if !formOpen}
    <button
      type="button"
      onclick={openForm}
      class="flex w-full items-center justify-center gap-2 border border-dashed border-zinc-300 py-2.5 text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
      <div class="relative">
        <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          bind:value={itemQuery}
          onfocus={() => (itemFocused = true)}
          onblur={() => setTimeout(() => (itemFocused = false), 150)}
          placeholder="Search item…"
          class="w-full border border-zinc-200 bg-white py-2 pl-8 pr-2 text-sm dark:border-zinc-800 dark:bg-black"
          autocomplete="off"
        />
        {#if showSuggestions}
          <ul
            class="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
            role="listbox"
          >
            {#each filteredOptions as opt (opt.key)}
              <li>
                <button
                  type="button"
                  onclick={() => pickOption(opt)}
                  class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span class="min-w-0 flex-1 truncate">{opt.name}</span>
                  <span class="shrink-0 text-[10px] text-zinc-400">{opt.categoryName}</span>
                </button>
              </li>
            {/each}
            {#if isCustomItem}
              <li class="border-t border-dashed border-zinc-200 px-2.5 py-2 text-[11px] text-zinc-500 dark:border-zinc-700">
                <span class="inline-flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Custom: <strong class="text-zinc-700 dark:text-zinc-300">{itemQuery.trim()}</strong>
                </span>
              </li>
            {/if}
          </ul>
        {/if}
      </div>

      {#if isCustomItem || (matchedOption && matchedOption.amount <= 0)}
        <div class="space-y-1">
          <span class="text-[10px] uppercase tracking-wider text-zinc-400">Amount</span>
          <AmountInput bind:value={customAmount} aria-label="Custom amount" />
        </div>
      {:else if matchedOption}
        <p class="text-center font-mono text-lg tabular-nums tracking-tight">
          {formatCurrency(matchedOption.amount)}
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

  {#if hasContent}
    <div class="space-y-3">
      {#if grouped.balancing.length > 0}
        <ul class="space-y-1.5">
          {#each grouped.balancing as item (item.id)}
            <li
              class="flex items-center gap-2 rounded-sm border px-2 py-2 transition
                {item.done
                ? 'border-emerald-200 bg-emerald-50/80 opacity-75 dark:border-emerald-900 dark:bg-emerald-950/30'
                : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'}"
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true">
                    <path d="M12 3v18" />
                    <path d="M3 12h18" />
                    <circle cx="12" cy="3" r="2" />
                    <circle cx="12" cy="21" r="2" />
                    <circle cx="3" cy="12" r="2" />
                    <circle cx="21" cy="12" r="2" />
                  </svg>
                  <span class="truncate text-sm font-medium {item.done ? 'text-emerald-800 line-through dark:text-emerald-200' : ''}">
                    {item.subcategoryName}
                  </span>
                  <span class="ml-auto shrink-0 font-mono text-xs tabular-nums">{formatCurrency(item.amount)}</span>
                </div>
                <div class="mt-1 flex items-center gap-1.5 text-[10px]">
                  <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-1 py-0.5 font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <span class="h-1.5 w-1.5 rounded-full" style="background-color: {pocketDotColor(item.pocket)}" aria-hidden="true"></span>
                    {item.pocket || '—'}
                  </span>
                  <PicBadge name={item.senderPic} />
                  <span class="text-zinc-400">→</span>
                  <PicBadge name={item.receiverPic} />
                  <span class="rounded bg-amber-100 px-1 text-[9px] font-medium uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Auto</span>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#each grouped.pairs as group (group.key)}
        <div class="space-y-1.5">
          <div class="flex items-center gap-1.5 border-b border-zinc-200 pb-1 dark:border-zinc-800">
            <PicBadge name={group.senderPic} />
            <span class="text-[10px] text-zinc-400">→</span>
            <PicBadge name={group.receiverPic} />
          </div>

          <ul class="space-y-1.5">
            {#each group.rows as row (row.kind === 'checklist' ? `c-${row.item.id}` : `r-${row.item.id}`)}
              {#if row.kind === 'checklist'}
                {@const item = row.item}
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
                      <span class="ml-auto shrink-0 font-mono text-xs tabular-nums">{formatCurrency(item.amount)}</span>
                    </div>
                    <div class="mt-1 flex items-center gap-1.5 text-[10px]">
                      <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        <span class="h-1.5 w-1.5 rounded-full" style="background-color: {pocketDotColor(item.pocket)}" aria-hidden="true"></span>
                        {item.pocket || 'BCA'}
                      </span>
                      <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Plan</span>
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
              {:else}
                {@const item = row.item}
                <li
                  class="flex items-center gap-2 rounded-sm border px-2 py-2 transition border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
                >
                  <TransferChecklistButton
                    disabled={isBulkPaying()}
                    loading={payingId === item.id}
                    label="Mark paid"
                    onclick={() => handlePaid(item)}
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate text-sm font-medium">{item.detail}</span>
                      <span class="ml-auto shrink-0 font-mono text-xs tabular-nums">{formatCurrency(item.cost)}</span>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {item.date}
                      </span>
                      <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {item.categoryName}
                      </span>
                      {#if item.subCategory?.trim()}
                        <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {item.subCategory.trim()}
                        </span>
                      {/if}
                    </div>
                  </div>
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else if !formOpen && !reimbLoading}
    <p class="py-2 text-center text-[11px] text-zinc-400">No pending transfers</p>
  {/if}

  {#if pocketNetGroups.length > 0}
    <div class="space-y-2 border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
      <p class="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Pending by pocket</p>
      <div class="space-y-3">
        {#each pocketNetGroups as group (group.pocket)}
          <div class="space-y-1.5">
            <div class="flex items-center gap-1.5">
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                style="background-color: {group.color}"
                aria-hidden="true"
              ></span>
              <span class="text-[11px] font-semibold uppercase tracking-wide">{group.pocket}</span>
            </div>
            {#each group.rows as row (row.key)}
              {@const expandKey = `pocket:${row.key}`}
              <div class="rounded-sm border border-zinc-200 dark:border-zinc-800">
                <div class="flex items-center gap-2 px-2 py-2">
                  <TransferChecklistButton
                    disabled={isBulkPaying()}
                    loading={payingBulkKey === row.key}
                    label="Settle {row.senderPic} to {row.receiverPic} in {row.pocket}"
                    onclick={() => handleSettlePocketNet(row.pocket, row.senderPic, row.receiverPic, row.key)}
                  />
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onclick={() => toggleExpanded(expandKey)}
                  >
                    <PicBadge name={row.senderPic} />
                    <span class="text-[10px] text-zinc-400">→</span>
                    <PicBadge name={row.receiverPic} />
                  </button>
                  <span class="shrink-0 font-mono text-xs tabular-nums">{formatCurrency(row.total)}</span>
                </div>
                {#if expandedKey === expandKey}
                  <div class="px-2 pb-2">
                    <TransferPendingDetails lines={row.lines} showPicPair />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if directedPairRows.length > 0}
    <div class="space-y-2 border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
      <p class="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Pending by PIC</p>
      <div class="space-y-1.5">
        {#each directedPairRows as row (row.key)}
          {@const expandKey = `pic:${row.key}`}
          <div class="rounded-sm border border-zinc-200 dark:border-zinc-800">
            <div class="flex items-center gap-2 px-2 py-2">
              <TransferChecklistButton
                disabled={isBulkPaying()}
                loading={payingBulkKey === row.key}
                label="Settle {row.senderPic} to {row.receiverPic}"
                onclick={() => handleSettleDirected(row.senderPic, row.receiverPic, row.key)}
              />
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onclick={() => toggleExpanded(expandKey)}
              >
                <PicBadge name={row.senderPic} />
                <span class="text-[10px] text-zinc-400">→</span>
                <PicBadge name={row.receiverPic} />
              </button>
              <span class="shrink-0 font-mono text-xs tabular-nums">{formatCurrency(row.total)}</span>
            </div>
            {#if expandedKey === expandKey}
              <div class="px-2 pb-2">
                <TransferPendingDetails lines={row.lines} />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if transferNetRows.length > 0}
    <div
      class="space-y-1.5 border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800"
      aria-label="Net final totals"
    >
      <p class="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Net (final)</p>
      <div class="space-y-1.5">
        {#each transferNetRows as row (row.key)}
          {@const expandKey = `net:${row.key}`}
          <div class="rounded-sm border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="flex items-center gap-2 px-2 py-2">
              <TransferChecklistButton
                disabled={isBulkPaying()}
                loading={payingBulkKey === row.key}
                label="Settle net {row.senderPic} to {row.receiverPic}"
                onclick={() => handleSettleNet(row.personA, row.personB, row.key)}
              />
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onclick={() => toggleExpanded(expandKey)}
              >
                <PicBadge name={row.senderPic} />
                <span class="text-[10px] text-zinc-400">→</span>
                <PicBadge name={row.receiverPic} />
              </button>
              <span class="shrink-0 font-mono text-xs tabular-nums">{formatCurrency(row.total)}</span>
            </div>
            {#if expandedKey === expandKey}
              <div class="px-2 pb-2">
                <TransferPendingDetails lines={row.lines} showPicPair />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</fieldset>
