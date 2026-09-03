<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    addProjectMember,
    copyProjectTemplate,
    createAuthEmail,
    createProject,
    deleteAuthEmail,
    deleteProject,
    getAuthEmails,
    getPics,
    getProjectMembers,
    getProjects,
    removeProjectMember,
    setAuthEmailAdmin,
    updateAuthEmailPic,
    updateProject,
  } from '$lib/api';
  import { defaultPic, setPicNames } from '$lib/pics';
  import {
    listYearOptionsForPeriod,
    MONTH_NAMES,
    periodFromParts,
    periodFromUrl,
    periodParts,
  } from '$lib/period';
  import type { AuthEmailSetting, Project } from '$lib/types';
  import InfoUpdateAdmin from '$lib/components/InfoUpdateAdmin.svelte';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const isAdmin = $derived(page.data.isAdmin === true);

  type Tab = 'projects' | 'users' | 'info';
  let tab = $state<Tab>('projects');
  let editingId = $state<number | null>(null);

  let projects = $state<Project[]>([]);
  let picNames = $state<string[]>([]);
  let authEmails = $state<AuthEmailSetting[]>([]);
  let members = $state<{ id: number; projectId: number; email: string }[]>([]);

  let renameValue = $state('');
  let renaming = $state(false);
  let photoPreview = $state<string | null>(null);
  let photoInputEl = $state<HTMLInputElement | null>(null);

  let memberEmail = $state('');
  let authEmailInput = $state('');
  let authEmailPic = $state(defaultPic());

  let copyOpen = $state(false);
  let copyFromId = $state<number | null>(null);
  let copyMonth = $state(0);
  let copyYear = $state(new Date().getFullYear());

  let deleteOpen = $state(false);
  let deletePassword = $state('');

  let createOpen = $state(false);
  let newName = $state('');
  let newPhoto = $state<string | null>(null);

  let loading = $state(true);
  let busy = $state(false);
  let success = $state('');
  let error = $state('');

  const picNamesList = $derived(picNames);
  const editing = $derived(projects.find((p) => p.id === editingId) ?? null);
  const otherProjects = $derived(projects.filter((p) => p.id !== editingId));
  const copyYears = $derived(listYearOptionsForPeriod(copyYear));
  const availableMemberEmails = $derived(
    authEmails.map((e) => e.email).filter((email) => !members.some((m) => m.email === email)),
  );

  $effect(() => {
    if (!isAdmin) void goto(withPeriod('/'));
  });

  function withPeriod(path: string) {
    const url = new URL(path, page.url.origin);
    url.searchParams.set('period', period);
    return `${url.pathname}${url.search}`;
  }

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [projRes, picRes, emailRes] = await Promise.all([
        getProjects({ all: true }),
        getPics(),
        getAuthEmails(),
      ]);
      projects = projRes.projects;
      picNames = picRes.pics.map((p) => p.name);
      setPicNames(picNames);
      authEmails = emailRes.emails;
      if (!picNames.includes(authEmailPic)) authEmailPic = defaultPic(picNames);
      if (editingId != null && !projects.some((p) => p.id === editingId)) {
        editingId = null;
      }
      if (editingId != null) await loadProjectDetails(editingId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load admin';
    } finally {
      loading = false;
    }
  }

  async function loadProjectDetails(id: number) {
    const project = projects.find((p) => p.id === id);
    renameValue = project?.name ?? '';
    photoPreview = project?.photo ?? null;
    renaming = false;
    copyOpen = false;
    deleteOpen = false;
    deletePassword = '';
    memberEmail = '';
    const parts = periodParts(period);
    copyMonth = parts.month;
    copyYear = parts.year;
    const others = projects.filter((p) => p.id !== id);
    copyFromId = others[0]?.id ?? null;
    try {
      members = (await getProjectMembers(id)).members;
    } catch {
      members = [];
    }
  }

  $effect(() => {
    void isAdmin;
    void loadAll();
  });

  function openEdit(project: Project) {
    editingId = project.id;
    success = '';
    error = '';
    void loadProjectDetails(project.id);
  }

  function backToList() {
    editingId = null;
    renaming = false;
    copyOpen = false;
    deleteOpen = false;
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

  async function handleRename() {
    if (!editingId) return;
    const name = renameValue.trim();
    if (!name) return;
    busy = true;
    success = '';
    error = '';
    try {
      const { project } = await updateProject(editingId, { name });
      projects = projects.map((p) => (p.id === project.id ? project : p));
      renameValue = project.name;
      renaming = false;
      success = 'Renamed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rename failed';
    } finally {
      busy = false;
    }
  }

  async function handlePhotoChange(e: Event) {
    if (!editingId) return;
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    success = '';
    error = '';
    try {
      const photo = await readPhotoFile(file);
      const { project } = await updateProject(editingId, { photo });
      photoPreview = project.photo;
      projects = projects.map((p) => (p.id === project.id ? project : p));
      success = 'Photo updated';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Photo update failed';
    } finally {
      busy = false;
      if (photoInputEl) photoInputEl.value = '';
    }
  }

  async function handleAddMember() {
    if (!editingId || !memberEmail) return;
    busy = true;
    success = '';
    error = '';
    try {
      await addProjectMember(editingId, memberEmail);
      memberEmail = '';
      await loadProjectDetails(editingId);
      success = 'User added';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add user';
    } finally {
      busy = false;
    }
  }

  async function handleRemoveMember(email: string) {
    if (!editingId) return;
    if (!confirm(`Remove ${email}?`)) return;
    busy = true;
    try {
      await removeProjectMember(editingId, email);
      await loadProjectDetails(editingId);
      success = 'User removed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleCopyTemplate() {
    if (!editingId || !copyFromId) return;
    const sourcePeriod = periodFromParts(copyMonth, copyYear);
    if (!confirm(`Copy plan from another project for ${sourcePeriod}? Existing plan for that month will be replaced.`)) {
      return;
    }
    busy = true;
    success = '';
    error = '';
    try {
      const result = await copyProjectTemplate(editingId, {
        fromProjectId: copyFromId,
        period: sourcePeriod,
      });
      copyOpen = false;
      success = `Copied · ${result.copied.budgets} budgets · ${result.copied.incomes} incomes`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Copy failed';
    } finally {
      busy = false;
    }
  }

  async function handleDeleteProject() {
    if (!editingId || !editing) return;
    if (!deletePassword) {
      error = 'Password required';
      return;
    }
    if (!confirm(`Delete “${editing.name}” and all its data?`)) return;
    busy = true;
    success = '';
    error = '';
    try {
      await deleteProject(editingId, deletePassword);
      deletePassword = '';
      editingId = null;
      await loadAll();
      success = 'Project deleted';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    } finally {
      busy = false;
    }
  }

  async function handleCreateProject() {
    const name = newName.trim();
    if (!name) return;
    busy = true;
    error = '';
    try {
      const { project } = await createProject({ name, photo: newPhoto });
      createOpen = false;
      newName = '';
      newPhoto = null;
      await loadAll();
      openEdit(project);
      success = 'Project created';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Create failed';
    } finally {
      busy = false;
    }
  }

  async function onNewPhoto(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      newPhoto = await readPhotoFile(file);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid image';
    }
  }

  async function handleAddUser() {
    const email = authEmailInput.trim().toLowerCase();
    if (!email) return;
    busy = true;
    success = '';
    error = '';
    try {
      await createAuthEmail(email, authEmailPic);
      authEmailInput = '';
      await loadAll();
      success = `${email} added`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add user';
    } finally {
      busy = false;
    }
  }

  async function handleUserPic(item: AuthEmailSetting, pic: string) {
    if (item.pic === pic) return;
    busy = true;
    try {
      const { email } = await updateAuthEmailPic(item.id, pic);
      authEmails = authEmails.map((row) => (row.id === item.id ? email : row));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleToggleAdmin(item: AuthEmailSetting) {
    if (item.isSuperUser) return;
    busy = true;
    try {
      const { email } = await setAuthEmailAdmin(item.id, !item.isAdmin);
      authEmails = authEmails.map((row) => (row.id === item.id ? email : row));
      success = email.isAdmin ? 'Admin granted' : 'Admin removed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleDeleteUser(item: AuthEmailSetting) {
    if (!confirm(`Remove “${item.email}”?`)) return;
    busy = true;
    try {
      await deleteAuthEmail(item.id);
      authEmails = authEmails.filter((row) => row.id !== item.id);
      success = 'User removed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  const fieldClass =
    'w-full border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600';
  const selectClass =
    'border border-zinc-200 bg-white px-2 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950';
</script>

<section class="mx-auto max-w-lg space-y-5">
  {#if editingId == null}
    <div class="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        class="flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition
          {tab === 'projects'
          ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
          : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}"
        onclick={() => (tab = 'projects')}
      >
        Projects
      </button>
      <button
        type="button"
        class="flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition
          {tab === 'users'
          ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
          : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}"
        onclick={() => (tab = 'users')}
      >
        Users
      </button>
      <button
        type="button"
        class="flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition
          {tab === 'info'
          ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
          : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}"
        onclick={() => (tab = 'info')}
      >
        Info
      </button>
    </div>
  {/if}

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}
  {#if success}
    <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
  {/if}

  {#if loading}
    <p class="py-10 text-center text-xs text-zinc-400">Loading…</p>
  {:else if editing && editingId != null}
    <!-- Project edit -->
    <div class="space-y-5">
      <button
        type="button"
        onclick={backToList}
        class="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
      >
        ← All projects
      </button>

      <!-- Photo -->
      <div class="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {#if photoPreview}
          <img src={photoPreview} alt="" class="h-full w-full object-cover" />
        {:else}
          <div class="flex h-full w-full items-center justify-center text-4xl font-semibold tracking-tight text-zinc-300 dark:text-zinc-700">
            {editing.name.slice(0, 1).toUpperCase()}
          </div>
        {/if}
        <input
          bind:this={photoInputEl}
          type="file"
          accept="image/*"
          class="hidden"
          onchange={handlePhotoChange}
        />
        <button
          type="button"
          disabled={busy}
          onclick={() => photoInputEl?.click()}
          class="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center bg-white/95 text-zinc-800 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white disabled:opacity-50 dark:bg-zinc-950/95 dark:text-zinc-100 dark:ring-zinc-700"
          aria-label="Change photo"
          title="Change photo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      <!-- Name -->
      <div class="relative border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        {#if renaming}
          <div class="flex gap-2 pr-10">
            <input class="{fieldClass} flex-1" bind:value={renameValue} onkeydown={(e) => e.key === 'Enter' && handleRename()} />
            <button
              type="button"
              disabled={busy || !renameValue.trim()}
              onclick={handleRename}
              class="shrink-0 border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-zinc-900"
            >
              Save
            </button>
          </div>
        {:else}
          <p class="pr-10 text-center text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {editing.name}
          </p>
        {/if}
        <button
          type="button"
          disabled={busy}
          onclick={() => {
            renaming = !renaming;
            renameValue = editing.name;
          }}
          class="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Rename"
          title="Rename"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      <!-- Users -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Users</h2>
          <span class="text-[10px] tabular-nums text-zinc-400">{members.length}</span>
        </div>

        {#if availableMemberEmails.length > 0}
          <div class="flex gap-2">
            <select class="min-w-0 flex-1 {selectClass}" bind:value={memberEmail}>
              <option value="">Add user…</option>
              {#each availableMemberEmails as email}
                <option value={email}>{email}</option>
              {/each}
            </select>
            <button
              type="button"
              disabled={busy || !memberEmail}
              onclick={handleAddMember}
              class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
            >
              Add
            </button>
          </div>
        {/if}

        {#if members.length === 0}
          <p class="border border-dashed border-zinc-200 px-3 py-4 text-center text-[11px] text-zinc-400 dark:border-zinc-800">
            No users assigned
          </p>
        {:else}
          <ul class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
            {#each members as m (m.id)}
              <li class="flex items-center justify-between gap-2 px-3 py-2.5">
                <span class="truncate text-sm text-zinc-800 dark:text-zinc-200">{m.email}</span>
                <button
                  type="button"
                  class="shrink-0 text-[10px] text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  onclick={() => handleRemoveMember(m.email)}
                >
                  Remove
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Copy -->
      <div class="border border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-3 text-left"
          onclick={() => (copyOpen = !copyOpen)}
        >
          <span class="text-sm font-medium text-zinc-800 dark:text-zinc-100">Copy template</span>
          <span class="text-zinc-400">{copyOpen ? '−' : '+'}</span>
        </button>
        {#if copyOpen}
          <div class="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-900">
            <p class="text-[11px] text-zinc-500">Copy plan (budget & checklist) from another project.</p>
            <select class="w-full {selectClass}" bind:value={copyFromId}>
              {#each otherProjects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
            <div class="flex gap-2">
              <select class="min-w-0 flex-1 {selectClass}" bind:value={copyMonth}>
                {#each MONTH_NAMES as name, i}
                  <option value={i}>{name}</option>
                {/each}
              </select>
              <select class="w-24 {selectClass}" bind:value={copyYear}>
                {#each copyYears as year}
                  <option value={year}>{year}</option>
                {/each}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !copyFromId || otherProjects.length === 0}
              onclick={handleCopyTemplate}
              class="w-full border border-zinc-900 bg-zinc-900 py-2 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-zinc-900"
            >
              Copy
            </button>
          </div>
        {/if}
      </div>

      <!-- Delete -->
      <div class="border border-red-200/80 dark:border-red-900/50">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-3 text-left"
          onclick={() => (deleteOpen = !deleteOpen)}
          disabled={projects.length <= 1}
        >
          <span class="text-sm font-medium text-red-700 dark:text-red-400">Delete project</span>
          <span class="text-red-400/70">{deleteOpen ? '−' : '+'}</span>
        </button>
        {#if deleteOpen}
          <div class="space-y-2 border-t border-red-100 px-3 pb-3 pt-2 dark:border-red-950">
            <p class="text-[11px] text-zinc-500">Enter dashboard login password to confirm.</p>
            <input
              type="password"
              class={fieldClass}
              bind:value={deletePassword}
              placeholder="Password"
              autocomplete="current-password"
            />
            <button
              type="button"
              disabled={busy || projects.length <= 1}
              onclick={handleDeleteProject}
              class="w-full border border-red-600 bg-red-600 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Delete forever
            </button>
          </div>
        {/if}
      </div>
    </div>
  {:else if tab === 'projects'}
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-[11px] text-zinc-500">{projects.length} project{projects.length === 1 ? '' : 's'}</p>
        <button
          type="button"
          onclick={() => {
            createOpen = true;
            newName = '';
            newPhoto = null;
            error = '';
          }}
          class="border border-zinc-300 px-2.5 py-1.5 text-[11px] font-medium dark:border-zinc-700"
        >
          + New
        </button>
      </div>

      {#if projects.length === 0}
        <p class="border border-dashed border-zinc-200 py-12 text-center text-xs text-zinc-400 dark:border-zinc-800">
          No projects yet
        </p>
      {:else}
        <ul class="grid grid-cols-2 gap-3">
          {#each projects as project (project.id)}
            <li>
              <button
                type="button"
                onclick={() => openEdit(project)}
                class="group flex w-full flex-col overflow-hidden border border-zinc-200 text-left transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div class="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
                  {#if project.photo}
                    <img src={project.photo} alt="" class="h-full w-full object-cover" />
                  {:else}
                    <div class="flex h-full w-full items-center justify-center text-2xl font-semibold text-zinc-300 dark:text-zinc-700">
                      {project.name.slice(0, 1).toUpperCase()}
                    </div>
                  {/if}
                  <span
                    class="absolute bottom-2 right-2 bg-white/95 px-2 py-1 text-[10px] font-medium text-zinc-800 opacity-90 ring-1 ring-zinc-200 group-hover:opacity-100 dark:bg-zinc-950/95 dark:text-zinc-100 dark:ring-zinc-700"
                  >
                    Edit
                  </span>
                </div>
                <div class="truncate px-2.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                  {project.name}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if tab === 'users'}
    <div class="space-y-3">
      <p class="text-[11px] text-zinc-500">Google accounts that can sign in.</p>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          bind:value={authEmailInput}
          placeholder="name@gmail.com"
          class="min-w-0 flex-1 {fieldClass}"
        />
        <div class="flex gap-2">
          <select bind:value={authEmailPic} class={selectClass} aria-label="PIC">
            {#each picNamesList as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <button
            type="button"
            onclick={handleAddUser}
            disabled={busy || !authEmailInput.trim() || picNamesList.length === 0}
            class="shrink-0 border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-zinc-900"
          >
            Add
          </button>
        </div>
      </div>

      {#if authEmails.length === 0}
        <p class="text-xs text-zinc-400">No users yet.</p>
      {:else}
        <ul class="divide-y divide-zinc-100 border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {#each authEmails as item (item.id)}
            <li class="space-y-2 px-3 py-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.email}</p>
                  <p class="text-[10px] uppercase tracking-wider text-zinc-400">
                    {#if item.isSuperUser}Root admin{:else if item.isAdmin}Admin{:else}User{/if}
                  </p>
                </div>
                {#if !item.isSuperUser}
                  <button
                    type="button"
                    class="shrink-0 text-[10px] text-red-600 dark:text-red-400"
                    onclick={() => handleDeleteUser(item)}
                  >
                    Delete
                  </button>
                {/if}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <select
                  value={item.pic}
                  disabled={busy}
                  onchange={(e) => handleUserPic(item, (e.currentTarget as HTMLSelectElement).value)}
                  class={selectClass}
                  aria-label="PIC"
                >
                  {#each picNamesList as p}
                    <option value={p}>{p}</option>
                  {/each}
                  {#if !picNamesList.includes(item.pic)}
                    <option value={item.pic}>{item.pic}</option>
                  {/if}
                </select>
                {#if !item.isSuperUser}
                  <button
                    type="button"
                    disabled={busy}
                    onclick={() => handleToggleAdmin(item)}
                    class="border border-zinc-200 px-2 py-1.5 text-[10px] dark:border-zinc-800"
                  >
                    {item.isAdmin ? 'Unset admin' : 'Set as admin'}
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <InfoUpdateAdmin />
  {/if}
</section>

{#if createOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
    <div class="w-full max-w-sm space-y-3 border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 class="text-sm font-semibold">New project</h3>
      <input class={fieldClass} bind:value={newName} placeholder="Project name" />
      <input type="file" accept="image/*" class="block w-full text-xs text-zinc-500" onchange={onNewPhoto} />
      {#if newPhoto}
        <img src={newPhoto} alt="" class="h-20 w-20 object-cover" />
      {/if}
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="px-3 py-2 text-xs text-zinc-500" onclick={() => (createOpen = false)}>Cancel</button>
        <button
          type="button"
          disabled={busy || !newName.trim()}
          class="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-zinc-900"
          onclick={handleCreateProject}
        >
          Create
        </button>
      </div>
    </div>
  </div>
{/if}
