import { expect, test } from '@playwright/test';

test('状態表示・アイテム通知・復活移動・結果画面の回帰確認', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 640, height: 324 });
  await page.addInitScript(() => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: '回帰テスト', sound: false, speed: 1, stream: 'none' })));
  await page.goto('/');
  await page.locator('.press').click();
  await page.getByText('一人で遊ぶ', { exact: true }).click();
  await page.getByText('決定', { exact: true }).click();
  await page.locator('.it', { hasText: '召喚士' }).click();
  await page.getByText('ゲーム開始', { exact: true }).click();
  await expect(page.locator('.okbtn')).toBeVisible({ timeout: 15000 });

  // アイテムの入手通知は手番プレイヤー以外の獲得でも全員に表示し、演出速度に左右されず1.5秒残る。
  await page.evaluate(() => {
    const field = (window as any).game.scene.getScene('Field');
    void field.play({ t: 'getItem', seat: 1, item: 1 }, field.view);
  });
  const notice = page.locator('.notice-window');
  await expect(notice).toContainText('りんごを手に入れた！');
  await page.waitForTimeout(800);
  await expect(notice).toBeVisible();
  await page.waitForTimeout(800);
  await expect(notice).toHaveCount(0);

  await page.evaluate(() => {
    const field = (window as any).game.scene.getScene('Field');
    void field.play({ t: 'itemUse', seat: 1, item: 1 }, field.view);
  });
  await expect(notice).toContainText('りんごを使った！');
  await page.waitForTimeout(800);
  await expect(notice).toBeVisible();
  await page.waitForTimeout(800);
  await expect(notice).toHaveCount(0);

  const statusResult = await page.evaluate(async () => {
    const field = (window as any).game.scene.getScene('Field');
    const p = field.view.players[0];
    p.stun = 2;
    p.cursed = true;
    field.setMarks(p);
    const adjacent = (x: number, y: number) => field.map.data.path.find((c: any) => Math.abs(c.x - x) + Math.abs(c.y - y) === 1);
    const next = adjacent(p.x, p.y);
    if (!next) throw new Error('No adjacent path cell for status marker test');
    const activeEnd = { ...field.view, players: field.view.players.map((q: any, i: number) => i === 0 ? { ...q, x: next.x, y: next.y } : q) };
    await field.play({ t: 'move', seat: 0, cells: [{ x: next.x, y: next.y }] }, activeEnd);
    field.view = activeEnd;
    const marks = field.marks[0];
    const hero = field.heroes[0];
    const followed = marks.length === 2 && marks.every((m: any) => Math.abs(m.y - (hero.y - 22)) < 0.01 || Math.abs(m.y - (hero.y - 18)) < 0.01);
    const sizes = marks.map((m: any) => [m.texture.key, m.scaleX, m.scaleY]);
    const next2 = adjacent(next.x, next.y);
    if (!next2) throw new Error('No second adjacent path cell for status release test');
    const clearedEnd = { ...activeEnd, players: activeEnd.players.map((q: any, i: number) => i === 0 ? { ...q, stun: 0, cursed: false, x: next2.x, y: next2.y } : q) };
    await field.play({ t: 'move', seat: 0, cells: [{ x: next2.x, y: next2.y }] }, clearedEnd);
    const cleared = field.marks[0].length === 0;
    return { followed, sizes, cleared };
  });
  expect(statusResult.followed).toBe(true);
  expect(statusResult.sizes).toEqual([['fx/piyo', 0.5, 0.5], ['fx/curse', 0.35, 0.35]]);
  expect(statusResult.cleared).toBe(true);

  const respawnResult = await page.evaluate(async () => {
    const field = (window as any).game.scene.getScene('Field');
    const start = { x: field.heroes[0].x, y: field.heroes[0].y };
    const tile = field.map.data.tileSize;
    const target = field.map.data.path.reduce((best: any, c: any) => {
      const d = Math.abs(c.x * tile + tile / 2 - start.x) + Math.abs(c.y * tile + tile / 2 - 10 - start.y);
      const bd = Math.abs(best.x * tile + tile / 2 - start.x) + Math.abs(best.y * tile + tile / 2 - 10 - start.y);
      return d > bd ? c : best;
    }, field.map.data.path[0]);
    const end = { ...field.view, players: field.view.players.map((p: any, i: number) => i === 0 ? { ...p, respawn: { x: target.x, y: target.y, dir: 'down', steps: 0 } } : p) };
    const animation = field.play({ t: 'respawn', seat: 0 }, end);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const during = { x: field.heroes[0].x, y: field.heroes[0].y };
    await animation;
    const finish = { x: field.heroes[0].x, y: field.heroes[0].y };
    const destination = { x: target.x * tile + tile / 2, y: target.y * tile + tile / 2 - 10 };
    return {
      movedDuring: Math.hypot(during.x - start.x, during.y - start.y) > 1 && Math.hypot(during.x - destination.x, during.y - destination.y) > 1,
      arrived: Math.hypot(finish.x - destination.x, finish.y - destination.y) < 0.01,
    };
  });
  expect(respawnResult.movedDuring).toBe(true);
  expect(respawnResult.arrived).toBe(true);

  // 再戦要求は待機表示になる。新ゲーム開始イベントでFieldを再作成し、閉じる操作でMenuへ戻れる。
  await page.evaluate(() => {
    const field = (window as any).game.scene.getScene('Field');
    field.host.kind = 'online';
    field.result(0);
  });
  const rematch = page.getByRole('button', { name: 'リマッチ' });
  await expect(rematch).toBeVisible();
  await rematch.click();
  await expect(page.getByRole('button', { name: '相手の再戦を待っています…' })).toBeDisabled();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByText('一人で遊ぶ', { exact: true })).toBeVisible();
  await expect(page.locator('.result-window')).toHaveCount(0);
});
