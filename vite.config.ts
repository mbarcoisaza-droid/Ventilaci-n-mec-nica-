import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // rutas relativas: funciona en GitHub Pages (subcarpeta), en local y como archivo
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', copyPublicDir: mode !== 'single' },
  test: { globals: true, environment: 'node' },
}));
