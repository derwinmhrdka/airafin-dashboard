<script lang="ts">
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { getReimbursements, markReimbursementPaid } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { picInitial } from '$lib/pics';
  import type { ReimbursementItem } from '$lib/types';

  interface Props {
    period: string;
  }

  let { period }: Props = $props();

  let reimbursements = $state<ReimbursementItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let payingId = $state<number | null>(null);
  let payingAllKey = $state<string | null>(null);

  const reimbursementTotals = $derived.by(() => {
    const byPair = new Map<string, number>();
    for (const item of reimbursements) {
      const key = `${item.planPic}\0${item.pic}`;
      const cost = Number.parseFloat(item.cost) || 0;
      byPair.set(key, (byPair.get(key) ?? 0) + cost);
    }
    return [...byPair.entries()]
      .map(([key, total]) => {
        const [planPic, paidBy] = key.split('\0');
        return { planPic, paidBy, total };
      })
      .sort((a, b) => b.total - a.total);
  });

  const reimbursementNetTotals = $derived.by(() => {
    const byPair = new Map<string, number>();
    for (const item of reimbursements) {
      const key = `${item.planPic}\0${item.pic}`;
      const cost = Number.parseFloat(item.cost) || 0;
      byPair.set(key, (byPair.get(key) ?? 0) + cost);
    }

    const peoplePairs = new Set<string>();
    for (const key of byPair.keys()) {
      const [a, b] = key.split('\0');
      peoplePairs.add(a < b ? `${a}\0${b}` : `${b}\0${a}`);
    }

    const nets: {
      planPic: string;
      paidBy: string;
      total: number;
      personA: string;
      personB: string;
    }[] = [];
    for (const pairKey of peoplePairs) {
      const [personA, personB] = pairKey.split('\0');
      const forward = byPair.get(`${personA}\0${personB}`) ?? 0;
      const backward = byPair.get(`${personB}\0${personA}`) ?? 0;
      const diff = forward - backward;
      if (diff > 0) {
        nets.push({ planPic: personA, paidBy: personB, total: diff, personA, personB });
      } else if (diff < 0) {
        nets.push({ planPic: personB, paidBy: personA, total: -diff, personA, personB });
      }
    }

    return nets.sort((a, b) => b.total - a.total);
  });

  async function loadReimbursements(activePeriod: string) {
    loading = true;
    error = '';
    try {
      const reimbRes = await getReimbursements(activePeriod);
      reimbursements = reimbRes.reimbursements;
    } catch (e) {
      reimbursements = [];
      error = e instanceof Error ? e.message : 'Failed to load reimbursements';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadReimbursements(period);
  });

  async function handlePaid(item: ReimbursementItem) {
    payingId = item.id;
    error = '';
    try {
      await markReimbursementPaid(item.id);
      reimbursements = reimbursements.filter((r) => r.id !== item.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark as paid';
    } finally {
      payingId = null;
    }
  }

  function reimbursementPairKey(planPic: string, paidBy: string): string {
    return `${planPic}\0${paidBy}`;
  }

  function reimbursementPeoplePairKey(personA: string, personB: string): string {
    return personA < personB ? `${personA}\0${personB}` : `${personB}\0${personA}`;
  }

  async function handlePaidNet(personA: string, personB: string) {
    const key = reimbursementPeoplePairKey(personA, personB);
    payingAllKey = key;
    error = '';
    const items = reimbursements.filter(
      (r) =>
        (r.planPic === personA && r.pic === personB) ||
        (r.planPic === personB && r.pic === personA),
    );
    const ids = new Set(items.map((item) => item.id));
    try {
      for (const item of items) {
        await markReimbursementPaid(item.id);
      }
      reimbursements = reimbursements.filter((r) => !ids.has(r.id));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark all as paid';
      try {
        const reimbRes = await getReimbursements(period);
        reimbursements = reimbRes.reimbursements;
      } catch {
        /* keep partial state */
      }
    } finally {
      payingAllKey = null;
    }
  }

  async function handlePaidAll(planPic: string, paidBy: string) {
    const key = reimbursementPairKey(planPic, paidBy);
    payingAllKey = key;
    error = '';
    const items = reimbursements.filter((r) => r.planPic === planPic && r.pic === paidBy);
    const ids = new Set(items.map((item) => item.id));
    try {
      for (const item of items) {
        await markReimbursementPaid(item.id);
      }
      reimbursements = reimbursements.filter((r) => !ids.has(r.id));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to mark all as paid';
      try {
        const reimbRes = await getReimbursements(period);
        reimbursements = reimbRes.reimbursements;
      } catch {
        /* keep partial state */
      }
    } finally {
      payingAllKey = null;
    }
  }
</script>

<div class="space-y-2">
  <h2 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Reimbursements</h2>
  <p class="text-[10px] text-zinc-500">
    Plan owner paid by someone else — mark Paid when settled (updates Paid by in Detail).
  </p>

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}

  {#if loading}
    <div class="h-20 animate-pulse border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"></div>
  {:else if reimbursementTotals.length > 0}
    <div
      class="space-y-1.5 border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Total Paid</p>
      {#each reimbursementTotals as row (row.planPic + row.paidBy)}
        {@const pairKey = reimbursementPairKey(row.planPic, row.paidBy)}
        <div class="flex items-center justify-between gap-2 text-xs">
          <div class="flex min-w-0 items-center gap-1.5">
            <PicBadge name={row.planPic} />
            <span class="text-[10px] text-zinc-400" aria-hidden="true">→</span>
            <PicBadge name={row.paidBy} />
            <span class="truncate text-[10px] text-zinc-500" title="{row.paidBy} need paid">
              {picInitial(row.paidBy)} need paid
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="font-mono tabular-nums">{formatCurrency(row.total)}</span>
            <button
              type="button"
              disabled={payingAllKey != null || payingId != null}
              onclick={() => handlePaidAll(row.planPic, row.paidBy)}
              class="border border-zinc-300 px-2 py-1 text-[10px] font-medium disabled:opacity-50 dark:border-zinc-600"
            >
              {payingAllKey === pairKey ? '…' : 'Paid All'}
            </button>
          </div>
        </div>
      {/each}

      {#if reimbursementNetTotals.length > 0}
        <div
          class="space-y-1.5 border-t border-zinc-300 pt-2 dark:border-zinc-700"
          aria-label="Net reimbursement totals"
        >
          <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Net (final)</p>
          {#each reimbursementNetTotals as row (row.personA + row.personB)}
            {@const netKey = reimbursementPeoplePairKey(row.personA, row.personB)}
            <div class="flex items-center justify-between gap-2 text-xs font-medium">
              <div class="flex min-w-0 items-center gap-1.5">
                <PicBadge name={row.planPic} />
                <span class="text-[10px] text-zinc-400" aria-hidden="true">→</span>
                <PicBadge name={row.paidBy} />
                <span class="truncate text-[10px] text-zinc-500" title="{row.paidBy} need paid (net)">
                  {picInitial(row.paidBy)} need paid
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="font-mono tabular-nums">{formatCurrency(row.total)}</span>
                <button
                  type="button"
                  disabled={payingAllKey != null || payingId != null}
                  onclick={() => handlePaidNet(row.personA, row.personB)}
                  class="border border-zinc-300 px-2 py-1 text-[10px] font-medium disabled:opacity-50 dark:border-zinc-600"
                >
                  {payingAllKey === netKey ? '…' : 'Paid'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if !loading && reimbursements.length === 0}
    <p class="border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
      No pending reimbursements.
    </p>
  {:else if !loading}
    <div
      class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800 md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-zinc-200 md:dark:bg-zinc-800"
    >
      {#each reimbursements as item (item.id)}
        <div class="flex items-center gap-2 bg-white px-3 py-2.5 dark:bg-black md:gap-3 md:px-4 md:py-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{item.detail}</p>
            <p class="font-mono text-[11px] tabular-nums text-zinc-500">
              {formatCurrency(item.cost)} · {item.categoryName}{#if item.subCategory?.trim()}
                · {item.subCategory.trim()}{/if}
            </p>
            <p class="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <span>Plan {picInitial(item.planPic)}</span>
              <span aria-hidden="true">→</span>
              <span>By {picInitial(item.pic)}</span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <PicBadge name={item.planPic} />
            <span class="text-[10px] text-zinc-400">→</span>
            <PicBadge name={item.pic} />
          </div>
          <button
            type="button"
            disabled={payingId === item.id || payingAllKey != null}
            onclick={() => handlePaid(item)}
            class="shrink-0 border border-zinc-300 px-2 py-1 text-[10px] font-medium disabled:opacity-50 dark:border-zinc-600"
          >
            {payingId === item.id ? '…' : 'Paid'}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
