/** Stop waiting without cancelling the journal write itself. */
export function waitForReaderSave(flush: () => Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const stopped = () => new DOMException('Reply stopped before the reader started.', 'AbortError');
    if (signal.aborted) { reject(stopped()); return; }
    const abort = () => { cleanup(); reject(stopped()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(flush).then(() => {
      cleanup();
      if (signal.aborted) reject(stopped()); else resolve();
    }, error => { cleanup(); reject(error); });
  });
}
