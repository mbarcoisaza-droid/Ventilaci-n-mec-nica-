import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // rutas relativas: funciona en GitHub Pages (subcarpeta), en local y como archivo
  base: './',
  // versión visible en la barra superior para confirmar que se usa la última compilación
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', copyPublicDir: mode !== 'single' },
  test: { globals: true, environment: 'node' },
}));
