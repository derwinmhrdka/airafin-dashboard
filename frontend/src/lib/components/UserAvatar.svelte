<script lang="ts">
  import { avatarPref, nameInitial, type AvatarMode } from '$lib/avatar';
  import { colorAvatar } from '$lib/color-avatar/render';

  interface Props {
    nickname: string;
    picture?: string;
    size?: number;
    /** When set, render this choice instead of the saved one. */
    mode?: AvatarMode;
    seed?: string;
    /** Extra id scope when several copies of the same face are on one page. */
    scope?: string;
  }

  let { nickname, picture = '', size = 40, mode, seed, scope = '' }: Props = $props();

  const resolvedMode = $derived(mode ?? $avatarPref.mode);
  const resolvedSeed = $derived(
    (seed ?? $avatarPref.seed).trim() || nickname.trim() || 'airafin',
  );
  const look = $derived(
    resolvedMode === 'color' ? colorAvatar(resolvedSeed, `${size}${scope}`) : null,
  );
  const initial = $derived(nameInitial(nickname));
  let photoFailed = $state(false);

  $effect(() => {
    picture;
    photoFailed = false;
  });
</script>

<span
  class="flex shrink-0 overflow-hidden rounded-full {look ? '' : 'bg-zinc-100 dark:bg-zinc-900'}"
  style="width: {size}px; height: {size}px;{look ? ` background: ${look.background};` : ''}"
>
  {#if resolvedMode === 'google' && picture.trim() && !photoFailed}
    <img
      src={picture}
      alt=""
      class="h-full w-full object-cover"
      referrerpolicy="no-referrer"
      onerror={() => (photoFailed = true)}
    />
  {:else if resolvedMode === 'google'}
    <svg viewBox="0 0 64 64" class="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#e8f0fe" />
      <text x="32" y="42" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#4285F4">G</text>
    </svg>
  {:else if resolvedMode === 'initial'}
    <span
      class="flex h-full w-full items-center justify-center bg-zinc-900 font-semibold text-white dark:bg-white dark:text-black"
      style="font-size: {Math.max(12, Math.round(size * 0.42))}px"
      aria-hidden="true"
    >{initial}</span>
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
