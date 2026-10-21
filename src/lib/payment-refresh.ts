export type PaymentRefreshPhase = 'idle' | 'checking' | 'waiting' | 'retrying' | 'paused' | 'offline' | 'hidden';
export type PaymentRefreshState = { phase: PaymentRefreshPhase; lastCheckedAt: number | null };
export type PaymentRefreshController = {
  refresh: () => Promise<void>;
  refreshAfterChange: () => Promise<void>;
  resume: () => Promise<void>;
  setPending: (pending: boolean) => void;
  setEnvironment: (environment: { visible: boolean; online: boolean }) => void;
  stop: () => void;
};

/** Only refreshes server-owned payment state. It never changes payment or credit records. */
export function createPaymentRefresh<T>({
  load, onData, onError, onState, visible: initiallyVisible = true, online: initiallyOnline = true,
  intervalMs = 15_000, maxAutomaticChecks = 40, maxFailures = 3,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout,
}: {
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: (error: unknown) => void;
  onState: (state: PaymentRefreshState) => void;
  visible?: boolean; online?: boolean; intervalMs?: number; maxAutomaticChecks?: number; maxFailures?: number;
  now?: () => number; schedule?: typeof setTimeout; cancel?: typeof clearTimeout;
}): PaymentRefreshController {
  let visible = initiallyVisible; let online = initiallyOnline; let pending = false; let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: AbortController | null = null; let running: Promise<void> | null = null;
  let generation = 0; let failures = 0; let automaticChecks = 0; let lastCheckedAt: number | null = null;
  let lastAttemptAt = -Infinity; let resumeQueued = false;

  function clearTimer() { if (timer !== null) { cancel(timer); timer = null; } }
  function phase(): PaymentRefreshPhase {
    if (!online) return 'offline';
    if (!visible) return 'hidden';
    if (running && !active?.signal.aborted) return 'checking';
    if (!pending) return 'idle';
    if (failures >= maxFailures || automaticChecks >= maxAutomaticChecks) return 'paused';
    return failures ? 'retrying' : 'waiting';
  }
  function publish() { if (!stopped) onState({ phase: phase(), lastCheckedAt }); }
  function queue() {
    clearTimer();
    if (stopped || !visible || !online || !pending || running || failures >= maxFailures || automaticChecks >= maxAutomaticChecks) { publish(); return; }
    // A failed check backs off to 30s, then 60s, before pausing after the third failure.
    timer = schedule(() => { timer = null; void run('automatic'); }, Math.min(intervalMs * 2 ** failures, 60_000));
    publish();
  }
  function run(reason: 'automatic' | 'manual' | 'resume'): Promise<void> {
    if (stopped || !visible || !online) { publish(); return Promise.resolve(); }
    if (running) {
      if (active?.signal.aborted) resumeQueued = true;
      return running;
    }
    // Returning from a banking app often fires both visibilitychange and focus.
    if (reason === 'resume' && now() - lastAttemptAt < 1_000) return Promise.resolve();
    if (reason === 'automatic' && (!pending || failures >= maxFailures || automaticChecks >= maxAutomaticChecks)) { publish(); return Promise.resolve(); }
    if (reason !== 'automatic') { failures = 0; automaticChecks = 0; }
    else automaticChecks += 1;
    clearTimer(); lastAttemptAt = now();
    const controller = new AbortController(); active = controller;
    const requestGeneration = generation;
    running = Promise.resolve().then(() => load(controller.signal)).then(data => {
      if (stopped || controller.signal.aborted || requestGeneration !== generation) return;
      failures = 0; lastCheckedAt = now(); onData(data);
    }).catch(error => {
      if (stopped || controller.signal.aborted || requestGeneration !== generation) return;
      failures += 1; onError(error);
    }).finally(() => {
      running = null; active = null;
      if (stopped) return;
      if (resumeQueued && visible && online) { resumeQueued = false; lastAttemptAt = -Infinity; void run('resume'); }
      else queue();
    });
    publish();
    return running;
  }

  return {
    refresh: () => run('manual'),
    async refreshAfterChange() {
      if (stopped) return;
      // A read started before reporting a transfer must not restore the older payment status.
      generation += 1; clearTimer(); active?.abort(); resumeQueued = false;
      if (running) await running;
      await run('manual');
    },
    resume: () => run('resume'),
    setPending(next) {
      if (pending === next || stopped) return;
      pending = next;
      if (!pending) { failures = 0; automaticChecks = 0; }
      queue();
    },
    setEnvironment(next) {
      if (stopped || (visible === next.visible && online === next.online)) return;
      const wasAvailable = visible && online;
      visible = next.visible; online = next.online;
      if (!visible || !online) {
        clearTimer(); generation += 1; active?.abort(); resumeQueued = false; publish();
      } else if (!wasAvailable) {
        // Ignore any late result from the previous screen; wait for it to settle before a new read.
        if (running) { resumeQueued = true; publish(); }
        else { lastAttemptAt = -Infinity; void run('resume'); }
      }
    },
    stop() { stopped = true; generation += 1; clearTimer(); active?.abort(); resumeQueued = false; },
  };
}
