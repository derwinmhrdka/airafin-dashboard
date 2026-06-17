<script lang="ts">
  import { page } from '$app/state';
  import {
    createPocket,
    deletePocket,
    getPockets,
    syncDbToSheet,
    syncSheetToDb,
    updatePocketColor,
  } from '$lib/api';
  import { periodFromUrl } from '$lib/period';
  import type { PocketSetting } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const SIMPLE_COLORS = [
    '#00529c', // BCA blue
    '#f7b600', // Mandiri yellow
    '#00a859', // DANA/OVO-like green
    '#ef4444', // Alert red
    '#7c3aed', // Bibit-like purple
    '#0ea5e9', // E-wallet sky blue
    '#6b7280', // Neutral gray
    '#111827', // Near black
  ] as const;

  let pockets = $state<PocketSetting[]>([]);
  let pocketName = $state('');
  let pocketColor = $state(SIMPLE_COLORS[0]);
  let loading = $state(true);
  let pocketBusy = $state(false);
  let colorBusyId = $state<number | null>(null);
  let syncing = $state<'db-to-sheet' | 'sheet-to-db' | null>(null);
  let success = $state('');
  let error = $state('');

  async function loadPockets() {
    loading = true;
    try {
      const res = await getPockets();
      pockets = res.pockets;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load pockets';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadPockets();
  });

  async function handleAddPocket() {
    const name = pocketName.trim().toUpperCase();
    if (!name) return;
    pocketBusy = true;
    success = '';
    error = '';
    try {
      await createPocket(name, pocketColor);
      pocketName = '';
      pocketColor = SIMPLE_COLORS[0];
      await loadPockets();
      success = `Pocket ${name} saved`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save pocket';
    } finally {
      pocketBusy = false;
    }
  }

  async function handleDeletePocket(item: PocketSetting) {
    if (!confirm(`Delete pocket "${item.name}"?`)) return;
    pocketBusy = true;
    success = '';
    error = '';
    try {
      await deletePocket(item.id);
      pockets = pockets.filter((p) => p.id !== item.id);
      success = `Pocket ${item.name} deleted`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete pocket';
    } finally {
      pocketBusy = false;
    }
  }

  async function handleSyncDbToSheet() {
    if (
      !confirm(
        `Sync to Spreadsheet for ${period}?\n\nThis replaces all ${period} rows in the DETAIL tab with data from the database. This cannot be undone.`,
      )
    ) {
      return;
    }
    syncing = 'db-to-sheet';
    success = '';
    error = '';
    try {
      const result = await syncDbToSheet(period);
      success = `Spreadsheet updated: ${result.written ?? 0} rows written (${result.deleted ?? 0} old rows replaced).`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sync to spreadsheet failed';
    } finally {
      syncing = null;
    }
  }

  async function handleSyncSheetToDb() {
    if (
      !confirm(
        `Sync from Spreadsheet for ${period}?\n\nThis deletes all ${period} transactions in the database and replaces them with rows from the DETAIL tab. This cannot be undone.`,
      )
    ) {
      return;
    }
    syncing = 'sheet-to-db';
    success = '';
    error = '';
    try {
      const result = await syncSheetToDb(period);
      success = `Database updated: ${result.written ?? 0} rows imported (${result.deleted ?? 0} removed).`;
      if (result.skipped) success += ` ${result.skipped} sheet rows skipped.`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sync from spreadsheet failed';
    } finally {
      syncing = null;
    }
  }

  async function handleUpdatePocketColor(item: PocketSetting, nextColor: string) {
    colorBusyId = item.id;
    success = '';
    error = '';
    try {
      const { pocket } = await updatePocketColor(item.id, nextColor);
      pockets = pockets.map((p) => (p.id === item.id ? pocket : p));
      success = `Pocket ${item.name} color updated`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update pocket color';
    } finally {
      colorBusyId = null;
    }
  }
</script>

<section class="space-y-4">
  <p class="text-[11px] uppercase tracking-wider text-zinc-500">Settings · {period}</p>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Sync</legend>
    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncDbToSheet}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Sync to Spreadsheet</span>
      <span class="text-[11px] text-zinc-500">Database → DETAIL tab</span>
      {#if syncing === 'db-to-sheet'}<span class="mt-1 block text-[10px] text-zinc-500">Syncing…</span>{/if}
    </button>
    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncSheetToDb}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Sync from Spreadsheet</span>
      <span class="text-[11px] text-zinc-500">DETAIL tab → Database</span>
      {#if syncing === 'sheet-to-db'}<span class="mt-1 block text-[10px] text-zinc-500">Syncing…</span>{/if}
    </button>
  </fieldset>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Pocket</legend>
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={pocketName}
        placeholder="Pocket name (e.g. BCA)"
        class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      />
      <div class="flex items-center gap-1 border border-zinc-200 px-2 dark:border-zinc-800">
        <span class="text-[10px] text-zinc-500">Color</span>
        <div class="flex items-center gap-1">
          {#each SIMPLE_COLORS as color}
            <button
              type="button"
              onclick={() => (pocketColor = color)}
              class="h-5 w-5 rounded-full border {pocketColor === color ? 'border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700'}"
              style="background-color: {color}"
              aria-label="Select color {color}"
              title={color}
            ></button>
          {/each}
        </div>
      </div>
      <button
        type="button"
        onclick={handleAddPocket}
        disabled={pocketBusy || !pocketName.trim()}
        class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
      >
        + Add
      </button>
    </div>

    {#if loading}
      <p class="text-xs text-zinc-500">Loading pockets…</p>
    {:else if pockets.length === 0}
      <p class="text-xs text-zinc-500">No pockets yet.</p>
    {:else}
      <div class="space-y-1">
        {#each pockets as item (item.id)}
          <div class="flex items-center justify-between border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full border border-zinc-300 dark:border-zinc-700" style="background-color: {item.color}"></span>
              <span class="text-sm">{item.name}</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                {#each SIMPLE_COLORS as color}
                  <button
                    type="button"
                    disabled={colorBusyId === item.id}
                    onclick={() => handleUpdatePocketColor(item, color)}
                    class="h-5 w-5 rounded-full border {item.color === color ? 'border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700'} disabled:opacity-50"
                    style="background-color: {color}"
                    aria-label="Set {item.name} color {color}"
                    title={color}
                  ></button>
                {/each}
              </div>
              <button
                type="button"
                onclick={() => handleDeletePocket(item)}
                disabled={pocketBusy || colorBusyId === item.id}
                class="border border-red-200 px-2 py-1 text-[10px] text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </fieldset>

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}
  {#if success}
    <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
  {/if}
</section>
