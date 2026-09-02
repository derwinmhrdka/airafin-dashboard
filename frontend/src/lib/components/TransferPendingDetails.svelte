<script lang="ts">
  import { formatCurrency } from '$lib/format';
  import type { TransferPendingLine } from '$lib/transfer-pending';

  interface Props {
    lines: TransferPendingLine[];
    pocketDotColor: (name: string) => string;
  }

  let { lines, pocketDotColor }: Props = $props();
</script>

<ul class="mt-1.5 space-y-1 border-t border-dashed border-zinc-200 pt-1.5 dark:border-zinc-700">
  {#each lines as line, i (line.checklistId ?? line.reimbursementId ?? i)}
    <li class="flex items-start justify-between gap-2 text-[10px]">
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium text-zinc-700 dark:text-zinc-300">{line.title}</p>
        <div class="mt-0.5 flex flex-wrap items-center gap-1">
          {#if line.source === 'plan'}
            <span class="rounded bg-zinc-100 px-1 text-[9px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Plan</span>
            {#if line.pocket}
              <span class="inline-flex items-center gap-1 rounded bg-zinc-100 px-1 py-0.5 font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <span class="h-1.5 w-1.5 rounded-full" style="background-color: {pocketDotColor(line.pocket)}" aria-hidden="true"></span>
                {line.pocket}
              </span>
            {/if}
          {:else}
            <span class="rounded bg-zinc-100 px-1 text-[9px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Detail</span>
            {#if line.date}
              <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{line.date}</span>
            {/if}
            {#if line.categoryName}
              <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{line.categoryName}</span>
            {/if}
            {#if line.subCategory?.trim()}
              <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{line.subCategory.trim()}</span>
            {/if}
          {/if}
        </div>
      </div>
      <span class="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">{formatCurrency(line.amount)}</span>
    </li>
  {/each}
</ul>
