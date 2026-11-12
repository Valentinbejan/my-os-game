import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const endpoint = new URL(env.VITE_MODEL_ENDPOINT || 'http://127.0.0.1:8080');
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.pathname !== '/' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('Loopback model endpoint required');
  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 1420,
      strictPort: true,
      proxy: {
        '/model': {
          target: endpoint.origin,
          changeOrigin: true,
          followRedirects: false,
          rewrite: (path) => path.replace(/^\/model/, ''),
          configure(proxy) {
            proxy.on('proxyReq', (proxyRequest, request, response) => {
              if (!['/health', '/v1/chat/completions'].includes(proxyRequest.path))
                proxyRequest.destroy();
              request.on('aborted', () => proxyRequest.destroy());
              response.on('close', () => {
                if (!response.writableEnded) proxyRequest.destroy();
              });
            });
          },
        },
      },
    },
    build: { target: 'es2022' },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  };
});
