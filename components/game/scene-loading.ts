export const BATTLEFIELD_LOAD_TIMEOUT_MS = 20_000;

/** A failed download or driver preparation must not strand the start menu. */
export function awaitBattlefield(prepare: Promise<unknown>, signal: AbortSignal, timeoutMs = BATTLEFIELD_LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (ok: boolean, error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (ok) resolve(); else reject(error);
    };
    const abort = () => finish(false, signal.reason ?? new Error('Battlefield loading cancelled.'));
    const timer = setTimeout(() => finish(false, new Error('Loading is taking too long. Try lighter graphics or retry.')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    prepare.then(() => finish(true), error => finish(false, error));
  });
}
