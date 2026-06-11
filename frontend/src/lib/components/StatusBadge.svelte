<script lang="ts">
  interface Props {
    status: string;
  }

  let { status }: Props = $props();

  const styles: Record<string, string> = {
    Done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    'On Going': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'Not Yet': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  };

  const className = $derived(styles[status] ?? styles['Not Yet']);
</script>

<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {className}">
  {status}
</span>
