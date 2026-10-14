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

  /** 3D風ダイスを転がして 58 フレームで止める */
  async roll(values: number[], ichi = false): Promise<void> {
    const objs: Phaser.GameObjects.GameObject[] = [];
    se('dice');
    const runs = values.map((v, i) => {
      const [sx, sy] = DICE_FROM[i % DICE_FROM.length];
      const s = this.add.sprite(sx, sy, ichi ? 'dice/ichi' : 'dice/roll').setDepth(10);
      objs.push(s);
      if (!ichi) s.play('dice/roll');
      const tx = 110 + i * 40;
      const ty = 120 + i * 6;
      return tween(this, { targets: s, x: tx, y: ty, angle: 360, duration: frames(58), ease: 'Cubic.easeOut' }).then(() => {
        s.stop();
        s.setAngle(0);
        if (ichi) s.setFrame(1);
        else s.setTexture('dice/faces', v - 1);
      });
    });
    await Promise.all(runs);
    se('diceStop');
    if (values.length > 1) objs.push(digits(this, 'num/gold', values.reduce((a, b) => a + b, 0), 140, 170, 11));
    await wait(this, frames(14));
    objs.forEach((o) => o.destroy());
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
