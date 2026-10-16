import { expect, test } from '@playwright/test';

test('PCの初期画面は横向き', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 324 });
  await page.goto('/');
  const stage = page.locator('#stage');
  await expect(stage).toHaveAttribute('data-orient', 'land');
  await expect(stage).not.toHaveAttribute('data-rotated', 'true');
});

test('スマートフォンの初期画面は縦向き', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 684 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
  }));
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-orient', 'port');
});

test('縦向きスマートフォンで回転ボタンを押すと正しい向きへ切り替わり、戻せる', async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 360, height: 684 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    });
    localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', sound: false, speed: 3, stream: 'none' }));
  });
  await page.goto('/');
  const stage = page.locator('#stage');
  await expect(stage).toHaveAttribute('data-orient', 'port');

  await page.locator('.press').click();
  await page.getByText('一人で遊ぶ', { exact: true }).click();
  await page.getByText('決定', { exact: true }).click();
  await page.locator('.it', { hasText: '召喚士' }).click();

  const rotate = page.getByRole('button', { name: '画面を回転' });
  await expect(rotate).toBeVisible();
  await rotate.click();
  await expect(stage).toHaveAttribute('data-orient', 'land');
  await expect.poll(() => stage.evaluate((el: HTMLElement) => el.style.transform)).toContain('rotate(90deg)');

  await rotate.click();
  await expect(stage).toHaveAttribute('data-orient', 'port');
  await expect(stage).not.toHaveAttribute('data-rotated', 'true');
});
