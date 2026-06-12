<script lang="ts">
  import { page } from '$app/state';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview', icon: false },
    { href: '/detail', label: 'Detail', icon: false },
    { href: '/plan', label: 'Plan', icon: false },
    { href: '/sync', label: 'Sync', icon: true },
  ];

  const period = $derived(periodFromUrl(page.url.searchParams));
</script>

<nav class="grid grid-cols-4 border-b border-zinc-200 dark:border-zinc-800">
  {#each tabs as tab}
    <a
      href={withPeriodParam(tab.href, period)}
      aria-label={tab.label}
      title={tab.label}
      class="flex items-center justify-center border-b-2 px-2 py-3 text-center text-xs font-medium transition-colors
        {page.url.pathname === tab.href
        ? 'border-black text-black dark:border-white dark:text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}"
    >
      {#if tab.icon}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
          <path d="M3 12a9 9 0 1 1 2.64 6.36" />
          <path d="M8 16H3v5" />
        </svg>
      {:else}
        {tab.label}
      {/if}
    </a>
  {/each}
</nav>
