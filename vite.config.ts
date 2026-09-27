import { defineConfig, loadEnv, type Plugin, type PluginOption, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

function localApiPlugin(env: Record<string, string>): Plugin {
  const BASE = env.API_BASE_URL || process.env.API_BASE_URL || 'https://nawasara.ponorogo.go.id';
  const TOKEN = env.API_TOKEN || process.env.API_TOKEN;
  const ORIGIN = env.API_ORIGIN || process.env.API_ORIGIN || 'https://gasta.ponorogo.go.id';

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void
  ): Promise<void> => {
    const rawUrl = req.url || '';
    const url = new URL(rawUrl, 'http://localhost');
    let upstreamPath: string | null = null;

    if (url.pathname === '/api/cameras') {
      upstreamPath = '/api/v1/cctv/cameras';
    } else if (url.pathname === '/api/wifi') {
      upstreamPath = '/api/v1/wifi/points';
    } else if (url.pathname.startsWith('/api/stream/')) {
      const slug = url.pathname.replace('/api/stream/', '');
      if (slug) {
        upstreamPath = `/api/v1/cctv/cameras/${encodeURIComponent(slug)}/stream`;
      }
    }

    if (!upstreamPath) {
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    try {
      const fullUrl = `${BASE}${upstreamPath}${url.search}`;
      const headers: Record<string, string> = {
        Origin: ORIGIN,
        'User-Agent': 'sipedas-view-proxy/1.0',
        Accept: 'application/json',
      };
      if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

      const response = await fetch(fullUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const body = await response.text();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType.split(';')[0]);
      }
      res.statusCode = response.status;
      res.end(body);
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Upstream error: ${(err as Error).message}` }));
    }
  };

  return {
    name: 'local-api-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devProxy = env.DEV_API_PROXY || process.env.DEV_API_PROXY;

  const plugins: PluginOption[] = [react()];
  if (!devProxy) {
    plugins.push(localApiPlugin(env));
  }

  return {
    plugins,
    server: devProxy
      ? {
          proxy: {
            '/api': {
              target: devProxy,
              changeOrigin: true,
            },
          },
        }
      : {},
    preview: devProxy
      ? {
          proxy: {
            '/api': {
              target: devProxy,
              changeOrigin: true,
            },
          },
        }
      : {},
  };
});
