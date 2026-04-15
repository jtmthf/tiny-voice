import type { NextConfig } from 'next';

// React's dev build uses eval() for Fast Refresh and source-map reconstruction.
// Production builds never use eval, so keep the stricter CSP there.
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  serverExternalPackages: ['pdfkit', 'better-sqlite3'],
  experimental: {
    useCache: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
