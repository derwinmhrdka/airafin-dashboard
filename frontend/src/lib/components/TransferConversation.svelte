<script lang="ts">
  import { addTransferComment, decideTransfer } from '$lib/api';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import type { TransferApproval, TransferComment, TransferTargetKind } from '$lib/types';

  interface Props {
    targetKind: TransferTargetKind;
    targetId: number;
    receiverPic: string;
    sessionPic: string;
    approval: TransferApproval;
    done: boolean;
    comments: TransferComment[];
    onChanged: () => void | Promise<void>;
  }

  let {
    targetKind,
    targetId,
    receiverPic,
    sessionPic,
    approval,
    done,
    comments,
    onChanged,
  }: Props = $props();

  let draft = $state('');
  let replyTo = $state<number | null>(null);
  let busy = $state(false);
  let localError = $state('');

  const isReceiver = $derived(
    Boolean(sessionPic) && sessionPic.trim().toLowerCase() === receiverPic.trim().toLowerCase(),
  );
  const status = $derived<TransferApproval>(done || approval === 'approved' ? 'approved' : approval);
  const roots = $derived(comments.filter((comment) => comment.parentId == null));

  function repliesFor(id: number): TransferComment[] {
    return comments.filter((comment) => comment.parentId === id);
  }

  function samePic(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    busy = true;
    localError = '';
    try {
      await addTransferComment({
        targetKind,
        targetId,
        parentId: replyTo,
        body,
      });
      draft = '';
      replyTo = null;
      await onChanged();
    } catch (e) {
      localError = e instanceof Error ? e.message : 'Failed to send comment';
    } finally {
      busy = false;
    }
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (busy) return;
    busy = true;
    localError = '';
    try {
      await decideTransfer({ targetKind, targetId, decision });
      await onChanged();
    } catch (e) {
      localError = e instanceof Error ? e.message : 'Failed to update approval';
    } finally {
      busy = false;
    }
  }
</script>

<div class="space-y-2 border-t border-zinc-200 px-2 py-2 dark:border-zinc-800">
  <div class="flex items-center justify-between gap-2">
    <p class="text-[10px] uppercase tracking-wider text-zinc-400">
      {#if status === 'approved'}
        Approved by {receiverPic}
      {:else if status === 'rejected'}
        Rejected by {receiverPic}
      {:else}
        Waiting for {receiverPic}
      {/if}
    </p>
    {#if isReceiver && status !== 'approved'}
      <div class="flex gap-1">
        <button
          type="button"
          disabled={busy}
          onclick={() => decide('approved')}
          class="flex h-7 w-7 items-center justify-center border border-emerald-600 bg-emerald-600 text-white disabled:opacity-50"
          aria-label="Approve"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
        {#if status !== 'rejected'}
          <button
            type="button"
            disabled={busy}
            onclick={() => decide('rejected')}
            class="flex h-7 w-7 items-center justify-center border border-zinc-300 text-zinc-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
            aria-label="Reject"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if roots.length === 0}
    <p class="text-[11px] text-zinc-400">No comments yet</p>
  {:else}
    <ul class="space-y-2">
      {#each roots as comment (comment.id)}
        <li class="space-y-1.5">
          <div class="flex items-end gap-1.5 {samePic(comment.pic, sessionPic) ? 'flex-row-reverse' : ''}">
            <PicBadge name={comment.pic} />
            <div
              class="max-w-[85%] rounded-2xl px-2.5 py-1.5 text-xs
                {samePic(comment.pic, sessionPic)
                ? 'rounded-br-sm bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'rounded-bl-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'}"
            >
              <p class="whitespace-pre-wrap break-words">{comment.body}</p>
            </div>
          </div>
          {#if !samePic(comment.pic, sessionPic)}
            <button
              type="button"
              class="ml-7 text-[10px] text-zinc-400 underline-offset-2 hover:underline"
              onclick={() => (replyTo = replyTo === comment.id ? null : comment.id)}
            >
              Reply
            </button>
          {/if}
          {#each repliesFor(comment.id) as reply (reply.id)}
            <div class="ml-7 flex items-end gap-1.5 {samePic(reply.pic, sessionPic) ? 'flex-row-reverse' : ''}">
              <PicBadge name={reply.pic} />
              <div
                class="max-w-[85%] rounded-2xl px-2.5 py-1.5 text-xs
                  {samePic(reply.pic, sessionPic)
                  ? 'rounded-br-sm bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'rounded-bl-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'}"
              >
                <p class="whitespace-pre-wrap break-words">{reply.body}</p>
              </div>
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}

  {#if replyTo != null}
    <p class="text-[10px] text-zinc-400">
      Replying
      <button type="button" class="underline" onclick={() => (replyTo = null)}>Cancel</button>
    </p>
  {/if}

  <form
    class="flex items-center gap-1"
    onsubmit={(event) => {
      event.preventDefault();
      void send();
    }}
  >
    <input
      bind:value={draft}
      maxlength="500"
      placeholder={replyTo != null ? 'Write a reply…' : 'Add a comment…'}
      class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-black"
    />
    <button
      type="submit"
      disabled={busy || !draft.trim()}
      class="shrink-0 border border-black bg-black px-2 py-1.5 text-[10px] font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
    >
      Send
    </button>
  </form>
  {#if localError}
    <p class="text-[11px] text-red-600 dark:text-red-400">{localError}</p>
  {/if}
</div>
