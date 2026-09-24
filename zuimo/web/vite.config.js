import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,                // stack trace đọc được trên production khi cần điều tra lỗi
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'hanzi-writer': ['hanzi-writer']   // thư viện nét chữ tách riêng: chỉ tải khi mở trang có tập viết
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3100' }   // chạy dev: API cục bộ cổng 3100
  }
});
