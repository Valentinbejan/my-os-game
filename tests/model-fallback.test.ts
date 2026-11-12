import { afterEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: bridge.invoke,
  Channel: class {
    onmessage?: (chunk: number[]) => void;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  bridge.invoke.mockReset();
});

describe('desktop model fallback', () => {
  async function failRequest(reason?: DOMException) {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const controller = new AbortController();
    bridge.invoke.mockImplementation(async (command: string) => {
      if (command === 'model_stream') {
        if (reason) controller.abort(reason);
        throw new Error('Model stopped');
      }
    });
    const { transport } = await import('../src/app/platform');
    await expect(transport.stream('{}', controller.signal, () => {})).rejects.toThrow();
    await Promise.resolve();
    return bridge.invoke.mock.calls.map(([command]) => command);
  }

  it('requests the small model after an inference failure', async () => {
    expect(await failRequest()).toContain('model_use_fallback');
  });

  it('requests the small model when the response deadline expires', async () => {
    expect(await failRequest(new DOMException('Too slow', 'TimeoutError'))).toContain(
      'model_use_fallback',
    );
  });

  it('keeps Bonsai selected when the player cancels', async () => {
    const calls = await failRequest(new DOMException('Cancelled', 'AbortError'));
    expect(calls).toContain('model_cancel');
    expect(calls).not.toContain('model_use_fallback');
  });
});
