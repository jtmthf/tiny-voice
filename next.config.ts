import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  serverExternalPackages: ['pdfkit', 'better-sqlite3'],
  experimental: {
    useCache: true,
  },
};

export default nextConfig;
