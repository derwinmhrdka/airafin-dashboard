<script lang="ts">
  import { page } from '$app/state';
  import {
    createPic,
    createPocket,
    deletePic,
    deletePocket,
    getPics,
    getPockets,
  } from '$lib/api';
  import BankLogo from '$lib/components/BankLogo.svelte';
  import { bankSlug, searchBanks, type BankChoice } from '$lib/bank-logo';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { withDeferredLoading } from '$lib/deferred-loading';
  import { setPicNames } from '$lib/pics';
  import { floatNavEnabled, setFloatNavEnabled } from '$lib/float-nav';
  import { periodFromUrl } from '$lib/period';
  import type { PicSetting, PocketSetting } from '$lib/types';
  import {
    disableWebPushSubscription,
    ensureWebPushSubscription,
    hasActivePushSubscription,
    pushPermission,
    pushSupported,
  } from '$lib/web-push';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const isAdmin = $derived(page.data.isAdmin === true);
  const sessionPic = $derived(
    typeof page.data.session?.pic === 'string' ? page.data.session.pic.trim() : '',
  );

  let pockets = $state<PocketSetting[]>([]);
  let pics = $state<PicSetting[]>([]);
  let pocketQuery = $state('');
  let pocketChoice = $state<BankChoice | null>(null);
  let pocketOpen = $state(false);
  let pocketActive = $state(0);
  let picNameInput = $state('');
  let loading = $state(false);
  let hydrated = $state(false);
  let pocketBusy = $state(false);
  let picBusy = $state(false);
  let success = $state('');
  let error = $state('');
  let pushEnabled = $state(false);
  let pushBusy = $state(false);
  let pushSupportedHere = $state(true);

  async function refreshPushEnabled() {
    pushSupportedHere = pushSupported() && pushPermission() !== 'unsupported';
    if (!pushSupportedHere) {
      pushEnabled = false;
      return;
    }
    pushEnabled = await hasActivePushSubscription();
  }

  async function handlePushToggle(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const next = input.checked;
    if (pushBusy || !sessionPic) {
      input.checked = pushEnabled;
      return;
    }

    pushBusy = true;
    success = '';
    error = '';
    try {
      if (next) {
        const status = await ensureWebPushSubscription(sessionPic);
        if (status !== 'subscribed') {
          input.checked = false;
          pushEnabled = false;
          return;
        }
        pushEnabled = true;
      } else {
        await disableWebPushSubscription();
        pushEnabled = false;
      }
    } catch {
      input.checked = pushEnabled;
    } finally {
      pushBusy = false;
      await refreshPushEnabled();
    }
  }

  async function loadSettings() {
    await withDeferredLoading(
      (v) => {
        loading = v;
      },
      async () => {
        try {
          const [pocketRes, picRes] = await Promise.all([getPockets(), getPics()]);
          pockets = pocketRes.pockets;
          pics = picRes.pics;
          setPicNames(picRes.pics.map((p) => p.name));
        } catch (e) {
          error = e instanceof Error ? e.message : 'Failed to load settings';
        } finally {
          hydrated = true;
        }
      },
    );
  }

  $effect(() => {
    void loadSettings();
    void refreshPushEnabled();
  });

  const takenSlugs = $derived(
    new Set(pockets.map((item) => bankSlug(item.name)).filter((slug): slug is string => Boolean(slug))),
  );
  const pocketMatches = $derived(searchBanks(pocketQuery).filter((choice) => !takenSlugs.has(choice.slug)));

  function selectPocket(choice: BankChoice) {
    pocketChoice = choice;
    pocketQuery = choice.name;
    pocketOpen = false;
    pocketActive = 0;
  }

  function onPocketInput() {
    pocketChoice = null;
    pocketOpen = true;
    pocketActive = 0;
  }

  function onPocketKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      pocketOpen = true;
      if (pocketMatches.length === 0) return;
      pocketActive = (pocketActive + 1) % pocketMatches.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      pocketOpen = true;
      if (pocketMatches.length === 0) return;
      pocketActive = (pocketActive - 1 + pocketMatches.length) % pocketMatches.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = pocketOpen ? pocketMatches[pocketActive] : undefined;
      if (highlighted) selectPocket(highlighted);
      else if (pocketChoice) void handleAddPocket();
    } else if (event.key === 'Escape') {
      pocketOpen = false;
    }
  }

  async function handleAddPocket() {
    const name = pocketChoice?.name.trim() ?? '';
    if (!name) return;
    pocketBusy = true;
    success = '';
    error = '';
    try {
      await createPocket(name);
      pocketQuery = '';
      pocketChoice = null;
      pocketOpen = false;
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

  async function handleAddPic() {
    const name = picNameInput.trim();
    if (!name) return;
    picBusy = true;
    success = '';
    error = '';
    try {
      await createPic(name);
      picNameInput = '';
      await loadSettings();
      success = `PIC ${name} added`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add PIC';
    } finally {
      picBusy = false;
    }
  }

  async function handleDeletePic(item: PicSetting) {
    if (!confirm(`Delete PIC "${item.name}"?`)) return;
    picBusy = true;
    success = '';
    error = '';
    try {
      await deletePic(item.id);
      pics = pics.filter((p) => p.id !== item.id);
      setPicNames(pics.map((p) => p.name));
      success = `PIC ${item.name} deleted`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete PIC';
    } finally {
      picBusy = false;
    }
  }

</script>

<section class="space-y-4">
  <p class="text-[11px] uppercase tracking-wider text-zinc-500">Settings · {period}</p>

  <label
    class="flex items-center justify-between gap-3 border border-zinc-200 px-3 py-3 dark:border-zinc-800
      {!pushSupportedHere || !sessionPic || pushBusy ? 'opacity-60' : ''}"
  >
    <span class="text-sm font-medium">Enable Push Notification</span>
    <input
      type="checkbox"
      class="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
      checked={pushEnabled}
      disabled={!pushSupportedHere || !sessionPic || pushBusy || pushPermission() === 'denied'}
      onchange={handlePushToggle}
    />
  </label>

  <div class="flex items-center justify-between gap-3 border border-zinc-200 px-3 py-3 dark:border-zinc-800">
    <span class="text-sm font-medium {$floatNavEnabled ? 'text-zinc-400' : ''}">Tab pane</span>
    <button
      type="button"
      role="switch"
      aria-checked={$floatNavEnabled}
      aria-label="Use floating menu"
      class="relative h-6 w-11 shrink-0 rounded-full transition-colors {$floatNavEnabled
        ? 'bg-zinc-900 dark:bg-zinc-100'
        : 'bg-zinc-300 dark:bg-zinc-700'}"
      onclick={() => setFloatNavEnabled(!$floatNavEnabled)}
    >
      <span
        class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {$floatNavEnabled
          ? 'translate-x-5 dark:bg-zinc-900'
          : ''}"
      ></span>
    </button>
    <span class="text-sm font-medium {$floatNavEnabled ? '' : 'text-zinc-400'}">Floating menu</span>
  </div>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Set PIC</legend>
    <p class="text-[11px] text-zinc-500">People names used on Plan, Detail, and Transfer.</p>
    {#if isAdmin}
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={picNameInput}
          placeholder="PIC name (e.g. X)"
          class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
        <button
          type="button"
          onclick={handleAddPic}
          disabled={picBusy || !picNameInput.trim()}
          class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          + Add
        </button>
      </div>
    {/if}
    {#if loading || (!hydrated && pics.length === 0)}
      <p class="text-xs text-zinc-500">Loading…</p>
    {:else if pics.length === 0}
      <p class="text-xs text-zinc-500">No PICs yet.</p>
    {:else}
      <div class="space-y-1">
        {#each pics as item (item.id)}
          <div class="flex items-center justify-between gap-2 border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <div class="flex min-w-0 items-center gap-2">
              <PicBadge name={item.name} />
              <span class="truncate text-sm">{item.name}</span>
            </div>
            {#if isAdmin}
              <button
                type="button"
                onclick={() => handleDeletePic(item)}
                disabled={picBusy || pics.length <= 1}
                class="border border-red-200 px-2 py-1 text-[10px] text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
              >
                Delete
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </fieldset>

  <fieldset class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
    <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Pocket</legend>
    <div class="flex items-stretch gap-2">
      <div class="relative min-w-0 flex-1">
        <input
          type="text"
          bind:value={pocketQuery}
          placeholder="Search a bank or e-wallet"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={pocketOpen}
          aria-controls="pocket-options"
          aria-activedescendant={pocketOpen && pocketMatches[pocketActive] ? `pocket-option-${pocketActive}` : undefined}
          oninput={onPocketInput}
          onfocus={() => {
            pocketOpen = pocketQuery.trim().length > 0;
          }}
          onkeydown={onPocketKeydown}
          onblur={() => {
            setTimeout(() => {
              pocketOpen = false;
            }, 150);
          }}
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
        {#if pocketOpen && pocketMatches.length > 0}
          <ul
            id="pocket-options"
            role="listbox"
            class="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {#each pocketMatches as choice, i (choice.slug)}
              <li role="option" aria-selected={pocketActive === i} id="pocket-option-{i}">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm
                    {pocketActive === i ? 'bg-zinc-100 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/70'}"
                  onmousedown={(event) => {
                    event.preventDefault();
                    selectPocket(choice);
                  }}
                  onmouseenter={() => (pocketActive = i)}
                >
                  <BankLogo name={choice.name} height={16} />
                  <span class="min-w-0 truncate">{choice.name}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if pocketOpen && pocketQuery.trim()}
          <p class="absolute z-30 mt-1 w-full border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            No match
          </p>
        {/if}
      </div>
      <button
        type="button"
        onclick={handleAddPocket}
        disabled={pocketBusy || !pocketChoice}
        aria-label="Add pocket"
        class="flex shrink-0 items-center justify-center border border-zinc-300 px-2.5 text-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>

    {#if loading || (!hydrated && pockets.length === 0)}
      <p class="text-xs text-zinc-500">Loading pockets…</p>
    {:else if pockets.length === 0}
      <p class="text-xs text-zinc-500">No pockets yet.</p>
    {:else}
      <div class="space-y-1">
        {#each pockets as item (item.id)}
          <div class="flex items-center justify-between border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <div class="flex min-w-0 items-center gap-2">
              <BankLogo name={item.name} height={18} />
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onclick={() => handleDeletePocket(item)}
                disabled={pocketBusy}
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
