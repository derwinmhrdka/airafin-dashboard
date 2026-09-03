<script lang="ts">
  import { page } from '$app/state';
  import PicBadge from '$lib/components/PicBadge.svelte';
  import { defaultPic, type Pic } from '$lib/pics';

  let { data }: { data: { googleEnabled: boolean; pics: string[] } } = $props();

  const pics = $derived(data.pics.length > 0 ? data.pics : ['Derwin', 'Anggita']);

  let password = $state('');
  let pic = $state<Pic>(defaultPic());
  let error = $state('');
  let loading = $state(false);
  let showPassword = $state(false);

  $effect(() => {
    if (!pics.includes(pic)) pic = pics[0] ?? defaultPic();
  });

  const errorMessages: Record<string, string> = {
    google_not_configured: 'Google sign-in is not configured.',
    invalid_state: 'Session expired — try again.',
    email_not_allowed: 'Account not allowed.',
    email_not_verified: 'Verify your email first.',
    google_failed: 'Sign-in failed.',
    access_denied: 'Cancelled.',
  };

  $effect(() => {
    const code = page.url.searchParams.get('error');
    if (code) {
      error = errorMessages[code] ?? 'Sign-in failed.';
    }
  });

  async function handlePasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = '';

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, pic }),
      });

      if (res.ok) {
        window.location.href = '/';
        return;
      }

      const body = await res.json().catch(() => ({}));
      error = body.error ?? 'Sign-in failed.';
    } catch {
      error = 'Sign-in failed.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in · Airafin</title>
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
</svelte:head>

<div class="login-shell">
  <div class="login-grain" aria-hidden="true"></div>

  <div class="login-stage">
    <div class="login-mark login-rise" style="--delay: 0ms">
      <span class="login-rule login-rule-draw" aria-hidden="true"></span>
      <h1 class="login-brand">Airafin</h1>
      <span class="login-rule login-rule-draw" style="animation-delay: 180ms" aria-hidden="true"></span>
    </div>

    {#if error}
      <p class="login-error login-rise" style="--delay: 120ms" role="alert">{error}</p>
    {/if}

    <div class="login-actions login-rise" style="--delay: 220ms">
      {#if data.googleEnabled}
        <a href="/auth/google" class="login-google">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.5 5.5-6.4 6.9l.1.1 6.3 5.3C37.3 38.3 44 33 44 24c0-1.3-.1-2.5-.4-3.5z"/>
          </svg>
          Continue with Google
        </a>

        <button
          type="button"
          class="login-key"
          class:login-key-open={showPassword}
          onclick={() => (showPassword = !showPassword)}
          aria-expanded={showPassword}
        >
          {showPassword ? 'Hide password' : 'Use password'}
        </button>
      {/if}
    </div>

    {#if !data.googleEnabled || showPassword}
      <form
        onsubmit={handlePasswordSubmit}
        class="login-form login-rise"
        style="--delay: {data.googleEnabled ? '80ms' : '220ms'}"
      >
        <div class="login-pics" role="group" aria-label="PIC">
          {#each pics as p}
            <button
              type="button"
              onclick={() => (pic = p)}
              class="login-pic"
              class:login-pic-active={pic === p}
              aria-label={p}
              aria-pressed={pic === p}
              title={p}
            >
              <span class="login-pic-scale">
                <PicBadge name={p} />
              </span>
            </button>
          {/each}
        </div>

        <div class="login-pass-row">
          <input
            type="password"
            bind:value={password}
            required
            autocomplete="current-password"
            placeholder="••••••••"
            aria-label="Password"
            class="login-pass-input"
          />
          <button
            type="submit"
            disabled={loading}
            class="login-submit"
            aria-label={loading ? 'Signing in' : 'Sign in'}
          >
            {#if loading}
              <span class="login-spin" aria-hidden="true"></span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            {/if}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .login-shell {
    position: relative;
    display: flex;
    min-height: 100dvh;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color-scheme: dark;
    color: #fafafa;
    background:
      radial-gradient(ellipse 70% 50% at 50% -8%, rgb(39 39 42 / 0.55), transparent 55%),
      #000;
    padding:
      max(2rem, env(safe-area-inset-top, 0px))
      1.25rem
      max(2rem, env(safe-area-inset-bottom, 0px));
  }

  .login-grain {
    pointer-events: none;
    position: absolute;
    inset: 0;
    opacity: 0.06;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 180px 180px;
  }

  .login-stage {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
    max-width: 17.5rem;
    flex-direction: column;
    align-items: center;
  }

  .login-mark {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .login-brand {
    margin: 0;
    color: #fafafa;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .login-rule {
    display: block;
    height: 1px;
    width: 100%;
    background: #27272a;
    transform-origin: center;
  }

  .login-error {
    margin: 1.25rem 0 0;
    text-align: center;
    font-size: 0.6875rem;
    color: #f87171;
  }

  .login-actions {
    margin-top: 2rem;
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .login-google {
    display: inline-flex;
    height: 2.75rem;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    border: 1px solid #3f3f46;
    background: #09090b;
    color: #fafafa;
    font-size: 0.8125rem;
    font-weight: 500;
    transition:
      border-color 200ms ease,
      background-color 200ms ease;
  }

  .login-google:hover {
    border-color: #71717a;
    background: #18181b;
  }

  .login-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #71717a;
    font-size: 0.6875rem;
    transition: color 200ms ease;
  }

  .login-key:hover {
    color: #d4d4d8;
  }

  .login-key-open {
    color: #fafafa;
  }

  .login-form {
    margin-top: 1.5rem;
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.875rem;
  }

  .login-pics {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }

  .login-pic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    padding: 0.25rem;
    transition:
      opacity 200ms ease,
      box-shadow 200ms ease;
    opacity: 0.4;
    box-shadow: 0 0 0 2px transparent;
  }

  .login-pic:hover {
    opacity: 0.75;
  }

  .login-pic-active {
    opacity: 1;
    box-shadow: 0 0 0 2px #fafafa;
  }

  .login-pic-scale {
    display: inline-flex;
    transform: scale(1.35);
  }

  .login-pass-row {
    display: flex;
    gap: 0.5rem;
  }

  .login-pass-input {
    min-width: 0;
    flex: 1;
    border: 1px solid #27272a;
    background: #09090b;
    color: #fafafa;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    letter-spacing: 0.12em;
    outline: none;
    transition: border-color 200ms ease;
  }

  .login-pass-input::placeholder {
    color: #52525b;
  }

  .login-pass-input:focus {
    border-color: #fafafa;
  }

  .login-submit {
    display: inline-flex;
    height: auto;
    width: 2.625rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border: 1px solid #fafafa;
    background: #fafafa;
    color: #000;
    transition: opacity 200ms ease;
  }

  .login-submit:disabled {
    opacity: 0.5;
  }

  .login-spin {
    display: block;
    height: 0.875rem;
    width: 0.875rem;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 9999px;
    animation: login-spin 0.7s linear infinite;
  }

  .login-rise {
    animation: login-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--delay, 0ms);
  }

  .login-rule-draw {
    animation: login-draw 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes login-rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes login-draw {
    from {
      transform: scaleX(0);
      opacity: 0.4;
    }
    to {
      transform: scaleX(1);
      opacity: 1;
    }
  }

  @keyframes login-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .login-rise,
    .login-rule-draw,
    .login-spin {
      animation: none;
    }
  }
</style>
