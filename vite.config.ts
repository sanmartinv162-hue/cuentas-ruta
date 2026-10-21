import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MI BILLETERA',
        short_name: 'MI BILLETERA',
        description: 'Control local de tus finanzas personales y de tu negocio.',
        theme_color: '#f4f6f2',
        background_color: '#f4f6f2',
        display: 'standalone',
        start_url: base,
        icons: [{ src: `${base}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react-vendor';
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) return 'charts-vendor';
          if (id.includes('/node_modules/dexie/')) return 'storage-vendor';
        },
      },
    },
  },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
});
