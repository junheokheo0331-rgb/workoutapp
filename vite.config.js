import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vercel / 로컬 .env 의 VITE_* 를 클라이언트 번들에 주입
  loadEnv(mode, process.cwd(), '');
  return {
    server: { port: 8080, host: true },
    preview: { port: 8080, host: true },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false
    }
  };
});
