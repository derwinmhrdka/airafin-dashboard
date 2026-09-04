/** Avoid full-page skeleton flash when a warm in-memory API cache resolves quickly. */

export async function withDeferredLoading(
  setLoading: (v: boolean) => void,
  work: () => Promise<void>,
  delayMs = 120,
): Promise<void> {
  const timer = window.setTimeout(() => setLoading(true), delayMs);
  try {
    await work();
  } finally {
    window.clearTimeout(timer);
    setLoading(false);
  }
}
