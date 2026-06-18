<script lang="ts">
  import { POCKET_COLORS } from '$lib/pocket-colors';

  type Props = {
    value: string;
    colors?: readonly string[];
    disabled?: boolean;
    size?: 'sm' | 'md';
    'aria-label'?: string;
    onchange?: (color: string) => void;
  };

  let {
    value = $bindable(),
    colors = POCKET_COLORS,
    disabled = false,
    size = 'md',
    'aria-label': ariaLabel = 'Select color',
    onchange,
  }: Props = $props();

  let open = $state(false);

  const triggerSize = $derived(size === 'sm' ? 'h-5 w-5' : 'h-7 w-7');
  const optionSize = $derived(size === 'sm' ? 'h-8 w-8' : 'h-9 w-9');

  function openPicker() {
    if (disabled) return;
    open = true;
  }

  function closePicker() {
    open = false;
  }

  function select(color: string) {
    closePicker();
    if (onchange) {
      onchange(color);
      return;
    }
    value = color;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closePicker();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<button
  type="button"
  {disabled}
  onclick={openPicker}
  aria-label={ariaLabel}
  aria-expanded={open}
  aria-haspopup="dialog"
  class="{triggerSize} shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
  style="background-color: {value}"
  title={value}
></button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
    onclick={closePicker}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="w-full max-w-xs rounded-t-lg border border-zinc-200 bg-white p-4 shadow-lg sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-900"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Choose color"
      tabindex="-1"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Color</p>
        <button
          type="button"
          onclick={closePicker}
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
      <div class="grid grid-cols-4 justify-items-center gap-3" role="listbox" aria-label="Color options">
        {#each colors as color}
          <button
            type="button"
            role="option"
            aria-selected={value === color}
            onclick={() => select(color)}
            class="{optionSize} rounded-full border-2 {value === color ? 'border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700'}"
            style="background-color: {color}"
            aria-label={color}
            title={color}
          ></button>
        {/each}
      </div>
    </div>
  </div>
{/if}
