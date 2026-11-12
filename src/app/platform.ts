import type { ModelTransport } from '../model/ModelClient';
import { config } from './config';
export const isDesktop = '__TAURI_INTERNALS__' in window;
/**
 * Where the model answers. The desktop game may start its own on another port when some other
 * program already holds the usual one; startModel learns which.
 */
let endpoint = config.modelEndpoint;
export const transport: ModelTransport = {
  async health(signal) {
    if (isDesktop) {
      const { invoke } = await import('@tauri-apps/api/core');
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return invoke<boolean>('model_health', { endpoint });
    }
    const response = await fetch('/model/health', { signal, redirect: 'error' });
    return response.ok;
  },
  async stream(body, signal, onChunk) {
    if (isDesktop) {
      const { invoke, Channel } = await import('@tauri-apps/api/core');
      const id = crypto.randomUUID();
      const channel = new Channel<number[]>();
      let chunkError: unknown;
      channel.onmessage = (data) => {
        if (!signal.aborted && !chunkError) {
          try {
            onChunk(new Uint8Array(data));
          } catch (error) {
            chunkError = error;
            cancel();
          }
        }
      };
      const cancel = () => {
        void invoke('model_cancel', { id }).catch(() => undefined);
      };
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      signal.addEventListener('abort', cancel, { once: true });
      try {
        await invoke('model_stream', {
          endpoint,
          body,
          id,
          onChunk: channel,
        });
      } catch (error) {
        // A deadline or failed inference moves the preferred model to the CPU fallback.
        // Explicit player cancellation must never change the selected model, and neither may
        // a request refused only because another was still using the channel.
        const busy = String(error).includes('Channel busy');
        if (!busy && (!signal.aborted || signal.reason?.name === 'TimeoutError')) {
          void invoke('model_use_fallback').catch(() => undefined);
        }
        throw error;
      } finally {
        signal.removeEventListener('abort', cancel);
      }
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (chunkError) throw chunkError;
    } else {
      const response = await fetch('/model/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
        redirect: 'error',
      });
      if (!response.ok || !response.body) throw new Error('Channel unavailable');
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          onChunk(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
  },
};
/**
 * Asks the desktop shell to start the bundled model server so it loads while the terminal
 * boots. The browser build relies on a separately started server. `choice` is the model the
 * player picked in the configuration ('auto' follows the launcher).
 */
export async function startModel(choice: string): Promise<void> {
  if (!isDesktop || config.mock || choice === 'off') return;
  const { invoke } = await import('@tauri-apps/api/core');
  const started = await invoke<string | null>('model_start', {
    endpoint: config.modelEndpoint,
    model: config.modelId,
    choice,
  }).catch(() => null);
  if (started) endpoint = started;
}
/** The desktop model server: which models are installed, which runs, and whether it answers. */
export interface ServerState {
  installed: string[];
  active: string | null;
  ready: boolean;
  /** The game started it (not a separately started server). */
  owned: boolean;
}
export async function modelState(): Promise<ServerState | null> {
  if (!isDesktop) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ServerState>('model_state').catch(() => null);
}
/** Restarts the desktop model server with another model, or stops it for 'off'. */
export async function selectModel(choice: string): Promise<boolean> {
  if (!isDesktop || config.mock) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('model_select', {
    endpoint,
    model: config.modelId,
    choice,
  }).catch(() => false);
}
export async function readSave(): Promise<string | null> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('load_save');
  }
  return localStorage.getItem('signal91.save');
}
export async function writeSave(value: string): Promise<void> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_game', { data: value });
  } else localStorage.setItem('signal91.save', value);
}
