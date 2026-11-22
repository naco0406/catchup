// 지금 화면 찍기 — apps/web 에서: npx playwright test --config ../../docs/design/swipe-deck/harness/capture.config.mjs
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default {
  testDir: here, testMatch: 'capture.spec.ts', outputDir: `${tmpdir()}/catchup-swipe-capture`, workers: 2,
  webServer: { command: 'pnpm dev', cwd: fileURLToPath(new URL('../../../../apps/web', import.meta.url)), url: 'http://127.0.0.1:5180', reuseExistingServer: true },
};
