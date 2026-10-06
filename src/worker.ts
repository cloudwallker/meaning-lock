import { compareText } from './core/compare';

self.onmessage = (event: MessageEvent<{ original: string; revised: string }>) => {
  try {
    self.postMessage({ ok: true, report: compareText(event.data.original, event.data.revised) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Unable to check text.' });
  }
};
