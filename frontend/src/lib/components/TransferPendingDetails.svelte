<script lang="ts">
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { formatCurrency } from '$lib/format';
  import { picNames, picRank } from '$lib/pics';
  import type { TransferPendingLine } from '$lib/transfer-pending';

  interface Props {
    lines: TransferPendingLine[];
    /** Show sender → receiver PIC badges; lines sorted by PIC order. */
    showPicPair?: boolean;
  }

  let { lines, showPicPair = false }: Props = $props();

  const picList = $derived($picNames);

  const displayLines = $derived.by(() => {
    if (!showPicPair) return lines;
    return [...lines].sort(
      (a, b) =>
        picRank(a.senderPic, picList) - picRank(b.senderPic, picList) ||
        picRank(a.receiverPic, picList) - picRank(b.receiverPic, picList) ||
        a.title.localeCompare(b.title),
    );
  });
</script>

<ul class="mt-1.5 space-y-1 border-t border-dashed border-zinc-200 pt-1.5 dark:border-zinc-700">
  {#each displayLines as line, i (line.checklistId ?? line.reimbursementId ?? i)}
    <li class="flex items-center justify-between gap-2 text-[10px]">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        {#if showPicPair}
          <span class="inline-flex shrink-0 items-center gap-0.5">
            <PicBadge name={line.senderPic} />
            <span class="text-zinc-400">→</span>
            <PicBadge name={line.receiverPic} />
          </span>
        {/if}
        <p class="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-300">{line.title}</p>
      </div>
      <span class="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">{formatCurrency(line.amount)}</span>
    </li>
  {/each}
</ul>
