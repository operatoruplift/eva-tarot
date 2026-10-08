import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { buildReadingContext, finishLocalAnswer, LOCAL_CONTEXT_WINDOW, localOutputTokenLimit, type ContextInput } from './reading-context.ts';
import { acquireLocalReaderLease, LOCAL_AI_GPU_ERROR, localReaderFailureMessage, prepareLocalReaderStorage } from './local-ai-safety.ts';

export const LOCAL_AI_MODELS = [
  { key: 'detailed', id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Detailed', downloadMB: 984 },
  { key: 'light', id: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Light', downloadMB: 360 },
] as const;
export type LocalAIModelKey = typeof LOCAL_AI_MODELS[number]['key'];
export type LocalAIModel = typeof LOCAL_AI_MODELS[number];
export const LOCAL_AI_MODEL_PREFERENCE_KEY = 'evatarot-local-model-v1';

function readModelPreference(): LocalAIModelKey {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(LOCAL_AI_MODEL_PREFERENCE_KEY);
    return value === 'detailed' ? 'detailed' : 'light';
  } catch { return 'light'; }
}
const initialModel = LOCAL_AI_MODELS.find(model => model.key === readModelPreference()) ?? LOCAL_AI_MODELS[0];
// Keep the original exports as live bindings for existing integrations.
export let LOCAL_AI_MODEL: string = initialModel.id;
export let LOCAL_AI_DOWNLOAD_MB: number = initialModel.downloadMB;
export type LocalAIState = Readonly<{
  status: 'idle' | 'checking' | 'unsupported' | 'loading' | 'ready' | 'generating' | 'error';
  progress: number;
  detail: string;
  model: LocalAIModelKey;
  cached: boolean | null;
  removing?: boolean;
  selectionWarning?: string;
}>;
export type LocalReadingInput = ContextInput & {
  /** Receives the complete answer so far, not a token delta. */
  onToken?: (text: string) => void;
  signal?: AbortSignal;
};

let state: LocalAIState = { status: 'idle', progress: 0, detail: 'Enable local AI to chat privately on this device.', model: initialModel.key, cached: null };
const listeners = new Set<() => void>();
let worker: Worker | undefined;
let engine: WebWorkerMLCEngine | undefined;
let loading: Promise<void> | undefined;
let removing = false;
let active: AbortController | undefined;
let workerFailure: Error | undefined;
let cacheCheckVersion = 0;
let lifecycleVersion = 0;
let releaseReaderLease: (() => void) | undefined;
const getWorkerFailure = (): Error | undefined => workerFailure;

export function getLocalAIState(): LocalAIState { return state; }
export function getSelectedLocalAIModel(): LocalAIModel { return LOCAL_AI_MODELS.find(model => model.key === state.model) ?? LOCAL_AI_MODELS[0]; }
export function subscribeLocalAI(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(patch: Partial<LocalAIState>): void {
  state = Object.freeze({ ...state, ...patch });
  for (const listener of listeners) listener();
}
function abortError(): DOMException { return new DOMException('Local AI was stopped.', 'AbortError'); }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { void promise.catch(() => {}); reject(abortError()); return; }
    const onAbort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
function releaseWorker(): void {
  if (worker) { worker.onerror = null; worker.onmessage = null; worker.terminate(); }
  worker = undefined;
  engine = undefined;
  releaseReaderLease?.();
  releaseReaderLease = undefined;
}

/** Release even an idle, loaded worker when leaving the page or replacing code. */
export function disposeLocalAI(): void {
  lifecycleVersion++;
  cacheCheckVersion++;
  active?.abort();
  releaseWorker();
  update({ status: 'idle', progress: 0, detail: 'Setup stopped. You can try again when you are ready.' });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', disposeLocalAI);
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', disposeLocalAI);
  disposeLocalAI();
});

/** Changing the selection never downloads or deletes either model. */
export function setLocalAIModel(key: LocalAIModelKey): void {
  if (active || loading || removing || state.status === 'checking' || state.status === 'generating') {
    throw new Error('Finish or stop the current reader before changing it.');
  }
  const model = LOCAL_AI_MODELS.find(candidate => candidate.key === key);
  if (!model) throw new Error('Choose the Detailed or Light reader.');
  if (state.model === key) return;
  releaseWorker();
  cacheCheckVersion++;
  LOCAL_AI_MODEL = model.id;
  LOCAL_AI_DOWNLOAD_MB = model.downloadMB;
  let selectionWarning: string | undefined;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_AI_MODEL_PREFERENCE_KEY, key);
  } catch { selectionWarning = 'Your reader choice could not be saved. It will apply until you close this page.'; }
  update({ status: 'idle', progress: 0, model: key, cached: null, selectionWarning, detail: 'Your reader is selected. Load it when you are ready.' });
}

