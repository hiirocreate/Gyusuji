import { expect, test, type Browser, type Page } from '@playwright/test';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

async function open(browser: Browser, name: string, ua: string, vp: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({ userAgent: ua, viewport: vp, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript((n) => localStorage.setItem('beefhunter.v1', JSON.stringify({ name: n, speed: 3, sound: false })), name);
  await p.goto('https://gyusuji.h-onoue-test.workers.dev/');
  await p.getByText('ネット対戦をする').click();
  await p.getByText('決定').click();
  return p;
}

/** 自分の手番を進める（ポップアップ・移動・戦闘・選択肢） */
async function step(p: Page) {
  const ok = p.locator('.okbtn');
  const mv = p.locator('.askwin .it', { hasText: '移動' });
  const atk = p.locator('.askwin .it', { hasText: 'たたかう' });
  const opt = p.locator('.askwin .it:not(.off)').last();
  if (await ok.isVisible()) await ok.click().catch(() => {});
  else if (await mv.isVisible()) await mv.click().catch(() => {});
  else if (await atk.isVisible()) await atk.click().catch(() => {});
  else if (await opt.isVisible()) await opt.click().catch(() => {});
}

test.skip(!process.env.PROD_E2E, '本番環境の確認用（PROD_E2E=1 で実行）');
test('本番：iPhone(縦)とAndroid(横)が同じ部屋で対戦', async ({ browser }) => {
  const a = await open(browser, 'あい', IPHONE, { width: 390, height: 844 });
  const b = await open(browser, 'びー', ANDROID, { width: 844, height: 390 });
  await a.locator('.it', { hasText: '部屋5' }).click();
  await a.locator('.it', { hasText: '召喚士' }).click();
  await expect(a.getByText('ゲーム開始', { exact: true })).toBeVisible();
  await b.getByText('更新').click();
  await b.locator('.it', { hasText: '部屋5　1人' }).click();
  await b.locator('.it', { hasText: '戦士' }).click();
  await expect(a.getByText(/びー/)).toBeVisible();
  // チャット（流れる）
  await a.getByPlaceholder('メッセージを入力').fill('よろしく！');
  await a.getByRole('button', { name: '送信' }).click();
  await a.getByText('ゲーム開始', { exact: true }).click();
  await b.getByText('ゲーム開始', { exact: true }).click();
  await expect(a.locator('#fieldui')).toBeVisible();
  await expect(b.locator('.flow, .okbtn').first()).toBeVisible({ timeout: 15000 });
  for (let i = 0; i < 40; i++) {
    await step(a);
    await step(b);
    await a.waitForTimeout(400);
  }
  await a.screenshot({ path: 'e2e-out/prod_iphone.png' });
  await b.screenshot({ path: 'e2e-out/prod_android.png' });
  const steps = await a.evaluate(() => (window as any).game.scene.getScene('Field').view.players.map((p: any) => p.steps));
  expect(Math.max(...steps)).toBeGreaterThan(0);
});
