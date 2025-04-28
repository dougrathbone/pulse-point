import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src', // Set the project root to 'src' for Vite
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 3000, // Run frontend dev server on a different port than the backend
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:3001', // Your backend server address
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true, // Recommended when outDir is outside root
  },
}); 