/** Reads the runtime's cache only; no model weights or chat data are fetched. */
export async function refreshLocalAIModelCache(): Promise<boolean | null> {
  const version = ++cacheCheckVersion;
  const model = getSelectedLocalAIModel();
  let cached: boolean | null = null;
  try {
    const runtime = await import('@mlc-ai/web-llm');
    cached = await runtime.hasModelInCache(model.id);
  } catch { /* Private browsing may deny cache access. Loading can still be attempted. */ }
  if (version === cacheCheckVersion && state.model === model.key && cached !== null) update({ cached });
  return cached;
}
function handleWorkerFailure(event?: ErrorEvent): void {
  workerFailure = new Error(localReaderFailureMessage(event?.error ?? event?.message, LOCAL_AI_GPU_ERROR));
  active?.abort();
  releaseWorker();
  update({ status: 'error', progress: 0, detail: workerFailure.message });
}

/** Capability detection only. It never downloads model files. */
export async function checkLocalAISupport(): Promise<boolean> {
  if (engine && (state.status === 'ready' || state.status === 'generating')) return true;
  const version = lifecycleVersion;
  if (state.status !== 'loading') update({ status: 'checking', detail: 'Checking this device for local AI…' });
  type Adapter = { features: { has: (feature: string) => boolean } };
  const gpu = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<Adapter | null> };
  }).gpu;
  let adapter: Adapter | null = null;
  try { adapter = gpu ? await gpu.requestAdapter() : null; } catch { /* A browser can expose WebGPU but deny an adapter. */ }
  if (version !== lifecycleVersion) return false;
  if (!adapter || !adapter.features.has('shader-f16')) {
    update({ status: 'unsupported', progress: 0, detail: 'This browser cannot run local AI. Try a recent browser on a device with WebGPU support. Your saved readings still work.' });
    return false;
  }
  if (state.status === 'checking') update({ status: 'idle', detail: 'This device supports local AI. Download the model to begin.' });
  return true;
}

/** Call only after the user selects the download action. */
export function enableLocalAI(): Promise<void> {
  if (removing) return Promise.reject(new Error('Wait until the downloaded model has been removed.'));
  if (engine && (state.status === 'ready' || state.status === 'generating')) return Promise.resolve();
  if (loading) return loading;
  const controller = new AbortController();
  const model = getSelectedLocalAIModel();
  active = controller;
  workerFailure = undefined;
  loading = (async () => {
    try {
      const supported = await abortable(checkLocalAISupport(), controller.signal);
      if (!supported) throw new Error(state.detail);
      update({ status: 'loading', progress: 0, detail: 'Downloading local AI. The first setup may take a few minutes.' });
      const runtime = await abortable(import('@mlc-ai/web-llm'), controller.signal);
      if (controller.signal.aborted) throw abortError();
      releaseWorker();
      releaseReaderLease = await acquireLocalReaderLease(controller.signal, typeof navigator === 'undefined' ? undefined : navigator.locks);
      let cached: boolean | null = null;
      try { cached = await abortable(runtime.hasModelInCache(model.id), controller.signal); } catch { /* Cache access may be unavailable. */ }
      if (controller.signal.aborted) throw abortError();
      update({ cached });
      await abortable(prepareLocalReaderStorage(model.downloadMB, cached, typeof navigator === 'undefined' ? undefined : navigator.storage), controller.signal);
      if (controller.signal.aborted) throw abortError();
      worker = new Worker(new URL('./local-ai-worker.ts', import.meta.url), { type: 'module' });
      worker.onerror = handleWorkerFailure;
      engine = new runtime.WebWorkerMLCEngine(worker, {
        logLevel: 'ERROR',
        initProgressCallback: report => {
          if (!controller.signal.aborted) update({ progress: Math.max(0, Math.min(1, report.progress)), detail: 'Preparing local AI on this device…' });
        },
      });
      await abortable(engine.reload(model.id, { context_window_size: LOCAL_CONTEXT_WINDOW }), controller.signal);
      cacheCheckVersion++;
      update({ status: 'ready', progress: 1, cached: true, detail: 'Local AI is ready. Your messages stay on this device.' });
      void refreshLocalAIModelCache();
    } catch (error) {
      releaseWorker();
      if (controller.signal.aborted && !workerFailure) {
        update({ status: 'idle', progress: 0, detail: 'Setup stopped. You can try again when you are ready.' });
        throw abortError();
      }
      const failure = workerFailure ?? error;
      if (state.status !== 'unsupported') update({ status: 'error', progress: 0, detail: localReaderFailureMessage(failure, 'Local AI could not be loaded. Check your connection and available storage, then try again.') });
      throw new Error(state.detail, { cause: failure });
    } finally {
      if (active === controller) active = undefined;
      loading = undefined;
    }
  })();
  return loading;
}

