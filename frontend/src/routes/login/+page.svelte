<script lang="ts">
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = '';

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
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

<div class="flex min-h-dvh items-center justify-center bg-white px-4 dark:bg-black">
  <div class="w-full max-w-sm border border-zinc-200 p-6 dark:border-zinc-800">
    <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
    <p class="mt-1 text-xs text-zinc-500">Enter the dashboard password to continue.</p>

    <form onsubmit={handleSubmit} class="mt-5 space-y-3">
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

      {#if error}
        <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  </div>
</div>
