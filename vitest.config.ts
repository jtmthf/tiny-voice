import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.{test,property.test}.ts'],
    globals: false,
    environment: 'node',
    testTimeout: 5000,
    typecheck: {
      enabled: false,
    },
  },
});
