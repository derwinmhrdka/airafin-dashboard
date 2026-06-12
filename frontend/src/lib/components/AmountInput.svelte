<script lang="ts">
  import { formatAmountInput } from '$lib/format';

  interface Props {
    value?: string;
    required?: boolean;
    placeholder?: string;
    class?: string;
    id?: string;
    'aria-label'?: string;
  }

  let {
    value = $bindable(''),
    required = false,
    placeholder = '0',
    class: className = '',
    id,
    'aria-label': ariaLabel,
  }: Props = $props();

  function onInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    value = raw ? formatAmountInput(Number.parseInt(raw, 10)) : '';
  }
</script>

<input
  {id}
  type="text"
  inputmode="numeric"
  {required}
  {placeholder}
  {value}
  oninput={onInput}
  aria-label={ariaLabel}
  class="w-full border border-zinc-200 bg-white px-2 py-2 font-mono text-sm dark:border-zinc-800 dark:bg-black {className}"
/>
