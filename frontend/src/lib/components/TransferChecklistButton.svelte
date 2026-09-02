<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    loading?: boolean;
    label: string;
    onclick: () => void;
  }

  let { checked = false, disabled = false, loading = false, label, onclick }: Props = $props();
</script>

<button
  type="button"
  {disabled}
  {onclick}
  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition
    {checked
    ? 'border-emerald-500 bg-emerald-500 text-white'
    : 'border-zinc-300 bg-zinc-100 text-transparent hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-800'}
    disabled:opacity-50"
  aria-label={label}
>
  {#if loading}
    <span class="text-[10px] font-medium text-zinc-500">…</span>
  {:else if checked}
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  {/if}
</button>
