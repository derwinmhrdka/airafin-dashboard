<script lang="ts">
  import { formatCurrency } from '$lib/format';

  export interface PieSlice {
    label: string;
    value: number;
    color: string;
  }

  interface Props {
    slices: PieSlice[];
    size?: number;
    emptyLabel?: string;
  }

  let { slices, size = 152, emptyLabel = 'No data' }: Props = $props();

  const cx = 50;
  const cy = 50;
  const r = 42;

  const activeSlices = $derived(slices.filter((s) => s.value > 0));
  const total = $derived(activeSlices.reduce((sum, s) => sum + s.value, 0));

  interface ArcSlice extends PieSlice {
    path: string;
    pct: number;
  }

  const arcs = $derived(buildArcs(activeSlices, total));

  function polar(angleDeg: number): { x: number; y: number } {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(startDeg: number, endDeg: number): string {
    if (endDeg - startDeg >= 359.99) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
    }
    const start = polar(startDeg);
    const end = polar(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
  }

  function buildArcs(items: PieSlice[], sum: number): ArcSlice[] {
    if (sum <= 0) return [];
    let angle = 0;
    return items.map((slice) => {
      const pct = slice.value / sum;
      const sweep = pct * 360;
      const path = arcPath(angle, angle + sweep);
      angle += sweep;
      return { ...slice, path, pct };
    });
  }
</script>

<div class="flex flex-col items-center gap-3">
  <div class="relative" style="width: {size}px; height: {size}px;">
    {#if arcs.length === 0}
      <svg viewBox="0 0 100 100" class="h-full w-full" role="img" aria-label={emptyLabel}>
        <circle cx={cx} cy={cy} {r} class="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-800" />
        <text
          x={cx}
          y={cy}
          text-anchor="middle"
          dominant-baseline="middle"
          class="fill-zinc-400 text-[7px]"
        >
          {emptyLabel}
        </text>
      </svg>
    {:else}
      <svg viewBox="0 0 100 100" class="h-full w-full" role="img" aria-label="Pie chart">
        {#each arcs as arc (arc.label)}
          <path d={arc.path} fill={arc.color} class="transition-opacity hover:opacity-90" />
        {/each}
        <circle
          cx={cx}
          cy={cy}
          r="22"
          class="fill-white dark:fill-black"
        />
      </svg>
    {/if}
  </div>

  {#if arcs.length > 0}
    <ul class="w-full space-y-1">
      {#each arcs as arc (arc.label)}
        <li class="flex items-center justify-between gap-2 text-[11px]">
          <span class="flex min-w-0 items-center gap-1.5">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style="background-color: {arc.color}"
            ></span>
            <span class="truncate text-zinc-600 dark:text-zinc-400">{arc.label}</span>
          </span>
          <span class="shrink-0 font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
            {formatCurrency(arc.value)}
            <span class="text-zinc-400">({Math.round(arc.pct * 100)}%)</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
