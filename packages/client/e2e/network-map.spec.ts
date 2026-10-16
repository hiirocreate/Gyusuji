import { expect, test } from '@playwright/test';

test('ネット対戦ホストはロビーからマップを選び、選択内容が反映される', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 360, height: 684 });
  await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'マップテスト', sound: false, speed: 3, stream: 'none' })));
  await page.goto('/');

  await page.locator('.press').click();
  await page.getByText('ネット対戦をする', { exact: true }).click();
  await page.getByText('決定', { exact: true }).click();
  await page.getByText('部屋1　0人', { exact: true }).click({ timeout: 20000 });
  await expect(page.locator('.char-list')).toBeVisible();
  await page.locator('.char-it').first().click();

  const mapButton = page.getByText('マップ選択：標準', { exact: true });
  await expect(mapButton).toBeVisible();
  await mapButton.click();
  await page.getByText('短編（コンパクト）', { exact: true }).click();
  await expect(page.getByText(/マップ：短編/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('マップ選択：短編', { exact: true })).toBeVisible();

  await page.getByText('マップ選択：短編', { exact: true }).click();
  await page.getByText('長編（じっくり冒険）', { exact: true }).click();
  await expect(page.getByText(/マップ：長編/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('マップ選択：長編', { exact: true })).toBeVisible();
  await page.getByText('退室', { exact: true }).click();
});
