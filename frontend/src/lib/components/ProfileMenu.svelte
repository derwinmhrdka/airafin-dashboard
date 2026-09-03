<script lang="ts">
  import PicBadge from '$lib/components/PicBadge.svelte';

  interface Props {
    pic: string;
    email: string;
  }

  let { pic, email }: Props = $props();

  let open = $state(false);
  let signingOut = $state(false);
  let rootEl = $state<HTMLDivElement | null>(null);
  let buttonEl = $state<HTMLButtonElement | null>(null);
  let panelTop = $state(0);

  function placePanel() {
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    panelTop = rect.bottom + 8;
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

  function toggleOpen() {
    open = !open;
    if (open) requestAnimationFrame(placePanel);
  }

  async function signOut() {
    signingOut = true;
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = '/login';
    }
  }
</script>

<div class="relative" bind:this={rootEl}>
  <button
    type="button"
    bind:this={buttonEl}
    onclick={toggleOpen}
    class="rounded-full ring-2 ring-offset-1 ring-offset-white transition
      {open ? 'ring-zinc-900 dark:ring-white' : 'ring-transparent hover:ring-zinc-300 dark:ring-offset-black dark:hover:ring-zinc-600'}"
    aria-label="Profile menu"
    aria-expanded={open}
    title={pic}
  >
    <span class="inline-flex scale-125">
      <PicBadge name={pic} />
    </span>
  </button>

  {#if open}
    <div
      class="fixed z-50 w-44 overflow-hidden border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
      style="top: {panelTop}px; right: max(0.75rem, env(safe-area-inset-right, 0px));"
      role="menu"
      aria-label="Profile"
    >
      <div class="flex flex-col items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <span class="inline-flex scale-150">
          <PicBadge name={pic} />
        </span>
        <span class="max-w-full truncate text-[10px] text-zinc-400" title={email}>{email}</span>
      </div>

      <button
        type="button"
        role="menuitem"
        disabled={signingOut}
        onclick={signOut}
        class="flex w-full items-center justify-center gap-2 px-3 py-3 text-zinc-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-red-950/30 dark:hover:text-red-400"
        aria-label="Sign out"
        title="Sign out"
      >
        {#if signingOut}
          <span class="text-[11px]">…</span>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        {/if}
      </button>
    </div>
  {/if}
</div>
