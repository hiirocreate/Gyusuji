import { expect, test } from '@playwright/test';

test('オンライン：ルーム作成→CPU追加→開始→進行、別端末がコードで入室', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(String(e)));
  await a.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'ホスト', speed: 3, sound: false, serverUrl: 'ws://localhost:2567' })));
  await a.goto('/');
  await a.getByText('オンライン対戦').click();
  await a.getByText('ルーム作成（コード）').click();
  await expect(a.getByText(/ルームコード：/)).toBeVisible();
  const code = (await a.getByText(/ルームコード：/).textContent())!.replace('ルームコード：', '').trim();

  // 2人目がコードで入室
  const ctx2 = await browser.newContext();
  const b = await ctx2.newPage();
  await b.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'ゲスト', speed: 3, sound: false, serverUrl: 'ws://localhost:2567' })));
  await b.goto('/');
  await b.getByText('オンライン対戦').click();
  await b.getByPlaceholder('ルームコード').fill(code);
  await b.getByText('コードで入室').click();
  await expect(a.getByText('ゲスト').first()).toBeVisible();

  await a.getByRole('button', { name: 'CPU追加' }).first().click();
  await a.getByText('開始（準備OK）').click();
  await b.getByText('開始（準備OK）').click();

  await expect(a.locator('#status')).toBeVisible({ timeout: 10000 });
  await expect(b.locator('#status')).toBeVisible();
  await a.screenshot({ path: 'e2e-out/online.png' });
  for (let i = 0; i < 25; i++) {
    for (const p of [a, b]) {
      const btn = p.locator('.dialog button.primary:not([disabled])').first();
      const opt = p.locator('.dialog .opts button:not([disabled])').last();
      if (await btn.isVisible()) await btn.click().catch(() => {});
      else if (await opt.isVisible()) await opt.click().catch(() => {});
    }
    await a.waitForTimeout(600);
  }
  await b.screenshot({ path: 'e2e-out/online_b.png' });
  const txt = await a.locator('#round').textContent();
  expect(txt).toMatch(/ターン [2-9]|ターン \d\d/);
  expect(errors).toEqual([]);
});
