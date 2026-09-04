<script lang="ts">
  import { getPendingInfoUpdate, skipInfoUpdate } from '$lib/api';
  import type { InfoUpdate } from '$lib/types';

  let update = $state<InfoUpdate | null>(null);
  let pageIndex = $state(0);
  let busy = $state(false);
  let loaded = $state(false);

  const pages = $derived(update?.pages ?? []);
  const current = $derived(pages[pageIndex] ?? null);
  const isLast = $derived(pageIndex >= pages.length - 1);

  async function load() {
    if (loaded) return;
    try {
      const res = await getPendingInfoUpdate();
      update = res.update;
      pageIndex = 0;
    } catch {
      update = null;
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    void load();
  });

  // Lock background scroll while popup is open.
  $effect(() => {
    if (!update) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  });

  async function dismiss() {
    if (!update || busy) return;
    busy = true;
    try {
      await skipInfoUpdate(update.id);
      update = null;
      // Load next pending if any
      await load();
    } catch {
      /* keep open */
    } finally {
      busy = false;
    }
  }

  function next() {
    if (isLast) {
      void dismiss();
      return;
    }
    pageIndex += 1;
  }

  function prev() {
    if (pageIndex > 0) pageIndex -= 1;
  }
</script>

{#if loaded && update && current}
  <div
    class="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/70 p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:items-center"
    role="dialog"
    aria-modal="true"
    aria-label={update.title}
  >
    <div
      class="flex max-h-full w-full max-w-md flex-col overflow-hidden border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl"
      data-info-update-scroll
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Info update</p>
          <h2 class="truncate text-sm font-semibold tracking-tight">{update.title}</h2>
        </div>
        {#if pages.length > 1}
          <span class="shrink-0 text-[10px] tabular-nums text-zinc-500">
            {pageIndex + 1}/{pages.length}
          </span>
        {/if}
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {#if current.photo}
          <img src={current.photo} alt="" class="max-h-56 w-full object-cover" />
        {/if}
        <div class="space-y-3 px-4 py-4">
          {#if current.body.trim()}
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{current.body}</p>
          {:else if !current.photo}
            <p class="text-sm text-zinc-500">No content on this page.</p>
          {/if}
        </div>
      </div>

      <div class="flex shrink-0 flex-col gap-2 border-t border-zinc-800 px-4 py-3">
        <div class="flex gap-2">
          {#if pageIndex > 0}
            <button
              type="button"
              onclick={prev}
              class="flex-1 border border-zinc-700 py-2.5 text-xs font-medium text-zinc-300"
            >
              Back
            </button>
          {/if}
          <button
            type="button"
            disabled={busy}
            onclick={next}
            class="flex-[1.4] border border-zinc-100 bg-zinc-100 py-2.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onclick={dismiss}
          class="w-full py-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Skip — don’t show again
        </button>
      </div>
    </div>
  </div>
{/if}
