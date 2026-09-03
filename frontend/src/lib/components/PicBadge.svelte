<script lang="ts">
  interface Props {
    name: string;
  }

  let { name }: Props = $props();

  const palettes = [
    { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-800 dark:text-sky-200' },
    { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-800 dark:text-violet-200' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-200' },
    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-200' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-800 dark:text-rose-200' },
    { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-800 dark:text-teal-200' },
  ] as const;

  const named: Record<string, { initial: string; bg: string; text: string }> = {
    Derwin: { initial: 'D', bg: palettes[0].bg, text: palettes[0].text },
    Anggita: { initial: 'A', bg: palettes[1].bg, text: palettes[1].text },
  };

  function paletteFor(label: string) {
    let h = 0;
    for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0;
    return palettes[Math.abs(h) % palettes.length];
  }

  const style = $derived(
    named[name] ?? {
      initial: name.trim().charAt(0).toUpperCase() || '?',
      ...paletteFor(name),
    },
  );
</script>

<span
  class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold {style.bg} {style.text}"
  title={name}
>
  {style.initial}
</span>
