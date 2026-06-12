<script lang="ts">
  import '../app.css';
  import PeriodSelector from '$lib/components/PeriodSelector.svelte';
  import TabNav from '$lib/components/TabNav.svelte';

  let { children } = $props();
</script>

<svelte:head>
  <title>Airafin Dashboard</title>
  <meta name="description" content="Personal financial dashboard" />
</svelte:head>

<div class="mx-auto min-h-dvh max-w-lg bg-white dark:bg-black">
  <header class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h1 class="text-sm font-semibold tracking-tight">Airafin</h1>
      <span class="shrink-0 rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">
        v1
      </span>
    </div>
    <PeriodSelector />
  </header>

  <TabNav />

  <main class="px-4 py-4">
    {@render children()}
  </main>
</div>
