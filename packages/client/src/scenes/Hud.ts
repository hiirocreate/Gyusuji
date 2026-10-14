import Phaser from 'phaser';
import { se } from '../audio.js';
import { store } from '../store.js';

const CX = 320;
const CY = 220;

/** 画面固定の演出（ダイス・エンカウント・ぱるぷん） */
export class Hud extends Phaser.Scene {
  constructor() {
    super('Hud');
  }
  create() {
    this.cameras.main.setViewport(0, 0, 640, 480);
  }
  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms / store().speed, r));
  }

  /** dice/roll を約2.4秒（58フレーム）回して結果の目で止める */
  async roll(values: number[], ichi = false): Promise<void> {
    const n = values.length;
    const sprites = values.map((_, i) => {
      const x = CX + (i - (n - 1) / 2) * 64;
      const s = this.add.sprite(x, CY, ichi ? 'dice/ichi' : 'dice/roll').setScale(1.4).setDepth(10);
      if (!ichi) s.play('dice/roll');
      this.tweens.add({ targets: s, y: CY - 14, yoyo: true, repeat: -1, duration: 120 });
      return s;
    });
    se('dice');
    await this.wait((58 / 24) * 1000 * 0.75);
    sprites.forEach((s, i) => {
      this.tweens.killTweensOf(s);
      s.stop();
      s.y = CY;
      if (ichi) s.setFrame(1);
      else s.setTexture('dice/faces', values[i] - 1);
    });
    se('diceStop');
    if (n > 1) {
      const t = this.add.text(CX, CY + 48, `合計 ${values.reduce((a, b) => a + b, 0)}`, { fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
      sprites.push(t as unknown as Phaser.GameObjects.Sprite);
    }
    await this.wait(600);
    sprites.forEach((s) => s.destroy());
  }

  async encount(): Promise<void> {
    se('encount');
    const s = this.add.sprite(CX, 240, 'fx/encount').setScale(5).setDepth(20).play('fx/encount');
    const bg = this.add.rectangle(CX, 240, 640, 480, 0x000000, 0).setDepth(19);
    this.tweens.add({ targets: bg, fillAlpha: 0.8, duration: 1200 / store().speed });
    await this.wait(2500);
    s.destroy();
    bg.destroy();
  }

  async paru(kiwami: boolean): Promise<void> {
    se('paru');
    const s = this.add.sprite(CX, CY, 'fx/paru').setScale(2.5).setDepth(10).play('fx/paru');
    await this.wait(900);
    s.destroy();
    if (!kiwami) return;
    se('kiwami');
    const flash = this.add.rectangle(CX, 240, 640, 480, 0xffd700, 1).setDepth(9).setBlendMode(Phaser.BlendModes.DIFFERENCE);
    const k = this.add.sprite(CX, CY, 'fx/paru_kiwami').setScale(3).setDepth(10).play('fx/paru_kiwami');
    const t = this.add.text(CX, CY + 110, '……ぱるぷん玉<極>だった！', { fontSize: '22px', color: '#ffe060', stroke: '#5a3a00', strokeThickness: 5 }).setOrigin(0.5).setDepth(11);
    this.tweens.add({ targets: flash, alpha: 0, duration: 1600 / store().speed });
    await this.wait(1800);
    flash.destroy();
    k.destroy();
    t.destroy();
  }

  async banner(text: string, color = '#ffffff', ms = 1200): Promise<void> {
    const t = this.add.text(CX, 150, text, { fontSize: '26px', color, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(12);
    await this.wait(ms);
    t.destroy();
  }

  flash(color = 0xffffff, ms = 300): void {
    const r = this.add.rectangle(CX, 240, 640, 480, color, 0.9).setDepth(15);
    this.tweens.add({ targets: r, alpha: 0, duration: ms / store().speed, onComplete: () => r.destroy() });
  }
}
