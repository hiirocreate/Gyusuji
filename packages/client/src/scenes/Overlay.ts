import Phaser from 'phaser';
import { se } from '../audio.js';
import { FIELD, layout } from '../layout.js';
import { digits, fieldCam, frames, tween, wait } from './fieldcam.js';

/** ダイスの起点（UI_LAYOUT §7） */
const DICE_FROM = [[60, 60], [40, 70], [35, 80]];

/** フィールド領域上の演出（ダイス・エンカウント・ぱるぷん・数字） */
export class Overlay extends Phaser.Scene {
  constructor() {
    super('Overlay');
  }
  create() {
    fieldCam(this);
  }

  /** シンプルな立方体が弧を描いて回転し、約0.5秒で着地する */
  async roll(values: number[], ichi = false, chaos = false): Promise<void> {
    const rollKey = chaos ? 'dice/chaos-roll-hd' : 'dice/roll-hd';
    const objs: Phaser.GameObjects.GameObject[] = [];
    se('dice');
    const runs = values.map((v, i) => {
      const [sx, sy] = DICE_FROM[i % DICE_FROM.length];
      const shadow = this.add.ellipse(sx, sy + 16, 34, 11, 0x1c1730, 0.3).setDepth(9);
      const s = this.add.sprite(sx, sy, ichi ? 'dice/ichi-hd' : rollKey).setDisplaySize(52, 52).setDepth(10);
      objs.push(shadow, s);
      if (!ichi) s.play(rollKey);
      const tx = 110 + i * 40;
      const ty = 120 + i * 6;
      return new Promise<void>((resolve) => this.tweens.addCounter({ from: 0, to: 1, duration: frames(12), ease: 'Cubic.easeOut', onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        s.setPosition(Phaser.Math.Linear(sx, tx, t), Phaser.Math.Linear(sy, ty, t) - Math.sin(Math.PI * t) * 29 - Math.max(0, Math.sin(t * Math.PI * 5)) * 4 * (1 - t));
        s.setAngle(750 * t);
        shadow.setPosition(s.x, ty + 17).setScale(0.62 + t * 0.38).setAlpha(0.22 + t * 0.13);
      }, onComplete: () => resolve() })).then(() => {
        s.stop();
        s.setAngle(0);
        if (ichi) s.setTexture('dice/ichi-hd');
        else s.setTexture(chaos ? 'dice/chaos-hd' : 'dice/faces-hd', v - 1);
      });
    });
    await Promise.all(runs);
    se('diceStop');
    if (values.length > 1) objs.push(digits(this, 'num/gold', values.reduce((a, b) => a + b, 0), 140, 170, 11));
    await wait(this, frames(5));
    objs.forEach((o) => o.destroy());
  }

  /** アイテムを使った瞬間に小さな虹色の光とアイコンを弾ませる。 */
  itemUse(id: number, x: number, y: number): void {
    const tint = [0xffd957, 0xff718d, 0x80e4d1, 0x92bdff][id % 4];
    const ring = this.add.circle(x, y, 8, tint, 0.04).setStrokeStyle(3, tint, 0.95).setDepth(35);
    const icon = this.add.image(x, y - 2, 'items/icons-hd', id - 1).setDisplaySize(38, 38).setDepth(36).setAlpha(0.2).setScale(0.45);
    this.tweens.add({ targets: ring, scale: 2.9, alpha: 0, duration: frames(14), onComplete: () => ring.destroy() });
    this.tweens.add({ targets: icon, y: y - 32, alpha: 1, scale: 1, duration: frames(12), ease: 'Back.easeOut', onComplete: () => {
      this.tweens.add({ targets: icon, y: y - 40, alpha: 0, scale: 0.88, delay: frames(5), duration: frames(8), onComplete: () => icon.destroy() });
    } });
    this.stepFx(x, y - 6, tint);
  }

  /** 移動マスに短く現れる足あとスパーク。 */
  stepFx(x: number, y: number, color = 0x87e2d4): void {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = this.add.circle(x, y, 2.2, color, 0.9).setDepth(34);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 11, y: y - 5 + Math.sin(a) * 8, alpha: 0, scale: 0.25, duration: frames(9), onComplete: () => p.destroy() });
    }
  }

  /** フィールドを取り込み、60 フレームで拡大(1.2→3.0)＋回転(6°/f)＋加算合成で渦巻かせる */
  async encount(): Promise<void> {
    se('encount');
    const f = layout().field;
    const img = await new Promise<HTMLImageElement>((res) => this.game.renderer.snapshotArea(f.x, f.y, f.size, f.size, (i) => res(i as HTMLImageElement)));
    const key = `snap${Date.now()}`;
    this.textures.addImage(key, img);
    const base = this.add.image(FIELD / 2, FIELD / 2, key).setDisplaySize(FIELD, FIELD).setDepth(20);
    const sw = this.add.image(FIELD / 2, FIELD / 2, key).setDisplaySize(FIELD, FIELD).setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    const sx = base.scaleX;
    await new Promise<void>((r) => {
      let n = 0;
      const ev = this.time.addEvent({
        delay: frames(1), repeat: 59, callback: () => {
          n++;
          sw.setScale(sx * (1.2 + (1.8 * n) / 60)).setAngle(n * 6);
          if (n >= 60) { ev.remove(); r(); }
        },
      });
    });
    base.destroy();
    sw.destroy();
    this.textures.remove(key);
  }

  async paru(kiwami: boolean): Promise<void> {
    se('paru');
    const s = this.add.sprite(140, 140, 'fx/paru').setDepth(10).play('fx/paru');
    await wait(this, frames(20));
    s.destroy();
    if (!kiwami) return;
    se('kiwami');
    const flash = this.add.rectangle(140, 140, FIELD, FIELD, 0xffd700, 1).setDepth(9).setBlendMode(Phaser.BlendModes.DIFFERENCE);
    const k = this.add.sprite(140, 140, 'fx/paru_kiwami').setScale(1.5).setDepth(10).play('fx/paru_kiwami');
    await tween(this, { targets: flash, alpha: 0, duration: frames(36) });
    flash.destroy();
    k.destroy();
  }

  /** 数字画像を浮かび上がらせる（x,y はフィールド座標） */
  pop(sheet: string, value: number, x: number, y: number): void {
    const c = digits(this, sheet, value, x, y);
    this.tweens.add({ targets: c, y: y - 20, alpha: 0, delay: frames(12), duration: frames(18), onComplete: () => c.destroy() });
  }
}
