import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 소개 페이지 옆(/app/)에 올릴 때는 CATCHUP_BASE=/app/ 로 구워요
  base: process.env.CATCHUP_BASE ?? '/',
  plugins: [react()],
  // 실제 모드(pnpm dev:live)는 같은 주소로 로컬 서버를 불러요 — 쿠키가 같은 출처에 남게
  server: { proxy: { '/v1': { target: process.env.CATCHUP_API ?? 'http://127.0.0.1:4320' } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
