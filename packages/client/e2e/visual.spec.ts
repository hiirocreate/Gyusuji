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
        await expect(page.locator('.okbtn')).toContainText('行動をはじめる');
        await page.locator('.okbtn').click();
        await expect(page.getByText('移動', { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '画面を回転' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'ゲームを終了' })).toBeVisible();
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
        if (map === 0) {
          // Supply a display-only test item and spy on input; rules/runner are untouched.
          await page.evaluate(() => {
            const f = (window as any).game.scene.getScene('Field');
            f.view.players[0].items = [1];
            f.host.ask = { kind: 'action', seat: 0, items: [0] };
            (window as any).__sent = [];
            f.host.send = (input: unknown) => (window as any).__sent.push(input);
            f.refreshAsk(true);
          });
          await page.locator('#fieldui .it', { hasText: 'アイテム' }).click();
          const apple = page.locator('#fieldui .it', { hasText: 'りんご' });
          await apple.click();
          await expect(page.locator('.tap-instruction')).toContainText('もう一度タップ');
          await expect(page.locator('.confirm-tap')).toHaveCount(1);
          const descGeometry = await page.evaluate(() => {
            const desc = document.querySelector('.item-desc')!;
            const row = document.querySelector('.confirm-tap')!;
            const a = desc.getBoundingClientRect();
            const b = row.getBoundingClientRect();
            return {
              separateLayer: desc.parentElement?.id === 'overlay',
              pointerTransparent: getComputedStyle(desc).pointerEvents === 'none',
              overlapsChoice: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
            };
          });
          expect(descGeometry).toEqual({ separateLayer: true, pointerTransparent: true, overlapsChoice: false });
          expect(await page.evaluate(() => (window as any).__sent)).toEqual([]);
          await apple.click();
          expect(await page.evaluate(() => (window as any).__sent)).toEqual([{ type: 'useItem', slot: 0 }]);

          // Simulate the end of the chick stun followed by movement: its marker must disappear, not remain on the old tile.
          const chickResult = await page.evaluate(async () => {
            const f = (window as any).game.scene.getScene('Field');
            const p = f.view.players[0];
            p.stun = 1;
            f.setMarks(p);
            const destination = f.map.data.path.find((c: any) => Math.abs(c.x - p.x) + Math.abs(c.y - p.y) === 1);
            if (!destination) throw new Error('No adjacent path cell for the chick-marker test');
            const end = { ...f.view, players: f.view.players.map((q: any, i: number) => i === 0 ? { ...q, stun: 0, x: destination.x, y: destination.y } : q) };
            const hadChick = f.marks[0].some((m: any) => m.texture.key === 'fx/piyo');
            await f.play({ t: 'move', seat: 0, cells: [{ x: destination.x, y: destination.y }] }, end);
            return { hadChick, chickAfterMove: f.marks[0].some((m: any) => m.texture.key === 'fx/piyo'), position: [f.heroes[0].x, f.heroes[0].y] };
          });
          expect(chickResult.hadChick).toBe(true);
          expect(chickResult.chickAfterMove).toBe(false);
        }
        const beforeRotate = await page.locator('#stage').getAttribute('data-orient');
        await page.getByRole('button', { name: '画面を回転' }).click();
        await expect(page.locator('#stage')).toHaveAttribute('data-orient', beforeRotate === 'land' ? 'port' : 'land');
        await page.getByRole('button', { name: '画面を回転' }).click();
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'ゲームを終了' }).click();
        await expect(page.getByText('一人で遊ぶ', { exact: true })).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });
}
