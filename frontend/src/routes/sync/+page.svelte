<script lang="ts">
  import { page } from '$app/state';
  import { createMonthSheet, syncDbToSheet, syncSheetToDb } from '$lib/api';
  import { periodFromUrl } from '$lib/period';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const currentYear = new Date().getFullYear();
  const periodYear = $derived(Number.parseInt(period.split(/\s+/).pop() ?? '', 10));
  const canCreateMonthSheet = $derived(
    Number.isFinite(periodYear) && periodYear === currentYear,
  );

  let syncing = $state<'db-to-sheet' | 'sheet-to-db' | 'create-month-sheet' | null>(null);
  let syncMessage = $state('');
  let syncError = $state('');

  async function handleSyncDbToSheet() {
    if (
      !confirm(
        `Sync to Spreadsheet for ${period}?\n\nThis replaces all ${period} rows in the DETAIL tab with data from the database. This cannot be undone.`,
      )
    ) {
      return;
    }

    syncing = 'db-to-sheet';
    syncMessage = '';
    syncError = '';
    try {
      const result = await syncDbToSheet(period);
      syncMessage = `Spreadsheet updated: ${result.written ?? 0} rows written (${result.deleted ?? 0} old rows replaced).`;
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Sync to spreadsheet failed';
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
    syncMessage = '';
    syncError = '';
    try {
      const result = await syncSheetToDb(period);
      syncMessage = `Database updated: ${result.written ?? 0} rows imported (${result.deleted ?? 0} removed).`;
      if (result.skipped) {
        syncMessage += ` ${result.skipped} sheet rows skipped.`;
      }
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Sync from spreadsheet failed';
    } finally {
      syncing = null;
    }
  }

  async function handleCreateMonthSheet() {
    const monthName = period.split(/\s+/)[0] ?? period;
    const sheetName = monthName.toUpperCase();
    if (
      !confirm(
        `Create or update sheet "${sheetName}" for ${period}?\n\nThis writes a monthly overview (PLAN, INCOME, INVEST & SAVINGS, BALANCING, and transactions) like JULY_BAK. Only available for ${currentYear}.`,
      )
    ) {
      return;
    }

    syncing = 'create-month-sheet';
    syncMessage = '';
    syncError = '';
    try {
      const result = await createMonthSheet(period);
      if (!result.ok) {
        syncError = result.error ?? 'Failed to create month sheet';
        return;
      }
      syncMessage = result.created
        ? `Created sheet "${result.sheetName}" with ${result.rowsWritten ?? 0} rows.`
        : `Updated sheet "${result.sheetName}" with ${result.rowsWritten ?? 0} rows.`;
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Failed to create month sheet';
    } finally {
      syncing = null;
    }
  }
</script>

<section class="space-y-4">
  <p class="text-[11px] uppercase tracking-wider text-zinc-500">Sync · {period}</p>

  <p class="text-[11px] text-zinc-500">
    Uses the month and year from the header. Only <strong class="text-zinc-700 dark:text-zinc-300">{period}</strong>
    is affected.
  </p>

  <div class="space-y-2">
    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncDbToSheet}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Sync to Spreadsheet</span>
      <span class="text-[11px] text-zinc-500">Database → DETAIL tab</span>
      {#if syncing === 'db-to-sheet'}
        <span class="mt-1 block text-[10px] text-zinc-500">Syncing…</span>
      {/if}
    </button>

    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncSheetToDb}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Sync from Spreadsheet</span>
      <span class="text-[11px] text-zinc-500">DETAIL tab → Database</span>
      {#if syncing === 'sheet-to-db'}
        <span class="mt-1 block text-[10px] text-zinc-500">Syncing…</span>
      {/if}
    </button>

    <button
      type="button"
      disabled={syncing != null || !canCreateMonthSheet}
      onclick={handleCreateMonthSheet}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Create Month Sheet</span>
      <span class="text-[11px] text-zinc-500">
        {#if canCreateMonthSheet}
          Database → {period.split(/\s+/)[0]?.toUpperCase() ?? 'MONTH'} tab (JULY_BAK layout)
        {:else}
          Only available for {currentYear}
        {/if}
      </span>
      {#if syncing === 'create-month-sheet'}
        <span class="mt-1 block text-[10px] text-zinc-500">Creating…</span>
      {/if}
    </button>
  </div>

  {#if syncError}
    <p class="text-xs text-red-600 dark:text-red-400">{syncError}</p>
  {/if}
  {#if syncMessage}
    <p class="text-xs text-emerald-600 dark:text-emerald-400">{syncMessage}</p>
  {/if}
</section>
