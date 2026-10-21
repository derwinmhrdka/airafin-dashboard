<script lang="ts">
  import { avatarPref, type AvatarMode } from '$lib/avatar';
  import { colorAvatar } from '$lib/color-avatar/render';

  interface Props {
    nickname: string;
    picture?: string;
    size?: number;
    /** When set, render this choice instead of the saved one. */
    mode?: AvatarMode;
    seed?: string;
  }

  let { nickname, picture = '', size = 40, mode, seed }: Props = $props();

  const resolvedMode = $derived(mode ?? $avatarPref.mode);
  const resolvedSeed = $derived(
    (seed ?? $avatarPref.seed).trim() || nickname.trim() || 'airafin',
  );
  const look = $derived(resolvedMode === 'color' ? colorAvatar(resolvedSeed, String(size)) : null);
</script>

<span
  class="flex shrink-0 overflow-hidden rounded-full {look ? '' : 'bg-zinc-100 dark:bg-zinc-900'}"
  style="width: {size}px; height: {size}px;{look ? ` background: ${look.background};` : ''}"
>
  {#if resolvedMode === 'google' && picture.trim()}
    <img src={picture} alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer" />
  {:else if resolvedMode === 'google'}
    <svg viewBox="0 0 64 64" class="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#e8f0fe" />
      <text x="32" y="42" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#4285F4">G</text>
    </svg>
  {:else if resolvedMode === 'person'}
    <svg viewBox="0 0 64 64" class="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="32" class="fill-zinc-200 dark:fill-zinc-800" />
      <circle cx="32" cy="24" r="9" class="fill-zinc-500 dark:fill-zinc-400" />
      <path d="M12 58c2-12 10-18 20-18s18 6 20 18v6H12Z" class="fill-zinc-500 dark:fill-zinc-400" />
    </svg>
  {:else}
    <span class="avatar-svg block h-full w-full">{@html look?.svg ?? ''}</span>
  {/if}
</span>

<style>
  .avatar-svg :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
