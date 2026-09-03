<script lang="ts">
  import {
    createInfoUpdate,
    deleteInfoUpdate,
    getInfoUpdate,
    listInfoUpdates,
    updateInfoUpdate,
  } from '$lib/api';
  import type { InfoUpdate, InfoUpdatePage } from '$lib/types';

  let updates = $state<InfoUpdate[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let success = $state('');

  let editingId = $state<number | null>(null);
  let title = $state('');
  let active = $state(false);
  let pages = $state<InfoUpdatePage[]>([{ body: '', photo: null }]);

  async function loadList() {
    loading = true;
    error = '';
    try {
      updates = (await listInfoUpdates()).updates;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void loadList();
  });

  function readPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 720;
        let { width, height } = img;
        const scale = Math.min(1, max / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Invalid image'));
      };
      img.src = url;
    });
  }

  function startCreate() {
    editingId = 0;
    title = '';
    active = false;
    pages = [{ body: '', photo: null }];
    success = '';
    error = '';
  }

  async function startEdit(id: number) {
    busy = true;
    error = '';
    try {
      const { update } = await getInfoUpdate(id);
      editingId = update.id;
      title = update.title;
      active = update.active;
      pages =
        update.pages && update.pages.length > 0
          ? update.pages.map((p) => ({ body: p.body, photo: p.photo }))
          : [{ body: '', photo: null }];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to open';
    } finally {
      busy = false;
    }
  }

  function back() {
    editingId = null;
    void loadList();
  }

  function addPage() {
    if (pages.length >= 12) return;
    pages = [...pages, { body: '', photo: null }];
  }

  function removePage(index: number) {
    if (pages.length <= 1) return;
    pages = pages.filter((_, i) => i !== index);
  }

  function movePage(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= pages.length) return;
    const copy = [...pages];
    const tmp = copy[index]!;
    copy[index] = copy[next]!;
    copy[next] = tmp;
    pages = copy;
  }

  async function onPagePhoto(index: number, e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const photo = await readPhoto(file);
      pages = pages.map((p, i) => (i === index ? { ...p, photo } : p));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Photo failed';
    }
  }

  async function save() {
    const t = title.trim();
    if (!t) {
      error = 'Title is required';
      return;
    }
    busy = true;
    error = '';
    success = '';
    try {
      const payload = {
        title: t,
        active,
        pages: pages.map((p) => ({ body: p.body, photo: p.photo })),
      };
      if (editingId === 0) {
        await createInfoUpdate(payload);
        success = 'Created';
      } else if (editingId != null) {
        await updateInfoUpdate(editingId, payload);
        success = 'Saved';
      }
      editingId = null;
      await loadList();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed';
    } finally {
      busy = false;
    }
  }

  async function toggleActive(item: InfoUpdate) {
    busy = true;
    try {
      await updateInfoUpdate(item.id, { active: !item.active });
      await loadList();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function remove(item: InfoUpdate) {
    if (!confirm(`Delete “${item.title}”?`)) return;
    busy = true;
    try {
      await deleteInfoUpdate(item.id);
      await loadList();
      success = 'Deleted';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  const fieldClass =
    'w-full border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950';
</script>

{#if error}
  <p class="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
{/if}
{#if success}
  <p class="mb-3 text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
{/if}

{#if editingId != null}
  <div class="space-y-4">
    <button type="button" class="text-[11px] text-zinc-500 underline-offset-2 hover:underline" onclick={back}>
      ← All updates
    </button>

    <label class="block space-y-1">
      <span class="text-[10px] uppercase tracking-wider text-zinc-400">Title</span>
      <input class={fieldClass} bind:value={title} placeholder="What's new" />
    </label>

    <label class="flex items-center justify-between gap-3 border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <span class="text-sm text-zinc-800 dark:text-zinc-100">Active (show to users)</span>
      <input type="checkbox" bind:checked={active} class="h-4 w-4" />
    </label>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Pages</h3>
        <button
          type="button"
          disabled={pages.length >= 12}
          onclick={addPage}
          class="text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
        >
          + Page
        </button>
      </div>

      {#each pages as page, index (index)}
        <div class="space-y-2 border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium text-zinc-500">Page {index + 1}</span>
            <div class="flex gap-1">
              <button type="button" class="px-1.5 text-[10px] text-zinc-400" disabled={index === 0} onclick={() => movePage(index, -1)}>↑</button>
              <button type="button" class="px-1.5 text-[10px] text-zinc-400" disabled={index === pages.length - 1} onclick={() => movePage(index, 1)}>↓</button>
              <button
                type="button"
                class="px-1.5 text-[10px] text-red-500"
                disabled={pages.length <= 1}
                onclick={() => removePage(index)}
              >
                Remove
              </button>
            </div>
          </div>
          <textarea
            class="{fieldClass} min-h-24 resize-y"
            placeholder="Message text…"
            value={page.body}
            oninput={(e) => {
              const body = (e.currentTarget as HTMLTextAreaElement).value;
              pages = pages.map((p, i) => (i === index ? { ...p, body } : p));
            }}
          ></textarea>
          <div class="flex items-start gap-3">
            {#if page.photo}
              <div class="relative">
                <img src={page.photo} alt="" class="h-20 w-20 object-cover" />
                <button
                  type="button"
                  class="absolute -right-1 -top-1 bg-zinc-900 px-1 text-[9px] text-white"
                  onclick={() => {
                    pages = pages.map((p, i) => (i === index ? { ...p, photo: null } : p));
                  }}
                >
                  ×
                </button>
              </div>
            {/if}
            <label class="text-[11px] text-zinc-500">
              Picture
              <input type="file" accept="image/*" class="mt-1 block w-full text-xs" onchange={(e) => onPagePhoto(index, e)} />
            </label>
          </div>
        </div>
      {/each}
    </div>

    <button
      type="button"
      disabled={busy}
      onclick={save}
      class="w-full border border-zinc-900 bg-zinc-900 py-2.5 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-zinc-900"
    >
      {editingId === 0 ? 'Create' : 'Save'}
    </button>
  </div>
{:else}
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-[11px] text-zinc-500">{updates.length} update{updates.length === 1 ? '' : 's'}</p>
      <button
        type="button"
        onclick={startCreate}
        class="border border-zinc-300 px-2.5 py-1.5 text-[11px] font-medium dark:border-zinc-700"
      >
        + New
      </button>
    </div>

    {#if loading}
      <p class="py-8 text-center text-xs text-zinc-400">Loading…</p>
    {:else if updates.length === 0}
      <p class="border border-dashed border-zinc-200 py-10 text-center text-xs text-zinc-400 dark:border-zinc-800">
        No info updates yet
      </p>
    {:else}
      <ul class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
        {#each updates as item (item.id)}
          <li class="flex items-center gap-3 px-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
              <p class="text-[10px] text-zinc-400">
                {item.pageCount ?? 0} page{(item.pageCount ?? 0) === 1 ? '' : 's'}
                ·
                {item.active ? 'Active' : 'Off'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onclick={() => toggleActive(item)}
              class="shrink-0 border px-2 py-1 text-[10px]
                {item.active
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-500 dark:text-emerald-400'
                : 'border-zinc-300 text-zinc-500 dark:border-zinc-700'}"
            >
              {item.active ? 'On' : 'Off'}
            </button>
            <button type="button" class="text-[10px] text-zinc-600 dark:text-zinc-300" onclick={() => startEdit(item.id)}>
              Edit
            </button>
            <button type="button" class="text-[10px] text-red-600 dark:text-red-400" onclick={() => remove(item)}>
              Delete
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
