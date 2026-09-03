<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import PeriodSelector from '$lib/components/PeriodSelector.svelte';
  import ProfileMenu from '$lib/components/ProfileMenu.svelte';
  import TabNav from '$lib/components/TabNav.svelte';
  import { currentPeriod, parsePeriodToDate, periodFromUrl } from '$lib/period';

  let { children, data } = $props();

  const period = $derived(periodFromUrl(page.url.searchParams));

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
      class="sticky top-0 z-20 overflow-visible border-b border-zinc-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] dark:border-zinc-800 dark:bg-black md:px-8 md:pb-4 md:pt-[calc(1rem+env(safe-area-inset-top,0px))]"
    >
      <div class="md:flex md:items-start md:justify-between md:gap-8">
        <div class="mb-3 flex shrink-0 items-center justify-between gap-3 md:mb-0">
          <div class="flex items-center gap-2">
            <h1 class="text-sm font-semibold tracking-tight md:text-base">Airafin</h1>
          </div>
          {#if data.session}
            <div class="flex items-center gap-2.5">
              <NotificationBell pic={data.session.pic} {period} />
              <ProfileMenu pic={data.session.pic} email={data.session.email} />
            </div>
          {/if}
        </div>
        <div class="min-w-0 md:max-w-sm md:flex-1 md:pt-0.5 lg:max-w-md">
          <PeriodSelector />
        </div>
      </div>
    </header>

    <TabNav />

    <main class="flex-1 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {@render children()}
    </main>
  </div>
{/if}
