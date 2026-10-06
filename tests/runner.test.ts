import { describe, expect, it, vi } from 'vitest';
import { runComparison } from '../src/runner';

describe('worker boundary', () => {
  it('returns the worker result and terminates after success', async () => {
    const result = { version: 1, findings: [] };
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as any, onerror: null as any };
    const promise = runComparison('before', 'after', () => worker as unknown as Worker);
    expect(worker.postMessage).toHaveBeenCalledWith({ original: 'before', revised: 'after' });
    worker.onmessage({ data: { ok: true, report: result } });
    expect(await promise).toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('rejects engine errors and terminates the worker', async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as any, onerror: null as any };
    const promise = runComparison('before', 'after', () => worker as unknown as Worker);
    worker.onmessage({ data: { ok: false, error: 'Text too long' } });
    await expect(promise).rejects.toThrow('Text too long');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
