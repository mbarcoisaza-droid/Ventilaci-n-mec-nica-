import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const SINGLE: Record<string, { input: string; outDir: string }> = {
  'kaplan-single': { input: 'kaplan/index.html', outDir: 'dist-kaplan' },
  'coach-single': { input: 'coach/index.html', outDir: 'dist-coach' },
};

export default defineConfig(({ mode }) => {
  const single = SINGLE[mode];
  return {
    // rutas relativas: funciona en GitHub Pages (subcarpeta), en local y como archivo
    base: './',
    // versión visible en la barra superior para confirmar que se usa la última compilación
    define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
    plugins: mode === 'single' || single ? [react(), viteSingleFile()] : [react()],
    build: {
      outDir: mode === 'single' ? 'dist-single' : single ? single.outDir : 'dist',
      copyPublicDir: mode !== 'single' && !single,
      // aplicaciones adicionales: Plan Kaplan en /kaplan/ y Mi Coach en /coach/
      rollupOptions:
        mode === 'single'
          ? undefined
          : single
            ? { input: single.input }
            : { input: { main: 'index.html', kaplan: 'kaplan/index.html', coach: 'coach/index.html' } },
    },
    test: { globals: true, environment: 'node' },
  };
});
