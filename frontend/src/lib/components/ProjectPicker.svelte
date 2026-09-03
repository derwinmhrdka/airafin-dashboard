<script lang="ts">
  import { createProject, getProjects, selectSessionProject } from '$lib/api';
  import type { Project } from '$lib/types';

  interface Props {
    selectedProjectId: number | null;
    isAdmin?: boolean;
    /** When true, picker is mandatory (blocks the app). */
    required?: boolean;
    onClose?: () => void;
  }

  let { selectedProjectId, isAdmin = false, required = false, onClose }: Props = $props();

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let error = $state('');
  let busyId = $state<number | 'new' | null>(null);

  let creating = $state(false);
  let newName = $state('');
  let newPhoto = $state<string | null>(null);
  let createError = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await getProjects();
      projects = res.projects;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load projects';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  // Lock background scroll while the switcher is open (incl. iOS/PWA).
  $effect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overscrollBehavior = 'none';

    const preventTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Allow scrolling inside the picker panel / dialogs only.
      if (target.closest('[data-project-picker-scroll]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventTouch, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.overscrollBehavior = prevBodyOverscroll;
      document.removeEventListener('touchmove', preventTouch);
      window.scrollTo(0, scrollY);
    };
  });

  async function choose(project: Project) {
    busyId = project.id;
    error = '';
    try {
      await selectSessionProject(project.id);
      window.location.href = '/';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to select project';
      busyId = null;
    }
  }

  function readPhotoFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 640;
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

  async function onPhotoInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      newPhoto = await readPhotoFile(file);
      createError = '';
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Failed to read photo';
    }
  }

  async function submitCreate() {
    createError = '';
    const name = newName.trim();
    if (!name) {
      createError = 'Name is required';
      return;
    }
    busyId = 'new';
    try {
      const { project } = await createProject({ name, photo: newPhoto });
      await selectSessionProject(project.id);
      window.location.href = '/';
    } catch (e) {
      createError = e instanceof Error ? e.message : 'Failed to create';
      busyId = null;
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden overscroll-none bg-zinc-950/80 p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
  role="dialog"
  aria-modal="true"
  aria-label="Select project"
>
  <div class="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl">
    <div class="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
      <div>
        <p class="text-[11px] uppercase tracking-wider text-zinc-500">Workspace</p>
        <h2 class="text-sm font-semibold tracking-tight">
          {required ? 'Choose a project' : 'Switch project'}
        </h2>
      </div>
      {#if !required && onClose}
        <button
          type="button"
          class="text-xs text-zinc-400 underline-offset-2 hover:underline"
          onclick={() => onClose?.()}
        >
          Close
        </button>
      {/if}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-project-picker-scroll>      {#if loading}
        <p class="py-8 text-center text-xs text-zinc-500">Loading projects…</p>
      {:else if error}
        <p class="py-4 text-center text-xs text-red-400">{error}</p>
      {:else}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each projects as project (project.id)}
            <button
              type="button"
              disabled={busyId != null}
              onclick={() => choose(project)}
              class="group relative aspect-square w-full overflow-hidden rounded-sm border text-left transition
                {selectedProjectId === project.id
                ? 'border-amber-500 ring-1 ring-amber-500/40'
                : 'border-zinc-700 hover:border-zinc-500'}"
            >
              {#if project.photo}
                <img src={project.photo} alt="" class="h-full w-full object-cover" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              {:else}
                <div class="flex h-full w-full items-center justify-center bg-zinc-900 text-2xl font-semibold tracking-tight text-zinc-500">
                  {project.name.slice(0, 1).toUpperCase()}
                </div>
              {/if}
              <span class="absolute inset-x-0 bottom-0 truncate px-2 pb-2 text-xs font-medium text-white">
                {project.name}
              </span>
            </button>
          {/each}

          {#if isAdmin}
            <button
              type="button"
              disabled={busyId != null}
              onclick={() => {
                creating = true;
                newName = '';
                newPhoto = null;
                createError = '';
              }}
              class="aspect-square w-full rounded-sm border border-dashed border-zinc-600 bg-zinc-900/40 text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-200"
            >
              <span class="flex h-full flex-col items-center justify-center gap-1">
                <span class="text-2xl leading-none">+</span>
                <span class="text-[11px] font-medium">New project</span>
              </span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if creating}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
    <div class="w-full max-w-sm space-y-3 border border-zinc-700 bg-zinc-950 p-4 text-zinc-100">
      <h3 class="text-sm font-semibold">New project</h3>
      <label class="block space-y-1">
        <span class="text-[11px] uppercase tracking-wider text-zinc-500">Name</span>
        <input
          class="w-full border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm outline-none focus:border-zinc-500"
          bind:value={newName}
          placeholder="e.g. Mahardiora Home"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-[11px] uppercase tracking-wider text-zinc-500">Photo (optional)</span>
        <input
          type="file"
          accept="image/*"
          class="block w-full text-xs text-zinc-400 file:mr-2 file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200"
          onchange={onPhotoInput}
        />
      </label>
      {#if newPhoto}
        <img src={newPhoto} alt="" class="h-24 w-24 object-cover" />
      {/if}
      {#if createError}
        <p class="text-xs text-red-400">{createError}</p>
      {/if}
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="px-2.5 py-1.5 text-xs text-zinc-400" onclick={() => (creating = false)}>Cancel</button>
        <button
          type="button"
          disabled={busyId != null}
          class="border border-zinc-500 bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50"
          onclick={submitCreate}
        >
          Create
        </button>
      </div>
    </div>
  </div>
{/if}
