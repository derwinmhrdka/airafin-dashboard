<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  } from '$lib/api';
  import { formatCurrency } from '$lib/format';
  import { NOTIFICATIONS_CHANGED_EVENT } from '$lib/notifications-events';
  import type { AppNotification } from '$lib/types';
  import { ensureWebPushSubscription, pushPermission } from '$lib/web-push';

  interface Props {
    pic: string;
    period: string;
  }

  let { pic, period }: Props = $props();

  let open = $state(false);
  let loading = $state(false);
  let items = $state<AppNotification[]>([]);
  let unreadCount = $state(0);
  let rootEl = $state<HTMLDivElement | null>(null);
  let buttonEl = $state<HTMLButtonElement | null>(null);
  let panelTop = $state(0);
  let panelMaxHeight = $state(320);

  let refreshSeq = 0;

  async function refresh() {
    if (!pic) return;
    const seq = ++refreshSeq;
    loading = true;
    try {
      const res = await getNotifications(pic, period);
      if (seq !== refreshSeq) return;
      items = res.notifications;
      unreadCount = res.unreadCount;
    } catch {
      /* keep previous */
    } finally {
      if (seq === refreshSeq) loading = false;
    }
  }

  $effect(() => {
    void pic;
    void period;
    void refresh();
  });

  // Immediate refresh after settle/sync, when PWA returns to foreground, and light polling.
  $effect(() => {
    void pic;
    void period;

    const onChanged = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onPageShow = () => {
      void refresh();
    };

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onPageShow);

    const pollMs = 12_000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollMs);

    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.clearInterval(timer);
    };
  });

  function placePanel() {
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const gap = 8;
    const bottomSafe = 12;
    panelTop = rect.bottom + gap;
    panelMaxHeight = Math.max(160, window.innerHeight - panelTop - bottomSafe);
  }

  function onDocClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  $effect(() => {
    if (!open) return;
    placePanel();
    const onResize = () => placePanel();
    const handler = (e: MouseEvent) => onDocClick(e);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    document.addEventListener('click', handler);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      document.removeEventListener('click', handler);
    };
  });

  async function toggleOpen() {
    open = !open;
    if (open) {
      requestAnimationFrame(placePanel);
      if (pushPermission() === 'granted') {
        void ensureWebPushSubscription(pic);
      }
      await refresh();
    }
  }

  async function handleRead(item: AppNotification) {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
        items = items.map((n) =>
          n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
        );
        unreadCount = items.filter((n) => !n.readAt).length;
      } catch {
        /* ignore */
      }
    }
    open = false;
    await goto(`/transfer?period=${encodeURIComponent(item.period)}`);
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead(pic);
      items = items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }));
      unreadCount = 0;
    } catch {
      /* ignore */
    }
  }

  function itemLabelFor(item: AppNotification): string {
    const raw = (item.itemLabel ?? '').trim().replace(/\s+/g, ' ');
    return raw || 'Item';
  }

  function titleFor(item: AppNotification): string {
    const label = itemLabelFor(item);
    if (item.type === 'pay_due') {
      return `${label} needs payment`;
    }
    if (item.type === 'paid_received') {
      return `${label} just paid!`;
    }
    return 'Notification';
  }
</script>

<div class="relative" bind:this={rootEl}>
  <button
    type="button"
    bind:this={buttonEl}
    onclick={toggleOpen}
    class="relative flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
    aria-label="Notifications"
    aria-expanded={open}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
    {#if unreadCount > 0}
      <span
        class="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-white"
      >
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="fixed z-50 w-[min(18rem,calc(100vw-1.5rem))] border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
      style="top: {panelTop}px; right: max(0.75rem, env(safe-area-inset-right, 0px)); max-height: {panelMaxHeight}px;"
      role="dialog"
      aria-label="Notifications"
    >
      <div class="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Notifications</span>
        {#if unreadCount > 0}
          <button
            type="button"
            onclick={handleReadAll}
            class="text-[10px] text-zinc-500 underline-offset-2 hover:underline"
          >
            Mark all read
          </button>
        {/if}
      </div>

      <div class="overflow-y-auto" style="max-height: calc({panelMaxHeight}px - 2.5rem);">
        {#if loading && items.length === 0}
          <p class="px-3 py-4 text-center text-[11px] text-zinc-400">Loading…</p>
        {:else if items.length === 0}
          <p class="px-3 py-4 text-center text-[11px] text-zinc-400">No notifications</p>
        {:else}
          <ul>
            {#each items as item (item.id)}
              <li>
                <button
                  type="button"
                  onclick={() => handleRead(item)}
                  class="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900
                    {!item.readAt ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium {!item.readAt ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'}">
                      {titleFor(item)}
                    </p>
                    <p class="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">
                      {formatCurrency(item.amount)}
                      <span class="text-zinc-400"> · {item.period}</span>
                    </p>
                  </div>
                  {#if !item.readAt}
                    <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true"></span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</div>
