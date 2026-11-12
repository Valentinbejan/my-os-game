export function validateEndpoint(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('The model endpoint must be http://127.0.0.1 with an optional port.');
  }
  return url.origin;
}
export const config = Object.freeze({
  modelEndpoint: validateEndpoint(import.meta.env.VITE_MODEL_ENDPOINT || 'http://127.0.0.1:8080'),
  modelId: import.meta.env.VITE_MODEL_ID || 'signal-91',
  mock: import.meta.env.VITE_MOCK_MODEL === 'true',
  developer: import.meta.env.DEV && import.meta.env.VITE_DEV_OVERLAY !== 'false',
  volume: Math.max(0, Math.min(1, Number(import.meta.env.VITE_AUDIO_VOLUME ?? 0.5) || 0)),
});
