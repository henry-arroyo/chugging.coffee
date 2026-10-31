import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { worldPlugin } from './scripts/world/vite-plugin.ts';
import { PRODUCTION_HEADERS } from './infra/lib/headers.ts';

// The simulation is served at the root of the domain (https://chugging.coffee/).
export default defineConfig({
  base: '/',
  plugins: [react(), worldPlugin(import.meta.dirname)],
  // `vite preview` serves the build with the production response headers (see test:prod).
  preview: { headers: PRODUCTION_HEADERS },
  build: {
    outDir: 'dist/time-machine',
    assetsDir: 'assets',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts', 'infra/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
