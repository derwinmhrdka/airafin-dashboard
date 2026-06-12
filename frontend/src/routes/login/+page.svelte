<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Sign in · Airafin</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-white px-4 dark:bg-black">
  <div class="w-full max-w-sm border border-zinc-200 p-6 dark:border-zinc-800">
    <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
    <p class="mt-1 text-xs text-zinc-500">Enter the dashboard password to continue.</p>

    <form method="POST" class="mt-5 space-y-3">
      <label class="block space-y-1">
        <span class="text-[11px] text-zinc-500">Password</span>
        <input
          type="password"
          name="password"
          required
          autocomplete="current-password"
          class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
      </label>

      {#if form?.incorrect}
        <p class="text-xs text-red-600 dark:text-red-400">Incorrect password.</p>
      {/if}

      <button
        type="submit"
        class="w-full border border-black bg-black py-2.5 text-sm font-medium text-white dark:border-white dark:bg-white dark:text-black"
      >
        Sign in
      </button>
    </form>
  </div>
</div>
