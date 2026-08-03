import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 无人机影像服务（独立服务，端口 8002）
      // 与 nginx.conf 一致：剥离 /api/drone 前缀后转发
      '/api/drone': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/drone/, ''),
      },
      // phenomics 后端 API（端口 8001）
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
