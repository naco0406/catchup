import { defineConfig } from '@playwright/test';

// 소개 페이지 시험. 개발 서버가 빌드와 같은 방식으로 HTML을 구워요(vite.config.ts 의 prerender).
// 'Try it' 안의 앱은 apps/web 의 시험이 봐요. 여기서는 바깥 페이지만 봐요.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5183' },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5183', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
