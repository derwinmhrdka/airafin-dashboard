<script lang="ts">
  import { page } from '$app/state';
  import { getSummary } from '$lib/api';
  import { avatarPref, colorSeeds, setAvatarPref } from '$lib/avatar';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { withDeferredLoading } from '$lib/deferred-loading';
  import { formatCurrency } from '$lib/format';
  import { periodFromUrl } from '$lib/period';
  import type { DashboardSummary } from '$lib/types';

  const period = $derived(periodFromUrl(page.url.searchParams));
  const nickname = $derived(
    typeof page.data.session?.pic === 'string' ? page.data.session.pic.trim() : '',
  );
  const picture = $derived(
    typeof page.data.session?.picture === 'string' ? page.data.session.picture : '',
  );

  let summary = $state<DashboardSummary | null>(null);
  let loading = $state(false);
  let error = $state('');
  let editingAvatar = $state(false);

  const seeds = $derived(colorSeeds(nickname));
  const mine = $derived(
    summary?.picPocketTotals.find((row) => row.pic.toLowerCase() === nickname.toLowerCase()) ?? null,
  );
  const spentN = $derived(mine?.spent ?? 0);
  const planN = $derived(mine?.total ?? 0);
  const balanceN = $derived(mine?.sisa ?? 0);
  let tickSpent = $state(0);
  let tickPlan = $state(0);
  let tickBalance = $state(0);

  $effect(() => {
    const spent = spentN;
    const plan = planN;
    const balance = balanceN;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || (!summary && !error)) {
      tickSpent = spent;
      tickPlan = plan;
      tickBalance = balance;
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1000);
      const eased = 1 - (1 - t) ** 3;
      tickSpent = Math.round(spent * eased);
      tickPlan = Math.round(plan * eased);
      tickBalance = Math.round(balance * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    tickSpent = 0;
    tickPlan = 0;
    tickBalance = 0;
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  const meterMax = $derived(Math.max(Math.abs(spentN), Math.abs(planN), Math.abs(balanceN), 1));
  const overspent = $derived(planN > 0 && spentN > planN);
  const headline = $derived.by(() => {
    if (planN <= 0 && spentN <= 0) return 'The room is suspiciously quiet.';
    if (balanceN < 0) return 'Plot twist: the budget lost.';
    if (spentN === 0) return 'Nobody spent a thing. Suspicious.';
    if (planN > 0 && spentN / planN > 0.9) return 'This is getting spicy.';
    return 'The votes are in. The wallet survived.';
  });

  function barWidth(value: number): number {
    if (value === 0) return 0;
    return Math.max(8, Math.round((Math.abs(value) / meterMax) * 100));
  }

  function ofPlan(value: number): string {
    if (planN <= 0) return '—';
    const pct = Math.round((value / planN) * 100);
    return `${pct}%`;
  }

  function expenseJoke(): string {
    if (spentN <= 0) return 'Not a single rupiah escaped.';
    if (planN <= 0) return 'Spending with no map.';
    const ratio = spentN / planN;
    if (ratio < 0.25) return 'Still pretending to be frugal.';
    if (ratio < 0.6) return 'The wallet is sweating.';
    if (ratio < 0.9) return 'Dangerously close to the plan.';
    if (ratio <= 1) return 'One more coffee and it is over.';
    return 'The plan left the building.';
  }

  function balanceJoke(): string {
    if (balanceN < 0) return 'Overdraft energy.';
    if (balanceN === 0) return 'Perfectly broke.';
    if (planN > 0 && balanceN / planN < 0.2) return 'Coins rattling in there.';
    return 'Still standing. Barely, but standing.';
  }

  async function loadData(activePeriod: string) {
    error = '';
    await withDeferredLoading(
      (v) => {
        loading = v;
      },
      async () => {
        try {
          summary = await getSummary(activePeriod);
        } catch (e) {
          summary = null;
          error = e instanceof Error ? e.message : 'Failed to load profile';
        }
      },
    );
  }

  $effect(() => {
    void loadData(period);
  });

  function closeAvatar() {
    editingAvatar = false;
  }

  function chooseGoogle() {
    setAvatarPref(nickname, { mode: 'google', seed: $avatarPref.seed || seeds[0] });
    closeAvatar();
  }

  function chooseInitial() {
    setAvatarPref(nickname, { mode: 'initial', seed: $avatarPref.seed || seeds[0] });
    closeAvatar();
  }

  function chooseColor(seed: string) {
    setAvatarPref(nickname, { mode: 'color', seed });
    closeAvatar();
  }

  $effect(() => {
    if (!editingAvatar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAvatar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<section class="mx-auto w-full max-w-lg space-y-5">
  <p class="text-[11px] uppercase tracking-wider text-zinc-500">Me · {period}</p>

  <div class="flex items-center gap-4">
    <div class="relative shrink-0">
      <UserAvatar {nickname} {picture} size={88} />
      <button
        type="button"
        class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-black dark:text-zinc-200"
        aria-label="Edit avatar"
        aria-haspopup="dialog"
        aria-expanded={editingAvatar}
        onclick={() => (editingAvatar = true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
    <div class="min-w-0">
      <h2 class="text-2xl font-semibold tracking-tight">Hi, {nickname}!</h2>
    </div>
  </div>

  {#if loading && !summary}
    <div class="meter" aria-hidden="true">
      <div class="mb-4 h-3 w-24 animate-pulse rounded-full bg-white/10"></div>
      <div class="mb-2 h-6 w-3/4 animate-pulse rounded-full bg-white/10"></div>
      {#each Array(3) as _, i (i)}
        <div class="mt-4 h-12 animate-pulse rounded-full bg-white/8"></div>
      {/each}
    </div>
  {:else if error}
    <p class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  {:else}
    {#key `${period}:${spentN}:${planN}:${balanceN}`}
      <div class="meter" aria-label="Expenses, plan, and balance">
        {#if !overspent && planN > 0 && balanceN >= 0}
          <div class="meter-confetti" aria-hidden="true">
            {#each Array(7) as _, i (i)}
              <i></i>
            {/each}
          </div>
        {/if}
        <div class="meter-head">
          <p class="meter-live"><span class="meter-dot"></span> Live results</p>
          <p class="meter-headline">{headline}</p>
        </div>

        <div class="meter-row {overspent ? 'hot' : ''}" style="--delay: 0ms">
          <div class="meter-meta">
            <span class="meter-emoji" aria-hidden="true">{overspent ? '🫠' : '🛍️'}</span>
            <span class="meter-label">Expenses</span>
            <span class="meter-pct">{ofPlan(spentN)}</span>
          </div>
          <div class="meter-track" aria-hidden="true">
            <div class="meter-fill tone-spent" style="width: {barWidth(spentN)}%"></div>
          </div>
          <p class="meter-value">{formatCurrency(tickSpent)}</p>
          <p class="meter-joke">{expenseJoke()}</p>
        </div>

        <div class="meter-row" style="--delay: 120ms">
          <div class="meter-meta">
            <span class="meter-emoji" aria-hidden="true">📌</span>
            <span class="meter-label">Plan</span>
            <span class="meter-pct">{planN > 0 ? '100%' : '—'}</span>
          </div>
          <div class="meter-track" aria-hidden="true">
            <div class="meter-fill tone-plan" style="width: {barWidth(planN)}%"></div>
          </div>
          <p class="meter-value">{formatCurrency(tickPlan)}</p>
          <p class="meter-joke">{planN > 0 ? 'The official promise.' : 'No plan. Chaos mode.'}</p>
        </div>

        <div class="meter-row" style="--delay: 240ms">
          <div class="meter-meta">
            <span class="meter-emoji" aria-hidden="true">{balanceN < 0 ? '🚨' : balanceN === 0 ? '🫡' : '🪙'}</span>
            <span class="meter-label">Balance</span>
            <span class="meter-pct">{ofPlan(balanceN)}</span>
          </div>
          <div class="meter-track" aria-hidden="true">
            <div class="meter-fill {balanceN < 0 ? 'tone-down' : 'tone-up'}" style="width: {barWidth(balanceN)}%"></div>
          </div>
          <p class="meter-value">{formatCurrency(tickBalance)}</p>
          <p class="meter-joke">{balanceJoke()}</p>
        </div>
      </div>
    {/key}
  {/if}

  {#if editingAvatar}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
    onclick={closeAvatar}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-zinc-200 bg-white p-4 shadow-lg sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-950"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit avatar"
      tabindex="-1"
    >
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-xs font-medium uppercase tracking-wider text-zinc-500">Avatar</h3>
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        aria-label="Close"
        onclick={closeAvatar}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
    <div class="grid grid-cols-4 gap-2">
      <button
        type="button"
        class="flex aspect-square items-center justify-center overflow-hidden rounded-full border-2 {$avatarPref.mode === 'google'
          ? 'border-black dark:border-white'
          : 'border-transparent'}"
        aria-label="Google photo"
        aria-pressed={$avatarPref.mode === 'google'}
        onclick={chooseGoogle}
      >
        <UserAvatar {nickname} {picture} size={96} mode="google" />
      </button>
      <button
        type="button"
        class="flex aspect-square items-center justify-center overflow-hidden rounded-full border-2 {$avatarPref.mode === 'initial'
          ? 'border-black dark:border-white'
          : 'border-transparent'}"
        aria-label="Initial"
        aria-pressed={$avatarPref.mode === 'initial'}
        onclick={chooseInitial}
      >
        <UserAvatar {nickname} {picture} size={96} mode="initial" />
      </button>
      {#each seeds as seed (seed)}
        {@const selected = $avatarPref.mode === 'color' && $avatarPref.seed === seed}
        <button
          type="button"
          class="aspect-square overflow-hidden rounded-full border-2 {selected
            ? 'border-black dark:border-white'
            : 'border-transparent'}"
          aria-label="Color avatar"
          aria-pressed={selected}
          onclick={() => chooseColor(seed)}
        >
          <UserAvatar {nickname} {picture} size={96} mode="color" {seed} />
        </button>
      {/each}
    </div>
    </div>
  </div>
  {/if}
</section>

<style>
  .meter {
    position: relative;
    overflow: hidden;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      radial-gradient(120% 80% at 100% 0%, rgba(255, 59, 107, 0.28), transparent 46%),
      radial-gradient(90% 70% at 0% 100%, rgba(46, 229, 157, 0.18), transparent 42%),
      #12131c;
    padding: 1.05rem 1rem 0.85rem;
    color: white;
  }

  .meter-head {
    position: relative;
    z-index: 1;
    margin-bottom: 0.85rem;
  }

  .meter-live {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #ffd1dc;
  }

  .meter-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: #ff3b6b;
    box-shadow: 0 0 0 0 rgba(255, 59, 107, 0.7);
    animation: meter-pulse 1.4s ease-out infinite;
  }

  .meter-headline {
    margin-top: 0.35rem;
    font-size: 1.15rem;
    font-weight: 750;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }

  .meter-row {
    position: relative;
    z-index: 1;
    margin-top: 0.85rem;
  }

  .meter-row.hot {
    animation: meter-wiggle 0.42s ease-in-out 0.9s 2;
  }

  .meter-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .meter-emoji {
    display: inline-block;
    font-size: 1.05rem;
    animation: meter-pop 0.55s cubic-bezier(0.34, 1.45, 0.64, 1) both;
    animation-delay: var(--delay);
  }

  .meter-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .meter-pct {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .meter-track {
    margin-top: 0.35rem;
    height: 0.72rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .meter-fill {
    height: 100%;
    border-radius: 999px;
    transform-origin: left center;
    animation: meter-grow 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--delay);
  }

  .tone-spent {
    background: linear-gradient(90deg, #ff3b6b, #ff7a59);
  }

  .tone-plan {
    background: linear-gradient(90deg, #ffc53d, #ffe38a);
  }

  .tone-up {
    background: linear-gradient(90deg, #14c98a, #7dffc3);
  }

  .tone-down {
    background: linear-gradient(90deg, #ff5a36, #ffb020);
  }

  .meter-value {
    margin-top: 0.28rem;
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }

  .meter-joke {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.68);
  }

  .meter-confetti {
    pointer-events: none;
    position: absolute;
    inset: 0;
  }

  .meter-confetti i {
    position: absolute;
    top: 0.4rem;
    width: 0.4rem;
    height: 0.55rem;
    border-radius: 2px;
    opacity: 0;
    animation: meter-fall 1.15s ease-in both;
  }

  .meter-confetti i:nth-child(1) { left: 12%; background: #ff3b6b; animation-delay: 0.15s; }
  .meter-confetti i:nth-child(2) { left: 28%; background: #ffc53d; animation-delay: 0.28s; }
  .meter-confetti i:nth-child(3) { left: 46%; background: #7dffc3; animation-delay: 0.08s; }
  .meter-confetti i:nth-child(4) { left: 62%; background: #7aa2ff; animation-delay: 0.36s; }
  .meter-confetti i:nth-child(5) { left: 74%; background: #ff7a59; animation-delay: 0.2s; }
  .meter-confetti i:nth-child(6) { left: 86%; background: #ffc53d; animation-delay: 0.42s; }
  .meter-confetti i:nth-child(7) { left: 54%; background: #ff3b6b; width: 0.3rem; animation-delay: 0.5s; }

  @keyframes meter-grow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  @keyframes meter-pop {
    from { transform: scale(0.2) rotate(-18deg); opacity: 0; }
    to { transform: scale(1) rotate(0deg); opacity: 1; }
  }

  @keyframes meter-pulse {
    70% { box-shadow: 0 0 0 7px rgba(255, 59, 107, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 59, 107, 0); }
  }

  @keyframes meter-wiggle {
    0%, 100% { transform: translateX(0); }
    30% { transform: translateX(-4px); }
    70% { transform: translateX(4px); }
  }

  @keyframes meter-fall {
    0% { transform: translateY(-6px) rotate(0deg); opacity: 0; }
    18% { opacity: 1; }
    100% { transform: translateY(46px) rotate(160deg); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .meter-dot,
    .meter-emoji,
    .meter-fill,
    .meter-row.hot,
    .meter-confetti i {
      animation: none;
      opacity: 1;
    }
  }
</style>
