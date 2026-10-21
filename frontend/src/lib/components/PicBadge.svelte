<script lang="ts" module>
  let badgeSeq = 0;
</script>

<script lang="ts">
  import { page } from '$app/state';
  import { avatarPref, readAvatarPref, type AvatarMode } from '$lib/avatar';
  import UserAvatar from '$lib/components/UserAvatar.svelte';

  interface Props {
    name: string;
  }

  let { name }: Props = $props();

  const scope = `b${++badgeSeq}`;

  let mode = $state<AvatarMode>('initial');
  let seed = $state('');
  let picture = $state('');

  $effect(() => {
    const label = name.trim();
    const live = $avatarPref;
    const session = page.data.session;
    const sessionPic = typeof session?.pic === 'string' ? session.pic.trim() : '';
    const mine = Boolean(sessionPic) && sessionPic.toLowerCase() === label.toLowerCase();
    const chosen = mine ? live : readAvatarPref(label);
    if (!chosen) {
      mode = 'initial';
      seed = label || 'airafin';
      picture = '';
      return;
    }
    mode = chosen.mode;
    seed = chosen.seed.trim() || label || 'airafin';
    picture =
      mine && chosen.mode === 'google' && typeof session?.picture === 'string' ? session.picture : '';
  });
</script>

<span class="inline-flex shrink-0" title={name}>
  <UserAvatar nickname={name} {picture} size={20} {mode} {seed} {scope} />
</span>
