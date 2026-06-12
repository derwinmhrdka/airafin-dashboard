<script lang="ts">
  import { page } from '$app/state';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview' },
    { href: '/detail', label: 'Detail' },
    { href: '/plan', label: 'Plan' },
  ];

  const period = $derived(periodFromUrl(page.url.searchParams));
</script>

<nav class="grid grid-cols-3 border-b border-zinc-200 dark:border-zinc-800">
  {#each tabs as tab}
    <a
      href={withPeriodParam(tab.href, period)}
      class="border-b-2 px-2 py-3 text-center text-xs font-medium transition-colors
        {page.url.pathname === tab.href
        ? 'border-black text-black dark:border-white dark:text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}"
    >
      {tab.label}
    </a>
  {/each}
</nav>
