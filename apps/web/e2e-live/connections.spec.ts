import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fakeClipboard, noOverflow } from '../e2e/helpers';

const root = fileURLToPath(new URL('../../..', import.meta.url));
function local(...args: string[]): string {
  const r = spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, encoding: 'utf8', timeout: 90_000 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-600));
  return r.stdout.trim();
}

// 코드가 화면 기록에 남지 않게
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('연결에서 진짜 기기 코드를 받고 취소해요', async ({ page }) => {
  const email = `connect-${randomUUID()}@example.test`;
  local('ops', 'provision', email, 'ko');
  const code = local('ops', 'login-code', email);
  await fakeClipboard(page);
  await page.goto('/?lang=ko');
  await page.getByRole('textbox', { name: '이메일' }).fill(email);
  await page.getByRole('textbox', { name: '코드' }).fill(code);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/connections'; });

  const row = page.locator('[data-codex]');
  await row.getByRole('button', { name: '연결', exact: true }).click();
  await expect(row).toHaveAttribute('data-codex', 'waiting', { timeout: 45_000 });
  await expect(page.locator('.device-code')).toHaveText(/^[A-Z0-9]{4,}-[A-Z0-9]{4,}$/);
  expect(await page.getByRole('link', { name: 'ChatGPT 열기' }).getAttribute('href')).toMatch(/^https:\/\/auth\.openai\.com\//);
  await noOverflow(page);
  await row.getByRole('button', { name: '취소' }).click();
  await expect(row).toHaveAttribute('data-codex', 'none', { timeout: 30_000 });
  await expect(page.locator('.device-code')).toHaveCount(0);
});
