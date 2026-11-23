import { defineConfig, devices } from '@playwright/test';

// 2단계 끝 기준을 화면에서: 실제 서버 · 실제 DB. 먼저 pnpm backend:up
const front = process.env.CATCHUP_WEB;

export default defineConfig({
  testDir: 'e2e-live',
  workers: 3,
  timeout: 90_000,
  reporter: [['list']],
  // CATCHUP_WEB: 이미 떠 있는 주소로(EC2 구성을 로컬에서 돌려 볼 때의 https://localhost:8443, 또는 진짜 서버). 스스로 만든 인증서는 localhost 에서만 봐줘요
  use: { baseURL: front ?? 'http://127.0.0.1:5181', ignoreHTTPSErrors: Boolean(front?.includes('//localhost')), trace: 'retain-on-failure' },
  webServer: front ? undefined : { command: 'pnpm dev:live', url: 'http://127.0.0.1:5181', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11 landscape'], viewport: { width: 1194, height: 834 }, browserName: 'chromium' } },
    { name: 'iphone', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
