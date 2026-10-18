import { expect, test } from '@playwright/test';

test('admin character code UI stays hidden until five taps and unlocks only the server-selected character', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 684 });
  await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({
    name: '管理コードテスト',
    sound: false,
    stats: { games: 0, wins: 0, lastBossKills: 0, casinoStreak: 0, charWins: {}, meddles: 0 },
    achievements: {},
  })));
  await page.route('**/character-unlock', async (route) => {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'content-type': 'application/json',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const body = route.request().postDataJSON() as { code?: string };
    if (body?.code === 'FAKE-ADMIN-CODE') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ characterId: 7 }) });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ error: 'invalid code' }) });
  });

  await page.goto('/?orient=port');
  await page.locator('.press').click();
  await page.getByText('戦績・実績', { exact: true }).click();

  const bossKills = page.getByRole('button', { name: /ラスボス撃破/ });
  const dialog = page.getByRole('dialog', { name: 'キャラクター解放コード' });
  await expect(bossKills).toBeVisible();
  await expect(dialog).toHaveCount(0);
  for (let i = 0; i < 4; i += 1) {
    await bossKills.click();
    await expect(dialog).toHaveCount(0);
  }
  await bossKills.click();
  await expect(dialog).toBeVisible();

  const input = dialog.getByLabel('管理コード');
  const status = dialog.locator('.admin-code-status');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('maxlength', '96');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '閉じる' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.fill('WRONG-CODE');
  await dialog.getByRole('button', { name: '解放' }).click();
  await expect(status).toHaveText('コードが正しくありません。');
  let unlocked = await page.evaluate(() => JSON.parse(localStorage.getItem('beefhunter.v1') ?? '{}').achievements?.['admin-code:clown']);
  expect(unlocked).toBeUndefined();

  await input.fill('FAKE-ADMIN-CODE');
  await dialog.getByRole('button', { name: '解放' }).click();
  await expect(status).toHaveText('ヒーロを解放しました！');
  unlocked = await page.evaluate(() => JSON.parse(localStorage.getItem('beefhunter.v1') ?? '{}').achievements?.['admin-code:clown']);
  expect(unlocked).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(bossKills).toBeFocused();
});
