import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ command }) => ({
  base: '/', // Vercel deploys to root
  plugins: [glsl()],
  server: {
    host: true
  },
  optimizeDeps: {
    include: ['@dgreenheck/three-pinata', 'three']
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/node_modules/three/') || id.includes('\\node_modules\\three\\')) {
              return 'vendor-three';
            }
            if (id.includes('gsap')) {
              return 'vendor-gsap';
            }
            return 'vendor'; // Other deps
          }
        }
      }
    }
  }
}));
