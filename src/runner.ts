import type { Report } from './core/types';
export function runComparison(
  original: string, revised: string,
  createWorker: () => Worker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
): Promise<Report> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = createWorker(); } catch { reject(new Error('Unable to start the local checker.')); return; }
    let settled = false;
    const finish = (error?: Error, result?: Report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('The check timed out. Shorten the input and try again.')), 15_000);
    worker.onmessage = event => {
      const data = event.data;
      if (data?.ok === true && data.report?.version === 1) finish(undefined, data.report);
      else finish(new Error(typeof data?.error === 'string' ? data.error : 'The local checker returned an invalid result.'));
    };
    worker.onerror = () => finish(new Error('The local checker stopped unexpectedly.'));
    try { worker.postMessage({ original, revised }); }
    catch { finish(new Error('Unable to send text to the local checker.')); }
  });
}
