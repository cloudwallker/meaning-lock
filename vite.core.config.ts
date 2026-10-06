import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: 'src/core/index.ts', formats: ['es'], fileName: () => 'core.js' },
  },
});
