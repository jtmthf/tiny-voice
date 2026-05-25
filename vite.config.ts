import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import type { Plugin } from 'vite';

function securityHeaders(): Plugin {
  const isDev = process.env['NODE_ENV'] !== 'production';
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const headers: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
  const apply = (res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    next();
  };
  return {
    name: 'security-headers',
    configureServer: (s) => { s.middlewares.use((_req, res, next) => apply(res, next)); },
    configurePreviewServer: (s) => { s.middlewares.use((_req, res, next) => apply(res, next)); },
  };
}

export default defineConfig({
  ssr: {
    external: ['better-sqlite3', 'pdfkit'],
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/data/**'],
    },
  },
  plugins: [
    tsconfigPaths(),
    nitro(),
    tanstackStart({
      srcDirectory: './src',
      router: {
        entry: './app/router',
        routesDirectory: './app/routes',
        generatedRouteTree: './app/routeTree.gen.ts',
        quoteStyle: 'single',
        semicolons: true,
      },
    }),
    viteReact(),
    securityHeaders(),
  ],
});
