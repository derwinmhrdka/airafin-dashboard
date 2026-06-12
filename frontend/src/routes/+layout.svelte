<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import PeriodSelector from '$lib/components/PeriodSelector.svelte';
  import TabNav from '$lib/components/TabNav.svelte';
  import { currentPeriod, parsePeriodToDate } from '$lib/period';

  let { children } = $props();

  // Keep ?period= in the URL so all tabs share the same month/year.
  $effect(() => {
    const raw = page.url.searchParams.get('period')?.trim();
    if (raw && parsePeriodToDate(raw)) return;

    const url = new URL(page.url);
    url.searchParams.set('period', currentPeriod());
    goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true, keepFocus: true });
  });
</script>

<svelte:head>
  <title>Airafin Dashboard</title>
  <meta name="description" content="Personal financial dashboard" />
</svelte:head>

<div class="mx-auto min-h-dvh max-w-lg bg-white dark:bg-black">
  <header class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
      <span class="shrink-0 rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">
        v1
      </span>
    </div>
    <PeriodSelector />
  </header>

  <TabNav />

  <main class="px-4 py-4">
    {@render children()}
  </main>
</div>
