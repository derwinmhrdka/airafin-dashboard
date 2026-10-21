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

  let svg = $state('');

  $effect(() => {
    const current = slug;
    svg = '';
    if (!current) return;

    let alive = true;
    fetch(`/bank-logos/${current}.svg`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((raw) => {
        if (!alive || !raw.includes('<svg')) return;
        const prefix = `bl-${current}-`;
        svg = raw
          .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}${id}"`)
          .replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}${id})`);
      })
      .catch(() => {
        svg = '';
      });

    return () => {
      alive = false;
    };
  });
</script>

{#if slug && svg}
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white p-px {className}"
    style="height: {height}px; width: {markWidth}px"
    title={label}
    aria-label={label}
  >
    <span class="bank-logo-mark block h-full w-full">
      {@html svg}
    </span>
  </span>
{:else if label && !slug}
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-900 {className}"
    style="height: {height}px; width: {markWidth}px"
    title={label}
  >
    <span class="truncate">{label}</span>
  </span>
{/if}

<style>
  .bank-logo-mark :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
