import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // rutas relativas: funciona en GitHub Pages (subcarpeta), en local y como archivo
  base: './',
  // versión visible en la barra superior para confirmar que se usa la última compilación
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: mode === 'single' || mode === 'kaplan-single' ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'kaplan-single' ? 'dist-kaplan' : 'dist',
    copyPublicDir: mode !== 'single' && mode !== 'kaplan-single',
    // segunda aplicación: Plan Kaplan en /kaplan/
    rollupOptions:
      mode === 'single' ? undefined : mode === 'kaplan-single' ? { input: 'kaplan/index.html' } : { input: { main: 'index.html', kaplan: 'kaplan/index.html' } },
  },
  test: { globals: true, environment: 'node' },
}));
