<script lang="ts">
  import { page } from '$app/state';
  import { periodFromUrl, withPeriodParam } from '$lib/period';

  const tabs = [
    { href: '/', label: 'Overview' },
    { href: '/detail', label: 'Detail' },
    { href: '/transfer', label: 'Transfer' },
    { href: '/plan', label: 'Plan' },
    { href: '/settings', label: 'Settings' },
  ];

  /** Upper arc, left → right. 0° is right, 90° is up. */
  const angles = [166, 128, 90, 52, 14];
  const radius = 124;

  const slots = angles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: Math.round(Math.cos(rad) * radius),
      y: Math.round(-Math.sin(rad) * radius),
    };
  });

  const period = $derived(periodFromUrl(page.url.searchParams));

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
      {tab.label}
    </a>
  {/each}

  <button
    type="button"
    class="orb"
    aria-expanded={open}
    aria-label={open ? 'Hide navigation' : 'Show navigation'}
    onclick={() => (open = !open)}
  >
    <span class="sphere" aria-hidden="true">
      <span class="band band-lat"></span>
      <span class="band band-mer"></span>
      <span class="shade"></span>
      <span class="glint"></span>
      <span class="glint glint-sm"></span>
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
    width: 72px;
    height: 72px;
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
    min-width: 4.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(24, 24, 27, 0.14);
    background: rgba(255, 255, 255, 0.94);
    color: #3f3f46;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
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

  @media (max-width: 380px) {
    .dock.open .chip {
      transform: translate(calc(-50% + var(--x) * 0.82), calc(-50% + var(--y) * 0.82)) scale(0.92);
    }
  }

  .chip.active {
    background: #18181b;
    color: #fafafa;
    border-color: #18181b;
  }

  .orb {
    position: relative;
    z-index: 2;
    width: 72px;
    height: 72px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    animation: bob 3.8s ease-in-out infinite;
  }

  .dock.open .orb {
    animation: none;
  }

  .orb:active .sphere {
    transform: scale(0.94);
  }

  .sphere {
    display: block;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    position: relative;
    background:
      radial-gradient(circle at 32% 28%, #ffffff 0%, #f4f4f5 12%, transparent 34%),
      radial-gradient(circle at 68% 78%, #27272a 0%, transparent 46%),
      radial-gradient(circle at 40% 38%, #fafafa 0%, #d4d4d8 28%, #71717a 58%, #27272a 82%, #09090b 100%);
    box-shadow:
      inset -12px -16px 18px rgba(0, 0, 0, 0.38),
      inset 7px 8px 12px rgba(255, 255, 255, 0.55),
      0 12px 22px rgba(0, 0, 0, 0.28),
      0 2px 0 rgba(255, 255, 255, 0.35);
    transition: transform 0.18s ease;
  }

  .band {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }

  .band-lat {
    left: -18%;
    right: -18%;
    top: 30%;
    height: 42%;
    border: 1.5px solid rgba(255, 255, 255, 0.55);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
    transform: rotateX(58deg);
  }

  .band-mer {
    top: -12%;
    bottom: -12%;
    left: 30%;
    width: 40%;
    border: 1.5px solid rgba(255, 255, 255, 0.4);
    transform: rotate(18deg);
  }

  .shade {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(125deg, transparent 42%, rgba(0, 0, 0, 0.28) 78%);
    pointer-events: none;
  }

  .glint {
    position: absolute;
    top: 14%;
    left: 18%;
    width: 34%;
    height: 18%;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    filter: blur(0.4px);
    transform: rotate(-32deg);
    pointer-events: none;
  }

  .glint-sm {
    top: 28%;
    left: 22%;
    width: 12%;
    height: 8%;
    opacity: 0.7;
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
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

    .sphere {
      background:
        radial-gradient(circle at 32% 26%, #f4f4f5 0%, #a1a1aa 10%, transparent 32%),
        radial-gradient(circle at 72% 80%, #000 0%, transparent 48%),
        radial-gradient(circle at 38% 36%, #d4d4d8 0%, #52525b 36%, #18181b 68%, #000 100%);
      box-shadow:
        inset -14px -18px 20px rgba(0, 0, 0, 0.65),
        inset 6px 7px 10px rgba(255, 255, 255, 0.22),
        0 14px 26px rgba(0, 0, 0, 0.55);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb {
      animation: none;
    }

    .chip,
    .scrim,
    .sphere {
      transition: none;
    }
  }
</style>
