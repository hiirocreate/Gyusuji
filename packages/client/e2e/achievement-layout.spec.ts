import { expect, test } from '@playwright/test';

for (const [name, viewport] of [
  ['portrait-360x640', { width: 360, height: 640 }],
  ['portrait-320x568', { width: 320, height: 568 }],
] as const) {
  test.describe(`achievement screen ${name}`, () => {
    test.use({ viewport, deviceScaleFactor: 2 });
    test.setTimeout(60000);

    test('実績ウィンドウが画面内に収まり、一覧がスクロール可能', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('beefhunter.v1', JSON.stringify({ name: 'てすと', sound: false, stream: 'none' }));
      });
      await page.goto('/?orient=port');
      await page.locator('.press').click();
      await page.getByText('戦績・実績', { exact: true }).click();

      const geometry = await page.evaluate(() => {
        const stage = document.getElementById('stage')!.getBoundingClientRect();
        const screen = document.querySelector('#screen .menu-full') as HTMLElement;
        const panels = [...screen.querySelectorAll<HTMLElement>(':scope > .win')].map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
        });
        const list = screen.querySelector<HTMLElement>(':scope > .win.list');
        return {
          stage: { top: stage.top, bottom: stage.bottom, left: stage.left, right: stage.right },
          screen: { top: screen.getBoundingClientRect().top, bottom: screen.getBoundingClientRect().bottom, scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight },
          panels,
          achievementList: list ? {
            scrollHeight: list.scrollHeight,
            clientHeight: list.clientHeight,
            overflowY: getComputedStyle(list).overflowY,
            rowsFit: [...list.children].every((row) => row.scrollWidth <= row.clientWidth),
          } : null,
        };
      });
      const { stage, screen, panels, achievementList } = geometry;
      await page.screenshot({ path: `e2e-out/${name}-achievements.png` });
      expect(screen.top).toBeGreaterThanOrEqual(stage.top - 1);
      expect(screen.bottom).toBeLessThanOrEqual(stage.bottom + 1);
      expect(panels.every((p) => p.top >= stage.top - 1 && p.bottom <= stage.bottom + 1 && p.left >= stage.left - 1 && p.right <= stage.right + 1)).toBe(true);
      expect(achievementList).not.toBeNull();
      expect(achievementList!.overflowY).toBe('auto');
      expect(achievementList!.scrollHeight).toBeGreaterThan(achievementList!.clientHeight);
      expect(achievementList!.rowsFit).toBe(true);
    });
  });
}
