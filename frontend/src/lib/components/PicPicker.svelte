<script lang="ts">
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { TOGETHER_PIC } from '$lib/pics';

  interface Props {
    value: string;
    pics: readonly string[];
    together?: boolean;
    label?: string;
  }

  let { value = $bindable(), pics, together = false, label = 'PIC' }: Props = $props();

  let open = $state(false);
  let menuStyle = $state('');

  function placeMenu(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    menuStyle = `top:${rect.bottom + 4}px;right:${right}px;`;
  }

  function choose(next: string) {
    value = next;
    open = false;
  }

  $effect(() => {
    if (!open) return;
    const close = () => {
      open = false;
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  });
</script>

<div class="relative flex justify-center">
  <button
    type="button"
    class="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-0.5 pr-1 dark:border-zinc-700 dark:bg-black"
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    title={value === TOGETHER_PIC ? 'Together' : value}
    onclick={(event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (open) {
        open = false;
        return;
      }
      placeMenu(button);
      open = true;
    }}
    onblur={() => {
      setTimeout(() => {
        open = false;
      }, 150);
    }}
  >
    {#if value === TOGETHER_PIC}
      <span
        class="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[8px] font-semibold text-white dark:bg-white dark:text-black"
      >
        All
      </span>
    {:else}
      <PicBadge name={value} />
    {/if}
    <span class="text-[8px] leading-none text-zinc-400" aria-hidden="true">▼</span>
  </button>

  {#if open}
    <ul
      role="listbox"
      style={menuStyle}
      class="fixed z-40 min-w-36 overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
    >
      {#each pics as pic (pic)}
        <li role="option" aria-selected={value === pic}>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs
              {value === pic ? 'bg-zinc-100 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/70'}"
            onmousedown={(event) => {
              event.preventDefault();
              choose(pic);
            }}
          >
            <PicBadge name={pic} />
            <span class="truncate">{pic}</span>
          </button>
        </li>
      {/each}
      {#if together}
        <li role="option" aria-selected={value === TOGETHER_PIC}>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs
              {value === TOGETHER_PIC ? 'bg-zinc-100 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/70'}"
            onmousedown={(event) => {
              event.preventDefault();
              choose(TOGETHER_PIC);
            }}
          >
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[8px] font-semibold text-white dark:bg-white dark:text-black"
            >
              All
            </span>
            <span>Together</span>
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>
