<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import '../app.css';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import PeriodSelector from '$lib/components/PeriodSelector.svelte';
  import ProfileMenu from '$lib/components/ProfileMenu.svelte';
  import ProjectPicker from '$lib/components/ProjectPicker.svelte';
  import InfoUpdatePopup from '$lib/components/InfoUpdatePopup.svelte';
  import TabNav from '$lib/components/TabNav.svelte';
  import { getPics, getProjects, selectSessionProject } from '$lib/api';
  import { currentPeriod, parsePeriodToDate, periodFromUrl } from '$lib/period';
  import { setPicNames } from '$lib/pics';

  let { children, data } = $props();

  const period = $derived(periodFromUrl(page.url.searchParams));
  const isAdminRoute = $derived(page.url.pathname.startsWith('/admin'));
  const needsProject = $derived(
    Boolean(data.session && data.session.projectId == null && !isAdminRoute),
  );

  let projectName = $state<string | null>(null);
  let projectPhoto = $state<string | null>(null);
  let switchOpen = $state(false);
  let picsLoaded = false;
  let loadedProjectId: number | null = null;

  $effect(() => {
    if (page.url.pathname === '/login') return;
    if (picsLoaded) return;
    picsLoaded = true;
    void getPics()
      .then((res) => setPicNames(res.pics.map((p) => p.name)))
      .catch(() => {
        picsLoaded = false;
      });
  });

  $effect(() => {
    const id = data.session?.projectId ?? null;
    const admin = data.isAdmin === true;
    if (!id) {
      projectName = null;
      projectPhoto = null;
      loadedProjectId = null;
      return;
    }
    if (id === loadedProjectId && projectName != null) return;
    loadedProjectId = id;
    void getProjects()
      .then(async (res) => {
        let p = res.projects.find((x) => x.id === id);
        if (!p && admin) {
          const all = await getProjects({ all: true }).catch(() => null);
          p = all?.projects.find((x) => x.id === id);
        }
        if (!p) {
          loadedProjectId = null;
          if (window.location.pathname.startsWith('/admin')) {
            projectName = null;
            projectPhoto = null;
            return;
          }
          try {
            await selectSessionProject(null);
          } catch {
            /* ignore */
          }
          window.location.href = '/';
          return;
        }
        projectName = p.name;
        projectPhoto = p.photo ?? null;
      })
      .catch(() => {
        loadedProjectId = null;
        projectName = null;
        projectPhoto = null;
      });
  });

  // Keep ?period= in the URL so all tabs share the same month/year.
  $effect(() => {
    if (page.url.pathname === '/login' || isAdminRoute) return;
    if (needsProject) return;

    const raw = page.url.searchParams.get('period')?.trim();
    if (raw && parsePeriodToDate(raw)) return;

    const url = new URL(page.url);
    url.searchParams.set('period', currentPeriod());
    const next = `${url.pathname}${url.search}`;
    const current = `${page.url.pathname}${page.url.search}`;
    if (next === current) return;

    goto(next, { replaceState: true, noScroll: true, keepFocus: true });
  });
</script>

<svelte:head>
  <title>{isAdminRoute ? 'Admin · Airafin' : 'Airafin Dashboard'}</title>
  <meta name="description" content="Personal financial dashboard" />
</svelte:head>

{#if page.url.pathname === '/login'}
  {@render children()}
{:else if isAdminRoute}
  <!-- Dedicated admin shell: header + profile + switch project (no app tabs) -->
  <div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-zinc-50 dark:bg-zinc-950 md:max-w-none">
    <header
      class="sticky top-0 z-20 border-b border-zinc-200 bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] dark:border-zinc-800 dark:bg-black md:px-8"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Airafin</p>
          <h1 class="text-sm font-semibold tracking-tight md:text-base">Admin</h1>
        </div>
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            onclick={() => (switchOpen = true)}
            class="flex max-w-[11rem] items-center gap-1.5 truncate border border-zinc-200 px-2 py-1.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200 sm:max-w-[16rem]"
            title="Switch project / back to dashboard"
          >
            {#if projectPhoto && data.session?.projectId}
              <img src={projectPhoto} alt="" class="h-4 w-4 shrink-0 object-cover" />
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="shrink-0">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            {/if}
            <span class="truncate">
              {#if data.session?.projectId && projectName}
                {projectName}
              {:else}
                Switch project
              {/if}
            </span>
          </button>
          {#if data.session}
            <ProfileMenu pic={data.session.pic} email={data.session.email} isAdmin={data.isAdmin} />
          {/if}
        </div>
      </div>
    </header>
    <main class="flex-1 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8">
      {@render children()}
    </main>
  </div>

  {#if switchOpen && data.session}
    <ProjectPicker
      selectedProjectId={data.session.projectId}
      isAdmin={data.isAdmin}
      required={false}
      onClose={() => (switchOpen = false)}
    />
  {/if}
{:else}
  <div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-white dark:bg-black md:max-w-none">
    <header
      class="sticky top-0 z-20 overflow-visible border-b border-zinc-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] dark:border-zinc-800 dark:bg-black md:px-8 md:pb-4 md:pt-[calc(1rem+env(safe-area-inset-top,0px))]"
    >
      <div class="md:flex md:items-start md:justify-between md:gap-8">
        <div class="mb-3 flex shrink-0 items-center justify-between gap-3 md:mb-0">
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="shrink-0 text-sm font-semibold tracking-tight md:text-base">Airafin</h1>
            {#if data.session?.projectId && projectName}
              <button
                type="button"
                onclick={() => (switchOpen = true)}
                class="flex max-w-[10rem] items-center gap-1.5 truncate rounded-sm border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 sm:max-w-[14rem]"
                title="Switch project"
              >
                {#if projectPhoto}
                  <img src={projectPhoto} alt="" class="h-4 w-4 shrink-0 object-cover" />
                {/if}
                <span class="truncate font-medium">{projectName}</span>
              </button>
            {/if}
          </div>
          {#if data.session}
            <div class="flex items-center gap-2.5">
              {#if data.session.projectId}
                <NotificationBell pic={data.session.pic} {period} />
              {/if}
              <ProfileMenu pic={data.session.pic} email={data.session.email} isAdmin={data.isAdmin} />
            </div>
          {/if}
        </div>
        {#if data.session?.projectId}
          <div class="min-w-0 md:max-w-sm md:flex-1 md:pt-0.5 lg:max-w-md">
            <PeriodSelector />
          </div>
        {/if}
      </div>
    </header>

    {#if data.session?.projectId}
      <TabNav />
      <main class="flex-1 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {@render children()}
      </main>
    {:else}
      <main class="flex-1"></main>
    {/if}
  </div>

  {#if needsProject && data.session}
    <ProjectPicker
      selectedProjectId={data.session.projectId}
      isAdmin={data.isAdmin}
      required={true}
    />
  {:else if switchOpen && data.session}
    <ProjectPicker
      selectedProjectId={data.session.projectId}
      isAdmin={data.isAdmin}
      required={false}
      onClose={() => (switchOpen = false)}
    />
  {/if}
{/if}

{#if data.session && page.url.pathname !== '/login'}
  <InfoUpdatePopup />
{/if}
