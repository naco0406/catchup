import { defineConfig, devices } from '@playwright/test';

// 1단계 끝 기준(plan.md)을 기기 크기별로 시험해요: 아이패드 가로 · 아이폰 · 넓은 데스크톱
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5180', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11 landscape'], viewport: { width: 1194, height: 834 }, browserName: 'chromium' } },
    { name: 'iphone', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
