<script lang="ts">
  import { page } from '$app/state';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview' },
    { href: '/detail', label: 'Detail' },
    { href: '/plan', label: 'Plan' },
    { href: '/settings', label: 'Settings', iconOnly: true },
  ];

  const period = $derived(periodFromUrl(page.url.searchParams));
</script>

<nav class="grid grid-cols-4 border-b border-zinc-200 dark:border-zinc-800">
  {#each tabs as tab}
    <a
      href={withPeriodParam(tab.href, period)}
      aria-label={tab.label}
      title={tab.label}
      class="flex items-center justify-center border-b-2 px-2 py-3 text-center text-xs font-medium transition-colors md:px-4 md:py-3.5 md:text-sm
        {page.url.pathname === tab.href
        ? 'border-black text-black dark:border-white dark:text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}"
    >
      {#if tab.iconOnly}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="h-4 w-4 md:h-5 md:w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .99 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.99z"
          />
        </svg>
      {:else}
        {tab.label}
      {/if}
    </a>
  {/each}
</nav>
