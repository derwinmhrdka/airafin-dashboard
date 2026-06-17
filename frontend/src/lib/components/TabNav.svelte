<script lang="ts">
  import { page } from '$app/state';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview' },
    { href: '/detail', label: 'Detail' },
    { href: '/plan', label: 'Plan' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
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
      {#if tab.icon}
        <span aria-hidden="true" class="text-sm leading-none">{tab.icon}</span>
        <span class="ml-1">{tab.label}</span>
      {:else}
        {tab.label}
      {/if}
    </a>
  {/each}
</nav>
