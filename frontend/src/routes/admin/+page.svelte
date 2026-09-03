<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    addProjectMember,
    copyProjectTemplate,
    createAuthEmail,
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

  const period = $derived(periodFromUrl(page.url.searchParams));
  const isAdmin = $derived(page.data.isAdmin === true);

  let projects = $state<Project[]>([]);
  let picNames = $state<string[]>([]);
  let authEmails = $state<AuthEmailSetting[]>([]);
  let members = $state<{ id: number; projectId: number; email: string }[]>([]);

  let selectedProjectId = $state<number | null>(null);
  let renameValue = $state('');
  let photoPreview = $state<string | null>(null);

  let memberEmail = $state('');
  let authEmailInput = $state('');
  let authEmailPic = $state(defaultPic());

  let copyFromId = $state<number | null>(null);
  let copyMonth = $state(0);
  let copyYear = $state(new Date().getFullYear());

  let deletePassword = $state('');
  let loading = $state(true);
  let busy = $state(false);
  let success = $state('');
  let error = $state('');

  const picNamesList = $derived(picNames);
  const selectedProject = $derived(projects.find((p) => p.id === selectedProjectId) ?? null);
  const otherProjects = $derived(projects.filter((p) => p.id !== selectedProjectId));
  const copyYears = $derived(listYearOptionsForPeriod(copyYear));
  const availableMemberEmails = $derived(
    authEmails.map((e) => e.email).filter((email) => !members.some((m) => m.email === email)),
  );

  $effect(() => {
    if (!isAdmin) {
      void goto(withPeriod('/'));
    }
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
      if (!picNames.includes(authEmailPic)) {
        authEmailPic = defaultPic(picNames);
      }

      const preferred = page.data.session?.projectId ?? projects[0]?.id ?? null;
      if (selectedProjectId == null || !projects.some((p) => p.id === selectedProjectId)) {
        selectedProjectId = preferred;
      }
      await loadProjectDetails(selectedProjectId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load admin';
    } finally {
      loading = false;
    }
  }

  async function loadProjectDetails(id: number | null) {
    if (!id) {
      members = [];
      renameValue = '';
      photoPreview = null;
      return;
    }
    const project = projects.find((p) => p.id === id);
    renameValue = project?.name ?? '';
    photoPreview = project?.photo ?? null;
    const parts = periodParts(period);
    copyMonth = parts.month;
    copyYear = parts.year;
    copyFromId = otherProjects[0]?.id ?? null;
    try {
      const res = await getProjectMembers(id);
      members = res.members;
    } catch {
      members = [];
    }
  }

  $effect(() => {
    void isAdmin;
    void loadAll();
  });

  $effect(() => {
    void selectedProjectId;
    void projects;
    if (!loading) void loadProjectDetails(selectedProjectId);
  });

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
    if (!selectedProjectId) return;
    busy = true;
    success = '';
    error = '';
    try {
      const { project } = await updateProject(selectedProjectId, { name: renameValue });
      projects = projects.map((p) => (p.id === project.id ? project : p));
      success = 'Project renamed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rename failed';
    } finally {
      busy = false;
    }
  }

  async function handlePhotoChange(e: Event) {
    if (!selectedProjectId) return;
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    success = '';
    error = '';
    try {
      const photo = await readPhotoFile(file);
      const { project } = await updateProject(selectedProjectId, { photo });
      photoPreview = project.photo;
      projects = projects.map((p) => (p.id === project.id ? project : p));
      success = 'Project photo updated';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Photo update failed';
    } finally {
      busy = false;
    }
  }

  async function handleRemovePhoto() {
    if (!selectedProjectId) return;
    busy = true;
    try {
      const { project } = await updateProject(selectedProjectId, { photo: null });
      photoPreview = null;
      projects = projects.map((p) => (p.id === project.id ? project : p));
      success = 'Photo removed';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleAddMember() {
    if (!selectedProjectId || !memberEmail) return;
    busy = true;
    success = '';
    error = '';
    try {
      await addProjectMember(selectedProjectId, memberEmail);
      memberEmail = '';
      await loadProjectDetails(selectedProjectId);
      success = 'User added to project';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add user';
    } finally {
      busy = false;
    }
  }

  async function handleRemoveMember(email: string) {
    if (!selectedProjectId) return;
    if (!confirm(`Remove ${email} from this project?`)) return;
    busy = true;
    try {
      await removeProjectMember(selectedProjectId, email);
      await loadProjectDetails(selectedProjectId);
      success = 'User removed from project';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleCopyTemplate() {
    if (!selectedProjectId || !copyFromId) return;
    const sourcePeriod = periodFromParts(copyMonth, copyYear);
    if (
      !confirm(
        `Copy plan template from another project for ${sourcePeriod} into this project?\n\nThis replaces the plan for ${sourcePeriod} in the selected project.`,
      )
    ) {
      return;
    }
    busy = true;
    success = '';
    error = '';
    try {
      const result = await copyProjectTemplate(selectedProjectId, {
        fromProjectId: copyFromId,
        period: sourcePeriod,
      });
      success = `Template copied (${result.copied.budgets} budgets, ${result.copied.subcategories} subs, ${result.copied.incomes} incomes).`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Copy failed';
    } finally {
      busy = false;
    }
  }

  async function handleDeleteProject() {
    if (!selectedProjectId || !selectedProject) return;
    if (!deletePassword) {
      error = 'Password is required';
      return;
    }
    if (!confirm(`Delete project "${selectedProject.name}" and all its financial data?`)) return;
    busy = true;
    success = '';
    error = '';
    try {
      await deleteProject(selectedProjectId, deletePassword);
      deletePassword = '';
      selectedProjectId = null;
      await loadAll();
      success = 'Project deleted';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    } finally {
      busy = false;
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
      success = `${email.email} → ${pic}`;
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
      success = email.isAdmin ? `${email.email} is now admin` : `${email.email} is no longer admin`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  async function handleDeleteUser(item: AuthEmailSetting) {
    if (!confirm(`Remove login for "${item.email}"?`)) return;
    busy = true;
    try {
      await deleteAuthEmail(item.id);
      authEmails = authEmails.filter((row) => row.id !== item.id);
      success = `${item.email} removed`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed';
    } finally {
      busy = false;
    }
  }

  const selectClass =
    'border border-zinc-200 bg-white px-2 py-2 text-xs dark:border-zinc-800 dark:bg-black';
</script>

<section class="space-y-4">
  <div class="flex items-center justify-between gap-2">
    <p class="text-[11px] uppercase tracking-wider text-zinc-500">Admin</p>
    <a href={withPeriod('/')} class="text-[11px] text-zinc-500 underline-offset-2 hover:underline">← Back</a>
  </div>

  {#if loading}
    <p class="text-xs text-zinc-500">Loading…</p>
  {:else}
    <fieldset class="space-y-3 border border-zinc-200 p-3 dark:border-zinc-800">
      <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Project</legend>

      <label class="block space-y-1">
        <span class="text-[10px] uppercase tracking-wider text-zinc-500">Select project</span>
        <select
          class="w-full {selectClass}"
          value={selectedProjectId ?? ''}
          onchange={(e) => {
            selectedProjectId = Number.parseInt((e.currentTarget as HTMLSelectElement).value, 10) || null;
          }}
        >
          {#each projects as p}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </label>

      {#if selectedProject}
        <div class="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Rename</p>
          <div class="flex gap-2">
            <input
              class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
              bind:value={renameValue}
            />
            <button
              type="button"
              disabled={busy || !renameValue.trim()}
              onclick={handleRename}
              class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
            >
              Save
            </button>
          </div>
        </div>

        <div class="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Change photo</p>
          <div class="flex items-center gap-3">
            {#if photoPreview}
              <img src={photoPreview} alt="" class="h-16 w-16 object-cover" />
            {:else}
              <div class="flex h-16 w-16 items-center justify-center bg-zinc-100 text-lg text-zinc-400 dark:bg-zinc-900">
                {selectedProject.name.slice(0, 1)}
              </div>
            {/if}
            <div class="space-y-1">
              <input type="file" accept="image/*" class="block text-xs" onchange={handlePhotoChange} />
              {#if photoPreview}
                <button type="button" class="text-[10px] text-zinc-500 underline" onclick={handleRemovePhoto}>Remove</button>
              {/if}
            </div>
          </div>
        </div>

        <div class="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Add user to project</p>
          <div class="flex gap-2">
            <select class="min-w-0 flex-1 {selectClass}" bind:value={memberEmail}>
              <option value="">Select user…</option>
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
          {#if members.length === 0}
            <p class="text-[11px] text-zinc-500">No members yet.</p>
          {:else}
            <ul class="space-y-1">
              {#each members as m (m.id)}
                <li class="flex items-center justify-between gap-2 border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800">
                  <span class="truncate">{m.email}</span>
                  <button
                    type="button"
                    class="text-[10px] text-red-600 dark:text-red-400"
                    onclick={() => handleRemoveMember(m.email)}
                  >
                    Remove
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Copy template from</p>
          <p class="text-[11px] text-zinc-500">Copies plan (incomes, budgets, checklist) for a period into this project.</p>
          <select class="w-full {selectClass}" bind:value={copyFromId}>
            {#each otherProjects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <div class="flex gap-2">
            <select class="flex-1 {selectClass}" bind:value={copyMonth} aria-label="Month">
              {#each MONTH_NAMES as name, i}
                <option value={i}>{name}</option>
              {/each}
            </select>
            <select class="w-24 {selectClass}" bind:value={copyYear} aria-label="Year">
              {#each copyYears as year}
                <option value={year}>{year}</option>
              {/each}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !copyFromId || otherProjects.length === 0}
            onclick={handleCopyTemplate}
            class="w-full border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
          >
            Copy template
          </button>
        </div>

        <div class="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Delete project</p>
          <input
            type="password"
            placeholder="Dashboard login password"
            class="w-full border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
            bind:value={deletePassword}
            autocomplete="current-password"
          />
          <button
            type="button"
            disabled={busy || projects.length <= 1}
            onclick={handleDeleteProject}
            class="w-full border border-red-300 px-3 py-2 text-xs text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            Delete project
          </button>
        </div>
      {/if}
    </fieldset>

    <fieldset class="space-y-3 border border-zinc-200 p-3 dark:border-zinc-800">
      <legend class="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Users</legend>
      <p class="text-[11px] text-zinc-500">Google emails that can sign in. Assign PIC and admin role.</p>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          bind:value={authEmailInput}
          placeholder="name@gmail.com"
          class="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-black"
        />
        <div class="flex items-center gap-2">
          <select bind:value={authEmailPic} class={selectClass} aria-label="PIC">
            {#each picNamesList as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <button
            type="button"
            onclick={handleAddUser}
            disabled={busy || !authEmailInput.trim() || picNamesList.length === 0}
            class="shrink-0 border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700"
          >
            + Add
          </button>
        </div>
      </div>

      {#if authEmails.length === 0}
        <p class="text-xs text-zinc-500">No users yet.</p>
      {:else}
        <div class="space-y-1">
          {#each authEmails as item (item.id)}
            <div class="flex flex-col gap-2 border border-zinc-200 px-2 py-2 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <span class="block truncate text-sm">{item.email}</span>
                <span class="text-[10px] uppercase tracking-wider text-zinc-400">
                  {#if item.isSuperUser}
                    Root admin
                  {:else if item.isAdmin}
                    Admin
                  {:else}
                    User
                  {/if}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <select
                  value={item.pic}
                  disabled={busy}
                  onchange={(e) => handleUserPic(item, (e.currentTarget as HTMLSelectElement).value)}
                  class={selectClass}
                  aria-label="PIC for {item.email}"
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
                    class="border border-zinc-300 px-2 py-1 text-[10px] dark:border-zinc-700"
                  >
                    {item.isAdmin ? 'Unset admin' : 'Set as admin'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onclick={() => handleDeleteUser(item)}
                    class="border border-red-200 px-2 py-1 text-[10px] text-red-600 dark:border-red-900 dark:text-red-400"
                  >
                    Delete
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </fieldset>
  {/if}

  {#if error}
    <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
  {/if}
  {#if success}
    <p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
  {/if}
</section>
