import { expect, test } from '@playwright/test';

test('ひとりで遊ぶ：さいころを振って進める', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', speed: 3, sound: false, tutorialDone: true })));
  await page.goto('/');
  await page.getByText('ひとりで遊ぶ').click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.locator('#status')).toBeVisible();
  await page.screenshot({ path: 'e2e-out/field.png' });
  for (let i = 0; i < 40; i++) {
    const roll = page.getByRole('button', { name: '🎲 さいころ' });
    const attack = page.getByRole('button', { name: '⚔ たたかう' });
    const opt = page.locator('.dialog .opts button:not([disabled])').last();
    if (await roll.isVisible()) await roll.click();
    else if (await attack.isVisible()) {
      await page.screenshot({ path: 'e2e-out/battle.png' });
      await attack.click();
    } else if (await opt.isVisible()) await opt.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: 'e2e-out/after.png' });
  const steps = await page.locator('#status .pcard').first().textContent();
  expect(steps).toMatch(/[1-9]\d*歩/);
  expect(errors).toEqual([]);
});
