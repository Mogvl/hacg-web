import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 前端端口 8200；开发模式下 /api 代理到后端 8201
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 8200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8201',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8201',
        changeOrigin: true,
      },
    },
  },
});