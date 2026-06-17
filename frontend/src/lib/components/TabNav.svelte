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
          viewBox="0 0 32 32"
          class="h-4 w-4 md:h-5 md:w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M16 7L24 25h-3.2l-1.6-4H12.8l-1.6 4H8L16 7z" />
          <path d="M16 13.4L13.4 17h5.2L16 13.4z" />
        </svg>
      {:else}
        {tab.label}
      {/if}
    </a>
  {/each}
</nav>