export function cancelLocalAI(): void {
  if (!active) return;
  engine?.interruptGenerate();
  active.abort();
  // Termination also stops long GPU prefill/download operations that cannot
  // immediately observe interruptGenerate. Cached weights remain available.
  releaseWorker();
}

function visibleAnswer(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim();
}

export async function generateLocalReading(input: LocalReadingInput): Promise<string> {
  if (state.status === 'generating') throw new Error('Local AI is finishing another reply. Stop it or wait before sending another message.');
  if (input.signal?.aborted) throw abortError();
  const currentEngine = engine;
  if (!currentEngine || state.status !== 'ready') throw new Error('Enable local AI before sending your question.');
  const messages = buildReadingContext(input);
  const controller = new AbortController();
  active = controller;
  workerFailure = undefined;
  const onAbort = () => { if (active === controller) cancelLocalAI(); };
  input.signal?.addEventListener('abort', onAbort, { once: true });
  // Recover from a worker crash during inference rather than leaving a spinner.
  if (worker) worker.onerror = handleWorkerFailure;
  update({ status: 'generating', detail: 'Eva is considering your question…' });
  let raw = '';
  let finishReason: string | null | undefined;
  try {
    const stream = await abortable(currentEngine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: localOutputTokenLimit(input),
      temperature: 0.7,
      top_p: 0.8,
      repetition_penalty: 1.08,
      extra_body: { enable_thinking: false },
    }), controller.signal);
    const iterator = stream[Symbol.asyncIterator]();
    while (!controller.signal.aborted) {
      const part = await abortable(iterator.next(), controller.signal);
      if (part.done) break;
      finishReason = part.value.choices[0]?.finish_reason ?? finishReason;
      raw += part.value.choices[0]?.delta.content ?? '';
      const text = visibleAnswer(raw);
      if (text) input.onToken?.(text);
    }
    const result = finishLocalAnswer(visibleAnswer(raw), finishReason, input.language);
    if (!result) throw new Error('Local AI did not return a reply. Try a shorter question or reload the model.');
    input.onToken?.(result);
    return result;
  } catch (error) {
    const failure = getWorkerFailure();
    if (failure) {
      update({ status: 'error', progress: 0, detail: failure.message });
      throw failure;
    }
    if (controller.signal.aborted) {
      const partial = visibleAnswer(raw);
      if (partial) return partial;
      throw abortError();
    }
    // An engine error can leave its KV cache or device unusable. Require an
    // explicit reload instead of presenting the broken engine as ready.
    releaseWorker();
    update({ status: 'error', progress: 0, detail: localReaderFailureMessage(error, 'Local AI could not finish. Reload the model and try again.') });
    throw new Error(state.detail, { cause: error });
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
    if (active === controller) active = undefined;
    if (controller.signal.aborted && !workerFailure) update({ status: 'idle', progress: 0, detail: 'Reply stopped. Reload the cached model to continue.' });
    else if (getLocalAIState().status === 'generating') update({ status: 'ready', progress: 1, detail: 'Local AI is ready. Your messages stay on this device.' });
  }
}

/** Remove only model assets, never conversations or profile data. */
export async function removeLocalAIModel(): Promise<void> {
  if (state.status === 'generating' || state.status === 'checking' || loading || removing) throw new Error('Stop local AI before removing its downloaded model.');
  removing = true;
  const model = getSelectedLocalAIModel();
  cacheCheckVersion++;
  releaseWorker();
  update({ status: 'checking', removing: true, detail: 'Removing the downloaded AI model…' });
  try {
    const runtime = await import('@mlc-ai/web-llm');
    await runtime.deleteModelAllInfoInCache(model.id);
    cacheCheckVersion++;
    update({ status: 'idle', progress: 0, cached: false, detail: 'This downloaded reader was removed. Your conversations and any other downloaded reader are still saved.' });
  } catch {
    update({ status: 'error', progress: 0, detail: 'The downloaded model could not be removed. Please try again.' });
    throw new Error(state.detail);
  } finally { removing = false; update({ removing: false }); }
}
