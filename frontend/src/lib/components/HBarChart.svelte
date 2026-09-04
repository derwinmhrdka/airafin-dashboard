<script lang="ts">
  import { formatCurrency } from '$lib/format';

  export interface BarSlice {
    label: string;
    value: number;
    color: string;
  }

  interface Props {
    slices: BarSlice[];
    emptyLabel?: string;
  }

  let { slices, emptyLabel = 'No data' }: Props = $props();

  const active = $derived(slices.filter((s) => s.value > 0));
  const total = $derived(active.reduce((sum, s) => sum + s.value, 0));
</script>

{#if active.length === 0 || total <= 0}
  <div
    class="flex h-8 items-center justify-center border border-dashed border-zinc-200 text-[11px] text-zinc-400 dark:border-zinc-800"
  >
    {emptyLabel}
  </div>
{:else}
  <div class="space-y-3">
    <div
      class="flex h-8 w-full overflow-hidden border border-zinc-200 dark:border-zinc-800"
      role="img"
      aria-label="Horizontal bar chart"
    >
      {#each active as slice (slice.label)}
        {@const pct = (slice.value / total) * 100}
        <div
          class="h-full transition-[width] duration-500 ease-out"
          style="width: {pct}%; background-color: {slice.color}"
          title="{slice.label}: {formatCurrency(slice.value)}"
        ></div>
      {/each}
    </div>

    <ul class="space-y-1">
      {#each active as slice (slice.label)}
        {@const pct = slice.value / total}
        <li class="flex items-center justify-between gap-2 text-[11px]">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {slice.color}"></span>
            <span class="truncate text-zinc-600 dark:text-zinc-400">{slice.label}</span>
          </span>
          <span class="shrink-0 font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
            {formatCurrency(slice.value)}
            <span class="text-zinc-400">({Math.round(pct * 100)}%)</span>
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
