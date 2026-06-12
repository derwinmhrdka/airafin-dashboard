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
    if (page.url.pathname === '/login') return;

    const raw = page.url.searchParams.get('period')?.trim();
    if (raw && parsePeriodToDate(raw)) return;

    const url = new URL(page.url);
    url.searchParams.set('period', currentPeriod());
    const next = `${url.pathname}${url.search}`;
    const current = `${page.url.pathname}${page.url.search}`;
    if (next === current) return;

    goto(next, { replaceState: true, noScroll: true, keepFocus: true });
  });
</script>

<svelte:head>
  <title>Airafin Dashboard</title>
  <meta name="description" content="Personal financial dashboard" />
</svelte:head>

{#if page.url.pathname === '/login'}
  {@render children()}
{:else}
  <div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-white dark:bg-black md:max-w-none">
    <header
      class="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-black md:px-8 md:py-4"
    >
      <div class="md:flex md:items-start md:justify-between md:gap-8">
        <div class="mb-3 flex shrink-0 items-center justify-between gap-3 md:mb-0">
          <h1 class="text-sm font-semibold tracking-tight md:text-base">Airafin</h1>
          <span
            class="shrink-0 rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800"
          >
            v1
          </span>
        </div>
        <div class="min-w-0 md:max-w-sm md:flex-1 md:pt-0.5 lg:max-w-md">
          <PeriodSelector />
        </div>
      </div>
    </header>

    <TabNav />

    <main class="flex-1 px-4 py-4 md:px-8 md:py-6">
      {@render children()}
    </main>
  </div>
{/if}
