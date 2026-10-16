import { expect, test } from '@playwright/test';

test('初期画面は縦向き（横長ウィンドウでも縦レイアウトを選ぶ）', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 324 });
  await page.goto('/');
  const stage = page.locator('#stage');
  await expect(stage).toHaveAttribute('data-orient', 'port');
  await expect.poll(() => stage.evaluate((el: HTMLElement) => el.style.transform)).toContain('rotate(-90deg)');
});

test('縦画面で回転ボタンを押すと正しい向きへ切り替わり、戻せる', async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 360, height: 684 });
  await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', sound: false, speed: 3, stream: 'none' })));
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
