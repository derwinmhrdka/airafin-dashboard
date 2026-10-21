<script lang="ts">
  import { bankSlug } from '$lib/bank-logo';

  /** Same frame for every bank mark. */
  const RATIO = 3;

  interface Props {
    name: string;
    height?: number;
    class?: string;
  }

  let { name, height = 18, class: className = '' }: Props = $props();

  const slug = $derived(bankSlug(name));
  const label = $derived(name.trim());
  const markWidth = $derived(Math.round(height * RATIO));
</script>

{#if slug}
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white p-px {className}"
    style="height: {height}px; width: {markWidth}px"
    title={label}
    aria-label={label}
  >
    <img
      src="/bank-logos/{slug}.svg"
      alt=""
      class="block h-full w-full max-w-none object-contain"
    />
  </span>
{:else if label}
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-900 {className}"
    style="height: {height}px; width: {markWidth}px"
    title={label}
  >
    <span class="truncate">{label}</span>
  </span>
{/if}
