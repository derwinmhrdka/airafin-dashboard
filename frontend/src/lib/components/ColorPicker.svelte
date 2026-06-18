<script lang="ts">
  import { POCKET_COLORS } from '$lib/pocket-colors';

  type Props = {
    value: string;
    colors?: readonly string[];
    disabled?: boolean;
    align?: 'left' | 'right';
    size?: 'sm' | 'md';
    'aria-label'?: string;
    onchange?: (color: string) => void;
  };

  let {
    value = $bindable(),
    colors = POCKET_COLORS,
    disabled = false,
    align = 'left',
    size = 'md',
    'aria-label': ariaLabel = 'Select color',
    onchange,
  }: Props = $props();

  let open = $state(false);
  let rootEl = $state<HTMLElement | null>(null);

  const triggerSize = $derived(size === 'sm' ? 'h-5 w-5' : 'h-7 w-7');
  const optionSize = $derived(size === 'sm' ? 'h-5 w-5' : 'h-6 w-6');
  const panelAlign = $derived(align === 'right' ? 'right-0' : 'left-0');

  function toggle() {
    if (disabled) return;
    open = !open;
  }

  function select(color: string) {
    open = false;
    if (onchange) {
      onchange(color);
      return;
    }
    value = color;
  }

  function onWindowClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="relative shrink-0" bind:this={rootEl}>
  <button
    type="button"
    {disabled}
    onclick={toggle}
    aria-label={ariaLabel}
    aria-expanded={open}
    aria-haspopup="listbox"
    class="{triggerSize} rounded-full border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
    style="background-color: {value}"
    title={value}
  ></button>

  {#if open}
    <div
      class="absolute {panelAlign} z-20 mt-1 grid grid-cols-4 gap-1.5 rounded border border-zinc-200 bg-white p-2 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
      role="listbox"
      aria-label="Color options"
    >
      {#each colors as color}
        <button
          type="button"
          role="option"
          aria-selected={value === color}
          onclick={() => select(color)}
          class="{optionSize} rounded-full border {value === color ? 'border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700'}"
          style="background-color: {color}"
          aria-label={color}
          title={color}
        ></button>
      {/each}
    </div>
  {/if}
</div>
