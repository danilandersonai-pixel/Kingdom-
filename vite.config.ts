import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Игра не использует внешних файлов: графика и звук создаются кодом,
// поэтому сборка — это один самодостаточный index.html.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
