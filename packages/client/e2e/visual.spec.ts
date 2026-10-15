import { expect, test } from '@playwright/test';

for (const orient of ['land', 'port'] as const) {
  test.describe(`classic visuals: ${orient}`, () => {
    const viewport = orient === 'land' ? { width: 640, height: 324 } : { width: 360, height: 684 };
    test.use({ viewport, deviceScaleFactor: 2 });
    test.setTimeout(60000);

    for (const map of [0, 1, 2]) {
      test(`map${map}: タイトル・選択・待機・マップが既存の画角に収まる`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', sound: false, speed: 3, stream: 'none' })));
        await page.goto(`/?orient=${orient}`);
        await expect(page.locator('.press')).toBeVisible();
        if (map === 0) await page.screenshot({ path: `e2e-out/classic_${orient}_title.png` });
        await page.locator('.press').click();
        await page.getByText('一人で遊ぶ', { exact: true }).click();
        await page.getByText('決定', { exact: true }).click();
        await expect(page.locator('.it', { hasText: '召喚士' })).toBeVisible();
        const fits = await page.evaluate(() => {
          const stage = document.getElementById('stage')!.getBoundingClientRect();
          return [...document.querySelectorAll('.full .win')].every((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= stage.left - 1 && r.right <= stage.right + 1 && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1;
          }) && [...document.querySelectorAll<HTMLElement>('.char-it')].every((el) => el.scrollWidth <= el.clientWidth);
        });
        expect(fits).toBe(true);
        if (map === 0) await page.screenshot({ path: `e2e-out/classic_${orient}_chars.png` });
        await page.locator('.it', { hasText: '召喚士' }).click();
        // 各ケースで新しいページを起動。ゲーム進行に関係なく全地形の描画を確認する。
        await page.evaluate((map) => { (window as any).game.scene.getScene('Menu').settings.map = map; }, map);
        const lobbyFits = await page.evaluate(() => {
          const stage = document.getElementById('stage')!.getBoundingClientRect();
          const chat = document.getElementById('chatbar')!.getBoundingClientRect();
          return [...document.querySelectorAll('.chat-visible .win')].every((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= stage.top - 1 && r.bottom <= chat.top + 1;
          });
        });
        expect(lobbyFits).toBe(true);
        if (map === 0) await page.screenshot({ path: `e2e-out/classic_${orient}_lobby.png` });
        await page.getByText('ゲーム開始', { exact: true }).click();
        await expect(page.locator('.okbtn')).toBeVisible({ timeout: 15000 });
        await page.locator('.okbtn').click();
        await expect(page.getByText('移動', { exact: true })).toBeVisible({ timeout: 15000 });
        const geometry = await page.evaluate(() => {
          const game = (window as any).game;
          const f = game.scene.getScene('Field');
          const s = game.scene.getScene('Status');
          return {
            field: [f.cameras.main.width, f.cameras.main.height],
            status: [s.cameras.main.width, s.cameras.main.height],
            tiles: ['grass_0', 'mountain_0', 'forest_0', 'sand_0', 'sea_0', 'sea_1', 'path', 'path_start', 'path_branch', 'path_boss', 'path_lastboss', 'bridge'].map((k) => {
              const tex = game.textures.get(`classic/${k}+`);
              return [tex.source[0].width, tex.source[0].height];
            }),
          };
        });
        expect(geometry.field).toEqual(orient === 'land' ? [280, 280] : [360, 360]);
        expect(geometry.status).toEqual([360, 280]);
        expect(geometry.tiles.every(([w, h]: number[]) => w === 42 && h === 42)).toBe(true);
        await page.screenshot({ path: `e2e-out/classic_${orient}_map${map}.png` });
        expect(errors).toEqual([]);
      });
    }
  });
}
