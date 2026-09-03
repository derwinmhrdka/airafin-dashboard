<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    MONTH_NAMES,
    listYearOptionsForPeriod,
    periodFromParts,
    periodFromUrl,
    periodParts,
  } from '$lib/period';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const parts = $derived(periodParts(period));
  const years = $derived(listYearOptionsForPeriod(parts.year));

  const selectClass =
    'w-full appearance-none border border-zinc-200 bg-white py-2 pl-2.5 pr-7 text-xs font-medium dark:border-zinc-800 dark:bg-black';

  function setParts(month: number, year: number) {
    const url = new URL(page.url);
    url.searchParams.set('period', periodFromParts(month, year));
    goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function onMonthChange(e: Event) {
    const month = Number.parseInt((e.currentTarget as HTMLSelectElement).value, 10);
    setParts(month, parts.year);
  }

  function onYearChange(e: Event) {
    const year = Number.parseInt((e.currentTarget as HTMLSelectElement).value, 10);
    setParts(parts.month, year);
  }
</script>

<div class="grid grid-cols-2 gap-2">
  <div class="relative min-w-0">
    <select
      value={parts.month}
      onchange={onMonthChange}
      class={selectClass}
      aria-label="Month"
    >
      {#each MONTH_NAMES as name, index}
        <option value={index}>{name}</option>
      {/each}
    </select>
    <span
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
      aria-hidden="true"
    >▼</span>
  </div>

  <div class="relative min-w-0">
    <select
      value={parts.year}
      onchange={onYearChange}
      class={selectClass}
      aria-label="Year"
    >
      {#each years as year}
        <option value={year}>{year}</option>
      {/each}
    </select>
    <span
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400"
      aria-hidden="true"
    >▼</span>
  </div>
</div>
