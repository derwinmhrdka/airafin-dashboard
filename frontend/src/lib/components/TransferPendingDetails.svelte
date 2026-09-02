<script lang="ts">
  import { formatCurrency } from '$lib/format';
  import type { TransferPendingLine } from '$lib/transfer-pending';

  interface Props {
    lines: TransferPendingLine[];
  }

  let { lines }: Props = $props();
</script>

<ul class="mt-1.5 space-y-1 border-t border-dashed border-zinc-200 pt-1.5 dark:border-zinc-700">
  {#each lines as line, i (line.checklistId ?? line.reimbursementId ?? i)}
    <li class="flex items-center justify-between gap-2 text-[10px]">
      <p class="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-300">{line.title}</p>
      <span class="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">{formatCurrency(line.amount)}</span>
    </li>
  {/each}
</ul>
