<script lang="ts">
  import { formatCurrency } from '$lib/format';
  import type { BarSlice } from '$lib/components/HBarChart.svelte';

  interface Props {
    slices: BarSlice[];
    /** Selected category label, or null for all. */
    selected?: string | null;
    emptyLabel?: string;
    onSelect?: (label: string | null) => void;
  }

  let {
    slices,
    selected = null,
    emptyLabel = 'No data',
    onSelect,
  }: Props = $props();

  let rootEl = $state<HTMLDivElement | null>(null);

  const active = $derived(slices.filter((s) => s.value > 0));
  const total = $derived(active.reduce((sum, s) => sum + s.value, 0));

  function toggle(label: string) {
    const next = selected === label ? null : label;
    onSelect?.(next);
  }

  function clear() {
    if (selected != null) onSelect?.(null);
  }

  $effect(() => {
    if (selected == null) return;
    function onDocPointer(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootEl?.contains(t)) return;
      clear();
    }
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  });
</script>

{#if active.length === 0 || total <= 0}
  <div
    class="flex h-9 items-center justify-center border border-dashed border-zinc-200 text-[11px] text-zinc-400 dark:border-zinc-800"
  >
    {emptyLabel}
  </div>
{:else}
  <div bind:this={rootEl} class="space-y-3" data-allocation-bar>
    <div
      class="flex h-9 w-full overflow-hidden border border-zinc-200 dark:border-zinc-800"
      role="listbox"
      aria-label="Plan allocation. Click a segment to filter."
      aria-multiselectable="false"
    >
      {#each active as slice (slice.label)}
        {@const pct = (slice.value / total) * 100}
        {@const isSelected = selected === slice.label}
        {@const dimmed = selected != null && !isSelected}
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          aria-label="{slice.label}: {formatCurrency(slice.value)}"
          title="{slice.label}: {formatCurrency(slice.value)} — click to filter"
          class="relative h-full min-w-0 origin-center transition-all duration-300 ease-out
            {dimmed ? 'opacity-35 grayscale-[0.35]' : 'opacity-100'}
            {isSelected ? 'z-[1] brightness-110 ring-2 ring-inset ring-white/80 dark:ring-black/50' : ''}
            hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 dark:focus-visible:outline-white"
          style="width: {pct}%; background-color: {slice.color}; flex: {pct} 0 0%"
          onclick={(e) => {
            e.stopPropagation();
            toggle(slice.label);
          }}
        ></button>
      {/each}
    </div>

    <ul class="space-y-1">
      {#each active as slice (slice.label)}
        {@const pct = slice.value / total}
        {@const isSelected = selected === slice.label}
        {@const dimmed = selected != null && !isSelected}
        <li>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 text-left text-[11px] transition-opacity duration-300
              {dimmed ? 'opacity-40' : 'opacity-100'}
              {isSelected ? 'font-medium' : ''}"
            onclick={() => toggle(slice.label)}
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <span
                class="h-2 w-2 shrink-0 rounded-full transition-transform duration-300
                  {isSelected ? 'scale-125' : 'scale-100'}"
                style="background-color: {slice.color}"
              ></span>
              <span class="truncate text-zinc-600 dark:text-zinc-400">{slice.label}</span>
            </span>
            <span class="shrink-0 font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
              {formatCurrency(slice.value)}
              <span class="text-zinc-400">({Math.round(pct * 100)}%)</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>

    {#if selected}
      <p class="text-[10px] text-zinc-400 transition-opacity duration-300">
        Filtering <span class="font-medium text-zinc-600 dark:text-zinc-300">{selected}</span>
        · click again or outside to reset
      </p>
    {/if}
  </div>
{/if}
