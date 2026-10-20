<script lang="ts">
  import { page } from '$app/state';
  import animalAvatar from 'animal-avatar-generator';
  import { getSummary } from '$lib/api';
  import { animalSeeds, avatarPref, setAvatarPref } from '$lib/avatar';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { withDeferredLoading } from '$lib/deferred-loading';
  import { formatCurrency } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import type { DashboardSummary } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const nickname = $derived(
    typeof page.data.session?.pic === 'string' ? page.data.session.pic.trim() : '',
  );
  const picture = $derived(
    typeof page.data.session?.picture === 'string' ? page.data.session.picture : '',
  );

  let summary = $state<DashboardSummary | null>(null);
  let loading = $state(false);
  let error = $state('');
  let editingAvatar = $state(false);

  const seeds = $derived(animalSeeds(nickname));
  const mine = $derived(
    summary?.picPocketTotals.find((row) => row.pic.toLowerCase() === nickname.toLowerCase()) ?? null,
  );

  async function loadData(activePeriod: string) {
    error = '';
    await withDeferredLoading(
      (v) => {
        loading = v;
      },
      async () => {
        try {
          summary = await getSummary(activePeriod);
        } catch (e) {
          summary = null;
          error = e instanceof Error ? e.message : 'Failed to load profile';
        }
      },
    );
  }

  $effect(() => {
    void loadData(period);
  });

  function closeAvatar() {
    editingAvatar = false;
  }

  function chooseGoogle() {
    setAvatarPref(nickname, { mode: 'google', seed: $avatarPref.seed || seeds[0] });
    closeAvatar();
  }

  function choosePerson() {
    setAvatarPref(nickname, { mode: 'person', seed: $avatarPref.seed || seeds[0] });
    closeAvatar();
  }

  function chooseAnimal(seed: string) {
    setAvatarPref(nickname, { mode: 'animal', seed });
    closeAvatar();
  }

  $effect(() => {
    if (!editingAvatar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAvatar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<section class="mx-auto w-full max-w-lg space-y-5">
  <p class="text-[11px] uppercase tracking-wider text-zinc-500">Me · {period}</p>

  <div class="flex items-center gap-4">
    <div class="relative shrink-0">
      <UserAvatar {nickname} {picture} size={88} />
      <button
        type="button"
        class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-black dark:text-zinc-200"
        aria-label="Edit avatar"
        aria-haspopup="dialog"
        aria-expanded={editingAvatar}
        onclick={() => (editingAvatar = true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
    <div class="min-w-0">
      <h2 class="text-2xl font-semibold tracking-tight">Hi, {nickname}!</h2>
    </div>
  </div>

  {#if loading && !summary}
    <div class="grid grid-cols-3 gap-2">
      {#each Array(3) as _}
        <div class="aspect-square animate-pulse rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
      {/each}
    </div>
  {:else if error}
    <p class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  {:else}
    <div class="grid grid-cols-3 gap-2">
      <div class="flex aspect-square flex-col items-center justify-center gap-1 rounded-full border border-zinc-200 px-2 text-center dark:border-zinc-800">
        <p class="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="text-red-600 dark:text-red-400" aria-hidden="true">
            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
            <path d="M9 8h6M9 12h6" />
          </svg>
          Expenses
        </p>
        <p class="stat-amount font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(mine?.spent ?? 0)}</p>
      </div>
      <div class="flex aspect-square flex-col items-center justify-center gap-1 rounded-full border border-zinc-200 px-2 text-center dark:border-zinc-800">
        <p class="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M4 10h16M8 3.5v4M16 3.5v4" />
          </svg>
          Plan
        </p>
        <p class="stat-amount font-mono font-semibold tabular-nums">{formatCurrency(mine?.total ?? 0)}</p>
      </div>
      <div class="flex aspect-square flex-col items-center justify-center gap-1 rounded-full border border-zinc-200 px-2 text-center dark:border-zinc-800">
        <p class="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="text-sky-600 dark:text-sky-400" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v10M9 10h4.2a1.8 1.8 0 1 1 0 3.6H9" />
          </svg>
          Balance
        </p>
        <p class="stat-amount font-mono font-semibold tabular-nums text-sky-600 dark:text-sky-400">{formatCurrency(mine?.sisa ?? 0)}</p>
      </div>
    </div>
  {/if}

  {#if editingAvatar}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
    onclick={closeAvatar}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-sm rounded-t-lg border border-zinc-200 bg-white p-4 shadow-lg sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-950"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit avatar"
      tabindex="-1"
    >
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Avatar</h3>
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        aria-label="Close"
        onclick={closeAvatar}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
    <div class="grid grid-cols-4 gap-2">
      <button
        type="button"
        class="flex aspect-square items-center justify-center overflow-hidden rounded-full border-2 {$avatarPref.mode === 'person'
          ? 'border-black dark:border-white'
          : 'border-transparent'}"
        aria-label="Default avatar"
        aria-pressed={$avatarPref.mode === 'person'}
        onclick={choosePerson}
      >
        <UserAvatar {nickname} {picture} size={96} mode="person" />
      </button>
      <button
        type="button"
        class="flex aspect-square items-center justify-center overflow-hidden rounded-full border-2 {$avatarPref.mode === 'google'
          ? 'border-black dark:border-white'
          : 'border-transparent'}"
        aria-label="Google photo"
        aria-pressed={$avatarPref.mode === 'google'}
        onclick={chooseGoogle}
      >
        <UserAvatar {nickname} {picture} size={96} mode="google" />
      </button>
      {#each seeds as seed (seed)}
        {@const selected = $avatarPref.mode === 'animal' && $avatarPref.seed === seed}
        <button
          type="button"
          class="aspect-square overflow-hidden rounded-full border-2 {selected
            ? 'border-black dark:border-white'
            : 'border-transparent'}"
          aria-label="Animal avatar"
          aria-pressed={selected}
          onclick={() => chooseAnimal(seed)}
        >
          <span class="avatar-svg block h-full w-full">{@html animalAvatar(seed, { size: 96, round: true })}</span>
        </button>
      {/each}
    </div>
    </div>
  </div>
  {/if}
</section>

<style>
  .avatar-svg :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
