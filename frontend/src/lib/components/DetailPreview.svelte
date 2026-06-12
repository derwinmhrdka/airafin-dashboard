<script lang="ts">
  type Props = {
    text: string;
    class?: string;
  };

  let { text, class: className = '' }: Props = $props();

  let triggerEl = $state<HTMLElement | null>(null);
  let hoverOpen = $state(false);
  let sheetOpen = $state(false);
  let canHover = $state(false);
  let tooltipPos = $state({ top: 0, left: 0, maxWidth: 280 });

  const likelyTruncated = $derived(text.length > 15);

  $effect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => {
      canHover = mq.matches;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  function updateTooltipPos() {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    const padding = 8;
    const maxWidth = Math.min(320, window.innerWidth - padding * 2);
    let left = r.left;
    if (left + maxWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - maxWidth;
    }
    left = Math.max(padding, left);
    tooltipPos = { top: r.bottom + 6, left, maxWidth };
  }

  function onPointerEnter() {
    if (!canHover || !likelyTruncated) return;
    updateTooltipPos();
    hoverOpen = true;
  }

  function onPointerLeave() {
    hoverOpen = false;
  }

  function openSheet() {
    if (!likelyTruncated) return;
    sheetOpen = true;
  }

  function onTriggerClick() {
    openSheet();
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSheet();
    }
  }

  function closeSheet() {
    sheetOpen = false;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeSheet();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if likelyTruncated}
  <button
    bind:this={triggerEl}
    type="button"
    class="block max-w-full truncate text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-400 dark:focus-visible:outline-zinc-500 {className}"
    onclick={onTriggerClick}
    onkeydown={onTriggerKeydown}
    onpointerenter={onPointerEnter}
    onpointerleave={onPointerLeave}
    onfocus={onPointerEnter}
    onblur={onPointerLeave}
    aria-label="View full detail"
  >
    {text}
  </button>

  {#if hoverOpen && canHover}
    <div
      role="tooltip"
      class="pointer-events-none fixed z-50 rounded border border-zinc-200 bg-white px-2.5 py-2 text-xs leading-relaxed break-words text-zinc-800 shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      style:top="{tooltipPos.top}px"
      style:left="{tooltipPos.left}px"
      style:max-width="{tooltipPos.maxWidth}px"
    >
      {text}
    </div>
  {/if}

  {#if sheetOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onclick={closeSheet}
      role="presentation"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="w-full max-w-md rounded-t-lg border border-zinc-200 bg-white p-4 shadow-lg sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-900"
        onclick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction detail"
        tabindex="-1"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Detail</p>
          <button
            type="button"
            onclick={closeSheet}
            class="flex h-7 w-7 shrink-0 items-center justify-center border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <p class="text-sm leading-relaxed break-words text-zinc-800 dark:text-zinc-100">{text}</p>
      </div>
    </div>
  {/if}
{:else}
  <span class="block truncate {className}">{text}</span>
{/if}
