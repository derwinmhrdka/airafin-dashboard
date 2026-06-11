<script lang="ts">
  interface Props {
    name: string;
  }

  let { name }: Props = $props();

  const styles: Record<string, { initial: string; bg: string; text: string }> = {
    Derwin: {
      initial: 'D',
      bg: 'bg-sky-100 dark:bg-sky-900/40',
      text: 'text-sky-800 dark:text-sky-200',
    },
    Anggita: {
      initial: 'A',
      bg: 'bg-violet-100 dark:bg-violet-900/40',
      text: 'text-violet-800 dark:text-violet-200',
    },
  };

  const style = $derived(
    styles[name] ?? {
      initial: name.charAt(0).toUpperCase() || '?',
      bg: 'bg-zinc-100 dark:bg-zinc-800',
      text: 'text-zinc-700 dark:text-zinc-300',
    },
  );
</script>

<span
  class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold {style.bg} {style.text}"
  title={name}
>
  {style.initial}
</span>
