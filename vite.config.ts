import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { worldPlugin } from './scripts/world/vite-plugin.ts';

// The simulation is served under /time-machine/ so it can share a domain with other routes.
export default defineConfig({
  base: '/time-machine/',
  plugins: [react(), worldPlugin(import.meta.dirname)],
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
