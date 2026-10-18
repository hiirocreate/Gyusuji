import Phaser from 'phaser';
import { FIELD, layout, onLayout } from '../layout.js';
import { store } from '../store.js';

/** フィールド領域（280×280 座標系）に固定したカメラ。縦画面では 1.2857 倍 */
export function fieldCam(scene: Phaser.Scene, follow = false): void {
  const set = () => {
    const f = layout().field;
    const cam = scene.cameras.main;
    cam.setViewport(f.x, f.y, f.size, f.size).setZoom(f.scale);
    if (!follow) cam.centerOn(FIELD / 2, FIELD / 2);
  };
  set();
  const off = onLayout(set);
  scene.events.once('shutdown', off);
}

/** 24fps 基準のフレーム数 → ms（早送り考慮） */
export const frames = (n: number) => ((n / 24) * 1000) / store().speed;

/** シーンが止まっていても待ち続けないよう、実時間の上限（通常の数倍）でも解決する */
function settle(ms: number, start: (done: () => void) => void): Promise<void> {
  return new Promise((r) => {
    let ok = false;
    const done = () => { if (!ok) { ok = true; r(); } };
    window.setTimeout(done, ms * 3 + 1500);
    try { start(done); } catch { done(); }
  });
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return settle(ms, (done) => {
    if (!scene.sys.isActive()) return done();
    scene.time.delayedCall(ms, done);
  });
}

export function tween(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return settle(Number(cfg.duration ?? 500), (done) => {
    if (!scene.sys.isActive()) return done();
    scene.tweens.add({ ...cfg, onComplete: done, onStop: done });
  });
}

/** 数字画像（num/damage・num/heal・num/gold）で数値を描く */
export function digits(scene: Phaser.Scene, sheet: string, value: number, x: number, y: number, depth = 50): Phaser.GameObjects.Container {
  const s = String(Math.abs(Math.round(value)));
  const c = scene.add.container(x, y).setDepth(depth);
  [...s].forEach((ch, i) => c.add(scene.add.image((i - (s.length - 1) / 2) * 18, 0, sheet, Number(ch)).setScale(18 / 22)));
  return c;
}
