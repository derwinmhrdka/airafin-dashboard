<script lang="ts">
  import { page } from '$app/state';
  import { PICS, type Pic } from '$lib/pics';

  let { data }: { data: { googleEnabled: boolean } } = $props();

  let password = $state('');
  let pic = $state<Pic>('Derwin');
  let error = $state('');
  let loading = $state(false);
  let showPassword = $state(false);

  const errorMessages: Record<string, string> = {
    google_not_configured: 'Google sign-in is not configured on the server.',
    invalid_state: 'Sign-in expired. Try again.',
    email_not_allowed: 'This Google account is not allowed.',
    email_not_verified: 'Verify your Google email first.',
    google_failed: 'Google sign-in failed. Try again.',
    access_denied: 'Google sign-in was cancelled.',
  };

  $effect(() => {
    const code = page.url.searchParams.get('error');
    if (code) {
      error = errorMessages[code] ?? `Sign-in error: ${code}`;
    }
  });

  async function handlePasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = '';

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, pic }),
      });

      if (res.ok) {
        window.location.href = '/';
        return;
      }

      const body = await res.json().catch(() => ({}));
      error = body.error ?? 'Sign in failed';
    } catch {
      error = 'Sign in failed';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in · Airafin</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-white px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] dark:bg-black">
  <div class="w-full max-w-sm border border-zinc-200 p-6 dark:border-zinc-800">
    <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
    <p class="mt-1 text-xs text-zinc-500">Sign in once — session lasts a year.</p>

    {#if error}
      <p class="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>
    {/if}

    {#if data.googleEnabled}
      <a
        href="/auth/google"
        class="mt-5 flex w-full items-center justify-center gap-2 border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.5 5.5-6.4 6.9l.1.1 6.3 5.3C37.3 38.3 44 33 44 24c0-1.3-.1-2.5-.4-3.5z"/>
        </svg>
        Continue with Google
      </a>

      <button
        type="button"
        class="mt-4 w-full text-center text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
        onclick={() => (showPassword = !showPassword)}
      >
        {showPassword ? 'Hide password sign-in' : 'Use password instead'}
      </button>
    {/if}

    {#if !data.googleEnabled || showPassword}
      <form onsubmit={handlePasswordSubmit} class="mt-4 space-y-3">
        <div class="space-y-1">
          <span class="text-[11px] text-zinc-500">I am</span>
          <div class="flex gap-2">
            {#each PICS as p}
              <button
                type="button"
                onclick={() => (pic = p)}
                class="flex-1 border px-2 py-2 text-xs font-medium transition
                  {pic === p
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}"
                aria-pressed={pic === p}
              >
                {p}
              </button>
            {/each}
          </div>
        </div>

        <label class="block space-y-1">
          <span class="text-[11px] text-zinc-500">Password</span>
          <input
            type="password"
            bind:value={password}
            required
            autocomplete="current-password"
            class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    {/if}
  </div>
</div>
