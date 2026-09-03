<script lang="ts">
  import { page } from '$app/state';
  import {
    createAuthEmail,
    createPocket,
    deleteAuthEmail,
    deletePocket,
    getAuthEmails,
    getPockets,
    syncDbToSheet,
    syncSheetToDb,
    updateAuthEmailPic,
    updatePocketColor,
  } from '$lib/api';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { PICS, type Pic } from '$lib/pics';
  import { POCKET_COLORS } from '$lib/pocket-colors';
  import { periodFromUrl } from '$lib/period';
  import type { AuthEmailSetting, PocketSetting } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));

  let pockets = $state<PocketSetting[]>([]);
  let authEmails = $state<AuthEmailSetting[]>([]);
  let pocketName = $state('');
  let pocketColor = $state(POCKET_COLORS[0]);
  let authEmailInput = $state('');
  let authEmailPic = $state<Pic>('Derwin');
  let loading = $state(true);
  let pocketBusy = $state(false);
  let authBusy = $state(false);
  let colorBusyId = $state<number | null>(null);
  let syncing = $state<'db-to-sheet' | 'sheet-to-db' | null>(null);
  let success = $state('');
  let error = $state('');

  async function loadSettings() {
    loading = true;
    try {
      const [pocketRes, emailRes] = await Promise.all([getPockets(), getAuthEmails()]);
      pockets = pocketRes.pockets;
      authEmails = emailRes.emails;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load settings';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadSettings();
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
      pocketColor = POCKET_COLORS[0];
      await loadSettings();
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

  async function handleAddAuthEmail() {
    const email = authEmailInput.trim().toLowerCase();
    if (!email) return;
    authBusy = true;
    success = '';
    error = '';
    try {
      await createAuthEmail(email, authEmailPic);
      authEmailInput = '';
      await loadSettings();
      success = `${email} can now sign in as ${authEmailPic}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save email';
    } finally {
      authBusy = false;
    }
  }

  async function handleUpdateAuthPic(item: AuthEmailSetting, pic: Pic) {
    if (item.pic === pic) return;
    authBusy = true;
    success = '';
    error = '';
    try {
      const { email } = await updateAuthEmailPic(item.id, pic);
      authEmails = authEmails.map((row) => (row.id === item.id ? email : row));
      success = `${email.email} → ${pic}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update PIC';
    } finally {
      authBusy = false;
    }
  }

  async function handleDeleteAuthEmail(item: AuthEmailSetting) {
    if (!confirm(`Remove login for "${item.email}"?`)) return;
    authBusy = true;
    success = '';
    error = '';
    try {
      await deleteAuthEmail(item.id);
      authEmails = authEmails.filter((row) => row.id !== item.id);
      success = `${item.email} removed`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to remove email';
    } finally {
      authBusy = false;
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
  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Sync</legend>
    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncDbToSheet}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">DB → Sheet</span>
      {#if syncing === 'db-to-sheet'}<span class="mt-1 block text-[10px] text-zinc-500">…</span>{/if}
    </button>
    <button
      type="button"
      disabled={syncing != null}
      onclick={handleSyncSheetToDb}
      class="w-full border border-zinc-200 px-3 py-3 text-left disabled:opacity-50 dark:border-zinc-800"
    >
      <span class="block text-sm font-medium">Sheet → DB</span>
      {#if syncing === 'sheet-to-db'}<span class="mt-1 block text-[10px] text-zinc-500">…</span>{/if}
    </button>
  </fieldset>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Login</legend>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="email"
        bind:value={authEmailInput}
        placeholder="name@gmail.com"
        class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      />
      <div class="flex items-center gap-2">
        <div class="flex gap-1">
          {#each PICS as p}
            <button
              type="button"
              onclick={() => (authEmailPic = p)}
              class="rounded-full transition ring-2 ring-offset-1 ring-offset-white dark:ring-offset-black
                {authEmailPic === p ? 'ring-zinc-900 dark:ring-white' : 'ring-transparent opacity-50'}"
              aria-label="PIC {p}"
              aria-pressed={authEmailPic === p}
            >
              <PicBadge name={p} />
            </button>
          {/each}
        </div>
        <button
          type="button"
          onclick={handleAddAuthEmail}
          disabled={authBusy || !authEmailInput.trim()}
          class="ml-auto shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 sm:ml-0 dark:border-zinc-700"
        >
          + Add
        </button>
      </div>
    </div>

    {#if loading}
      <p class="text-xs text-zinc-500">Loading…</p>
    {:else if authEmails.length === 0}
      <p class="text-xs text-zinc-500">No emails</p>
    {:else}
      <div class="space-y-1">
        {#each authEmails as item (item.id)}
          <div class="flex items-center justify-between gap-2 border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <div class="min-w-0">
              <span class="block truncate text-sm">{item.email}</span>
              {#if item.isSuperUser}
                <span class="text-[10px] uppercase tracking-wider text-zinc-400">Owner</span>
              {/if}
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <div class="flex gap-1">
                {#each PICS as p}
                  <button
                    type="button"
                    disabled={authBusy}
                    onclick={() => handleUpdateAuthPic(item, p)}
                    class="rounded-full transition ring-2 ring-offset-1 ring-offset-white dark:ring-offset-black
                      {item.pic === p ? 'ring-zinc-900 dark:ring-white' : 'ring-transparent opacity-40 hover:opacity-80'}"
                    aria-label="Set {item.email} to {p}"
                    aria-pressed={item.pic === p}
                  >
                    <PicBadge name={p} />
                  </button>
                {/each}
              </div>
              {#if !item.isSuperUser}
                <button
                  type="button"
                  onclick={() => handleDeleteAuthEmail(item)}
                  disabled={authBusy}
                  class="inline-flex h-7 w-7 items-center justify-center text-red-600 disabled:opacity-50 dark:text-red-400"
                  aria-label="Remove {item.email}"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </fieldset>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Pocket</legend>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="text"
        bind:value={pocketName}
        placeholder="Pocket name (e.g. BCA)"
        class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
      />
      <div class="flex items-center gap-2">
        <ColorPicker bind:value={pocketColor} aria-label="Select pocket color" />
        <button
          type="button"
          onclick={handleAddPocket}
          disabled={pocketBusy || !pocketName.trim()}
          class="ml-auto shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 sm:ml-0 dark:border-zinc-700"
        >
          +
        </button>
      </div>
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
            <div class="flex shrink-0 items-center gap-2">
              <ColorPicker
                value={item.color}
                size="sm"
                disabled={colorBusyId === item.id}
                aria-label="Set {item.name} color"
                onchange={(color) => handleUpdatePocketColor(item, color)}
              />
              <button
                type="button"
                onclick={() => handleDeletePocket(item)}
                disabled={pocketBusy || colorBusyId === item.id}
                class="inline-flex h-7 w-7 items-center justify-center text-red-600 disabled:opacity-50 dark:text-red-400"
                aria-label="Delete {item.name}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
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
