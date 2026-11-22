import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 소개 페이지 옆(/app/)에 올릴 때는 CATCHUP_BASE=/app/ 로 구워요
  base: process.env.CATCHUP_BASE ?? '/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
