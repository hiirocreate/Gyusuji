import { expect, test, type Page } from '@playwright/test';

/** 自分の「移動」メニューが出るまで進める（手番ポップアップ・戦闘・選択肢を処理） */
async function untilMyAction(page: Page) {
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.askwin .it', { hasText: '移動' }).isVisible()) return;
    const ok = page.locator('.okbtn');
    const atk = page.locator('.askwin .it', { hasText: 'たたかう' });
    const opt = page.locator('.askwin .it:not(.off)').last();
    if (await ok.isVisible()) await ok.click().catch(() => {});
    else if (await atk.isVisible()) await atk.click().catch(() => {});
    else if (await opt.isVisible()) await opt.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  throw new Error('自分の手番になりません');
}

/** UI_LAYOUT §12 の 1〜2：横(640×324)・縦(360×684) のスクリーンショット */
const SIZES = { land: { width: 640, height: 324 }, port: { width: 360, height: 684 } } as const;

for (const orient of ['land', 'port'] as const) {
  test.describe(orient, () => {
    test.use({ viewport: SIZES[orient], deviceScaleFactor: 2 });

    test('タイトル〜1ターン（移動・イベント・戦闘）', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', speed: 1, sound: false })));
      await page.goto(`/?orient=${orient}`);
      await page.waitForSelector('.ttl');
      await page.screenshot({ path: `e2e-out/${orient}_title.png` });
      await page.getByText('一人で遊ぶ').click();
      await page.getByText('決定').click();
      await page.screenshot({ path: `e2e-out/${orient}_0chars.png` });
      await page.locator('.it', { hasText: '召喚士' }).click();
      await page.screenshot({ path: `e2e-out/${orient}_0wait.png` });
      await page.getByText('ゲーム開始').click();
      await expect(page.locator('.okbtn')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e-out/${orient}_1turnpop.png` });
      await page.locator('.okbtn').click();
      await expect(page.getByText('移動')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e-out/${orient}_1field.png` });
      const fs = await import('node:fs');
      const measure = async (tag: string) => fs.writeFileSync(`e2e-out/${orient}_${tag}.json`, JSON.stringify(await page.evaluate(() => {
        const st = document.getElementById('stage')!.getBoundingClientRect();
        const sc = st.width / (document.getElementById('stage')!.offsetWidth);
        const r = (sel: string) => [...document.querySelectorAll(sel)].map((e) => { const b = e.getBoundingClientRect(); return [Math.round((b.left - st.left) / sc), Math.round((b.top - st.top) / sc), Math.round(b.width / sc), Math.round(b.height / sc)]; });
        const g = (window as any).game;
        const status = g.scene.getScene('Status');
        const objs = status.layer.list.filter((o: any) => o.type !== 'Graphics').slice(0, 7).map((o: any) => [o.type, Math.round(o.x), Math.round(o.y), o.text ?? o.texture?.key, Math.round(o.displayWidth), Math.round(o.displayHeight)]);
        const b = g.scene.getScene('Battle');
        return {
          stage: [Math.round(st.width / sc), Math.round(st.height / sc)],
          chatbar: r('#chatbar'), chatItems: r('#chatbar > *'), askwin: r('.askwin'), log: r('.logwin'), fieldui: r('#fieldui'),
          statusCam: (({ x, y, width, height }) => [x, y, width, height])(status.cameras.main),
          fieldCam: (({ x, y, width, height, zoom }) => [x, y, width, height, zoom])(g.scene.getScene('Field').cameras.main),
          statusP1: objs, battle: b.active ? { enemy: [b.enemy.x, b.enemy.y], hero: [b.hero.x, b.hero.y] } : null,
        };
      }), null, 1));
      await measure('m_field');

      // 流れるメッセージ：複数人が同時に送っても重ならない
      await page.evaluate(() => {
        const w = window as unknown as { __say: (f: string, t: string, c: string) => void };
        for (const [f, t, c] of [['P2', 'よろしく！', '#000000'], ['P3', 'ナイス！', '#ff3030'], ['P4', 'がんばろう', '#30c040'], ['P2', '同時に送信', '#3070ff'], ['P3', 'ぶつからない？', '#000000'], ['P4', '6段レーン', '#ff3030'], ['P2', '7件目は待つ', '#30c040']]) w.__say(f, t, c);
      });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `e2e-out/${orient}_2stream.png` });
      // 重なり判定：同じレーン（top）の要素が横方向に重ならない
      const overlap = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.flow')].map((e) => e.getBoundingClientRect());
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
          const a = els[i], b = els[j];
          if (a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right) return true;
        }
        return false;
      });
      expect(overlap).toBe(false);

      await page.getByRole('button', { name: 'ログ' }).click();
      await measure('m_log');
      await page.screenshot({ path: `e2e-out/${orient}_3log.png` });
      await page.getByRole('button', { name: '×' }).click();

      // 移動
      await page.locator('.askwin .it', { hasText: '移動' }).click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `e2e-out/${orient}_4dice.png` });
      await untilMyAction(page);
      // イベント：宝箱の1マス手前に置き、いちころで1マス進む
      await page.evaluate(() => {
        const f = (window as any).game.scene.getScene('Field');
        const g = f.host.runner.game;
        const D: Record<string, number[]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        for (const [k, idxs] of g.map.triggers) {
          if (!idxs.some((i: number) => g.map.data.objects[i].type === 'treasure')) continue;
          const [tx, ty] = k.split(',').map(Number);
          const prev = g.map.data.path.find((c: any) => D[c.c] && c.x + D[c.c][0] === tx && c.y + D[c.c][1] === ty);
          if (!prev) continue;
          const p = g.players[0];
          p.x = prev.x; p.y = prev.y; p.dir = prev.c;
          p.items.push({ id: 5 });
          f.host.runner.ask.items.push(p.items.length - 1);
          f.host.view = g.view();
          f.view = f.host.view;
          f.refreshAsk(true);
          break;
        }
      });
      await page.locator('.askwin .it', { hasText: 'アイテム' }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e-out/${orient}_4items.png` });
      await page.locator('.askwin .it', { hasText: 'いちころ' }).click({ timeout: 5000 });
      await expect(page.locator('.askwin .it', { hasText: '開ける' })).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e-out/${orient}_5event.png` });
      await page.locator('.askwin .it', { hasText: '開ける' }).click();
      await untilMyAction(page);
      // 戦闘：中ボス手前のマスへ置いてから移動
      await page.evaluate(() => {
        const f = (window as any).game.scene.getScene('Field');
        const p = f.host.runner.game.players[0];
        p.x = 30; p.y = 12; p.dir = 'left';
      });
      await page.locator('.askwin .it', { hasText: '移動' }).click();
      await expect(page.locator('.askwin .it', { hasText: 'たたかう' })).toBeVisible({ timeout: 20000 });
      await page.screenshot({ path: `e2e-out/${orient}_6battle.png` });
      await measure('m_battle');
      await page.locator('.askwin .it', { hasText: 'たたかう' }).click();
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `e2e-out/${orient}_7attack.png` });
      expect(errors).toEqual([]);
    });
  });
}
