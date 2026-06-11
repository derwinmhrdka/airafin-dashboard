<script lang="ts">
  import '../app.css';
  import TabNav from '$lib/components/TabNav.svelte';
  import { currentPeriod } from '$lib/period';

  let { children } = $props();
  const period = currentPeriod();
</script>

<svelte:head>
  <title>Airafin Dashboard</title>
  <meta name="description" content="Personal financial dashboard" />
</svelte:head>

<div class="mx-auto min-h-dvh max-w-lg bg-white dark:bg-black">
  <header class="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
        <p class="text-xs text-zinc-500">{period}</p>
      </div>
      <span class="rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">
        v1
      </span>
    </div>
  </header>

  <TabNav />

  <main class="px-4 py-4">
    {@render children()}
  </main>
</div>
