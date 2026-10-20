<script lang="ts">
  import { page } from '$app/state';
  import { getSummary } from '$lib/api';
  import { SUMMARY_CHANGED_EVENT } from '$lib/notifications-events';
  import { peekOverviewPaint, rememberOverviewPaint } from '$lib/overview-paint';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview', icon: 'overview' },
    { href: '/detail', label: 'Detail', icon: 'detail' },
    { href: '/transfer', label: 'Transfer', icon: 'transfer' },
    { href: '/plan', label: 'Plan', icon: 'plan' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ] as const;

  /** Upper arc. Outer steps are tighter so wide pills keep an even gap. */
  const angles = [159, 127, 90, 53, 21];
  const radius = 166;

  const slots = angles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: Math.round(Math.cos(rad) * radius),
      y: Math.round(-Math.sin(rad) * radius),
    };
  });

  const period = $derived(periodFromUrl(page.url.searchParams));
  const currentIcon = $derived(tabs.find((tab) => tab.href === page.url.pathname)?.icon ?? 'overview');

  const RING_R = 26;
  const RING_C = 2 * Math.PI * RING_R;

  let spent = $state(0);
  let remaining = $state(0);
  let allocated = $state(0);
  let revision = $state(0);

  const ringBase = $derived(allocated > 0 ? allocated : spent);
  const spentLen = $derived(
    ringBase > 0 ? (Math.min(Math.max(spent, 0), ringBase) / ringBase) * RING_C : 0,
  );
  const remainLen = $derived(allocated > 0 && remaining > 0 ? (remaining / allocated) * RING_C : 0);
  const spentPct = $derived(allocated > 0 ? Math.round((spent / allocated) * 100) : 0);
  const pctGlyphs = $derived(String(spentPct).split(''));

  /** Bit order A B C D E F G. */
  const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
  const SEGMENT_MASK: Record<string, number> = {
    '0': 0b0111111,
    '1': 0b0000110,
    '2': 0b1011011,
    '3': 0b1001111,
    '4': 0b1100110,
    '5': 0b1101101,
    '6': 0b1111101,
    '7': 0b0000111,
    '8': 0b1111111,
    '9': 0b1101111,
    '-': 0b1000000,
  };

  function applySummary(summary: {
    totalSpent: number;
    totalSisa: number;
    totalBudgetAllocated: number;
  }) {
    spent = summary.totalSpent;
    remaining = summary.totalSisa;
    allocated = summary.totalBudgetAllocated;
  }

  $effect(() => {
    const onChange = () => {
      revision += 1;
    };
    window.addEventListener(SUMMARY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SUMMARY_CHANGED_EVENT, onChange);
  });

  $effect(() => {
    const activePeriod = period;
    const refresh = revision;
    const cached = refresh === 0 ? peekOverviewPaint(activePeriod) : null;
    if (cached) applySummary(cached);

    let cancelled = false;
    void getSummary(activePeriod)
      .then((summary) => {
        if (cancelled) return;
        rememberOverviewPaint(activePeriod, summary);
        applySummary(summary);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  });

  let open = $state(false);
  let prevPath = $state('');

  $effect(() => {
    const path = page.url.pathname;
    if (prevPath && prevPath !== path) open = false;
    prevPath = path;
  });

  $effect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') open = false;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<button
  type="button"
  class="scrim"
  class:open
  tabindex="-1"
  aria-label="Close navigation"
  aria-hidden={!open}
  onclick={() => (open = false)}
></button>

{#snippet navIcon(icon: (typeof tabs)[number]['icon'])}
  <svg viewBox="0 0 24 24" class="ico" aria-hidden="true">
    {#if icon === 'overview'}
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    {:else if icon === 'detail'}
      <circle cx="6" cy="7" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17" r="1.15" fill="currentColor" stroke="none" />
      <path d="M10 7h8M10 12h8M10 17h8" />
    {:else if icon === 'transfer'}
      <path d="M8 7H19M19 7l-3-3M19 7l-3 3" />
      <path d="M16 17H5M5 17l3-3M5 17l3 3" />
    {:else if icon === 'plan'}
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    {:else}
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .99 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.99z"
      />
    {/if}
  </svg>
{/snippet}

<div class="dock" class:open>
  {#each tabs as tab, i (tab.href)}
    <a
      href={withPeriodParam(tab.href, period)}
      data-sveltekit-preload-data="hover"
      data-sveltekit-preload-code="hover"
      class="chip"
      class:active={page.url.pathname === tab.href}
      style="--x: {slots[i].x}px; --y: {slots[i].y}px; --i: {i}"
      aria-hidden={!open}
      tabindex={open ? 0 : -1}
      onclick={() => (open = false)}
    >
      {@render navIcon(tab.icon)}
      {tab.label}
    </a>
  {/each}

  <button
    type="button"
    class="orb"
    class:open
    aria-expanded={open}
    aria-label={open
      ? `${spentPct} percent spent. Hide navigation`
      : `Show navigation`}
    title={open ? `${spentPct}% spent` : 'Show navigation'}
    onclick={() => (open = !open)}
  >
    <span class="donut" aria-hidden="true">
    <svg viewBox="0 0 72 72">
      <defs>
        <linearGradient id="float-remain" gradientUnits="userSpaceOnUse" x1="16" y1="8" x2="56" y2="64">
          <stop class="remain-hi" offset="0%" stop-color="#ffffff" />
          <stop class="remain-mid" offset="42%" stop-color="#f4f4f5" />
          <stop class="remain-lo" offset="100%" stop-color="#d4d4d8" />
        </linearGradient>
        <filter id="float-remain-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.85" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle class="hole" cx="36" cy="36" r="32" />
      <g transform="rotate(-90 36 36)">
        <circle class="track" cx="36" cy="36" r={RING_R} />
        {#if spentLen > 0}
          <circle
            class="arc spent-arc"
            cx="36"
            cy="36"
            r={RING_R}
            stroke-dasharray="{spentLen} {RING_C}"
          />
        {/if}
        {#if remainLen > 0}
          <circle
            class="arc remain-arc"
            cx="36"
            cy="36"
            r={RING_R}
            stroke-dasharray="{remainLen} {RING_C}"
            stroke-dashoffset={-spentLen}
          />
        {/if}
      </g>
    </svg>
    </span>
    <span class="face-icon" aria-hidden="true">
      {@render navIcon(currentIcon)}
    </span>
    <span class="readout" aria-hidden="true">
      {#each pctGlyphs as glyph}
        <svg class="seg" viewBox="0 0 20 36">
          {#each SEGMENTS as name, bit}
            <path
              class="seg-bar"
              class:on={((SEGMENT_MASK[glyph] ?? 0) & (1 << bit)) !== 0}
              d={name === 'a'
                ? 'M4 3 H16'
                : name === 'b'
                  ? 'M17 4 V16'
                  : name === 'c'
                    ? 'M17 20 V32'
                    : name === 'd'
                      ? 'M4 33 H16'
                      : name === 'e'
                        ? 'M3 20 V32'
                        : name === 'f'
                          ? 'M3 4 V16'
                          : 'M4 18 H16'}
            />
          {/each}
        </svg>
      {/each}
      <svg class="pct-mark" viewBox="0 0 12 16">
        <circle cx="3.2" cy="3.2" r="1.5" />
        <circle cx="8.8" cy="12.8" r="1.5" />
        <path d="M9.4 2.2 L2.6 13.8" />
      </svg>
    </span>
  </button>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    border: 0;
    background: rgba(0, 0, 0, 0.28);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.28s ease;
  }

  .scrim.open {
    opacity: 1;
    pointer-events: auto;
  }

  .dock {
    position: fixed;
    z-index: 40;
    left: 50%;
    bottom: calc(1.15rem + env(safe-area-inset-bottom, 0px));
    width: 84px;
    height: 84px;
    transform: translateX(-50%);
  }

  .chip {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    box-sizing: border-box;
    width: 5.45rem;
    height: 2.15rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(24, 24, 27, 0.14);
    background: rgba(255, 255, 255, 0.94);
    color: #3f3f46;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.03em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow:
      0 8px 18px rgba(0, 0, 0, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(0.35);
    transition:
      transform 0.42s cubic-bezier(0.34, 1.4, 0.64, 1),
      opacity 0.24s ease;
    transition-delay: calc((4 - var(--i)) * 32ms);
  }

  .dock.open .chip {
    opacity: 1;
    pointer-events: auto;
    transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1);
    transition-delay: calc(var(--i) * 46ms);
  }

  @media (max-width: 390px) {
    .dock.open .chip {
      transform: translate(calc(-50% + var(--x) * 0.86), calc(-50% + var(--y) * 0.86)) scale(0.9);
    }
  }

  .chip.active {
    background: #18181b;
    color: #fafafa;
    border-color: #18181b;
  }

  .ico {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .orb {
    position: relative;
    z-index: 2;
    width: 84px;
    height: 84px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .orb:active {
    transform: scale(0.96);
  }

  .donut {
    position: relative;
    z-index: 0;
    display: block;
    width: 84px;
    height: 84px;
    filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.28));
  }

  .donut svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .donut::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    background: linear-gradient(
      115deg,
      transparent 38%,
      rgba(255, 255, 255, 0.28) 50%,
      transparent 62%
    );
    background-size: 240% 100%;
    animation: idle-glint 7.5s ease-in-out infinite;
    -webkit-mask: radial-gradient(circle, transparent 56%, #000 64%, #000 86%, transparent 92%);
    mask: radial-gradient(circle, transparent 56%, #000 64%, #000 86%, transparent 92%);
  }

  .hole {
    fill: #ffffff;
  }

  .track,
  .arc {
    fill: none;
    stroke-width: 8;
  }

  .track {
    stroke: #e4e4e7;
  }

  .arc {
    transition:
      stroke-dasharray 0.45s ease,
      stroke-dashoffset 0.45s ease;
  }

  .spent-arc {
    stroke: #3f3f46;
  }

  .remain-arc {
    stroke: url(#float-remain);
    filter: url(#float-remain-glow);
  }

  .face-icon,
  .readout {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    line-height: 0;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition: opacity 0.35s ease;
  }

  .face-icon .ico,
  .readout svg {
    display: block;
    flex: none;
  }

  .face-icon .ico {
    width: 26px;
    height: 26px;
  }

  .orb.open .face-icon {
    opacity: 0;
  }

  .readout {
    gap: 1px;
    opacity: 0;
  }

  .orb.open .readout {
    opacity: 1;
  }

  .seg {
    width: 13px;
    height: 23px;
  }

  .seg-bar {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: square;
    opacity: 0.14;
  }

  .seg-bar.on {
    opacity: 1;
  }

  .pct-mark {
    width: 8px;
    height: 11px;
  }

  .pct-mark circle {
    fill: currentColor;
  }

  .pct-mark path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: square;
  }

  @keyframes idle-glint {
    0%,
    100% {
      background-position: 80% 0;
    }
    50% {
      background-position: 20% 0;
    }
  }

  @media (prefers-color-scheme: dark) {
    .scrim {
      background: rgba(0, 0, 0, 0.5);
    }

    .chip {
      background: rgba(24, 24, 27, 0.94);
      color: #e4e4e7;
      border-color: rgba(255, 255, 255, 0.14);
      box-shadow:
        0 10px 22px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .chip.active {
      background: #fafafa;
      color: #18181b;
      border-color: #fafafa;
    }

    .hole {
      fill: #09090b;
    }

    .track {
      stroke: #3f3f46;
    }

    .spent-arc {
      stroke: #18181b;
    }

    .remain-hi {
      stop-color: #ffffff;
    }

    .remain-mid {
      stop-color: #e4e4e7;
    }

    .remain-lo {
      stop-color: #a1a1aa;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .donut::after {
      animation: none;
    }

    .chip,
    .scrim,
    .donut,
    .face-icon,
    .readout {
      transition: none;
    }
  }
</style>
