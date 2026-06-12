<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { listPeriodOptions, periodFromUrl, shiftPeriod } from '$lib/period';

  const options = listPeriodOptions();

  const period = $derived(periodFromUrl($page.url.searchParams));

  function setPeriod(next: string) {
    const url = new URL($page.url);
    url.searchParams.set('period', next);
    goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true });
  }
</script>

<div class="flex items-center gap-1">
  <button
    type="button"
    onclick={() => setPeriod(shiftPeriod(period, -1))}
    class="border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
    aria-label="Previous month"
  >
    ‹
  </button>
  <select
    value={period}
    onchange={(e) => setPeriod(e.currentTarget.value)}
    class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-1 text-xs font-medium dark:border-zinc-800 dark:bg-black"
    aria-label="Select month"
  >
    {#each options as option}
      <option value={option}>{option}</option>
    {/each}
  </select>
  <button
    type="button"
    onclick={() => setPeriod(shiftPeriod(period, 1))}
    class="border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
    aria-label="Next month"
  >
    ›
  </button>
</div>
