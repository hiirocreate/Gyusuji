import Phaser from 'phaser';
import { HEROES, MONSTERS, SHEETS } from '../assets.js';
import { makeClassicTerrain } from './classicTerrain.js';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 100, height / 2, 0, 8, 0xffcf3f).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => (bar.width = 200 * v));
    this.load.setPath('./assets/img/');
    for (const k of HEROES) this.load.spritesheet(k, `chars/${k}.png`, { frameWidth: 64, frameHeight: 64 });
    for (const k of MONSTERS) this.load.spritesheet(k, `chars/${k}.png`, { frameWidth: 64, frameHeight: 64 });
    for (const [k, v] of Object.entries(SHEETS)) {
      if (v.frames > 1 || k.startsWith('npc/') || k.startsWith('items/icons')) {
        this.load.spritesheet(k, `${k}.png`, { frameWidth: v.frame[0], frameHeight: v.frame[1] });
      } else {
        this.load.image(k, `${k}.png`);
      }
    }
  }
  create() {
    makeStatFont(this);
    const visualTiles = makeClassicTerrain(this);
    // 縦画面（1.2857倍）でタイル間に隙間が出ないよう、縁を1px延長したタイル（42×42）を作る
    for (const k of Object.keys(SHEETS)) if (k.startsWith('tiles/')) extrude(this, k);
    for (const k of visualTiles) extrude(this, k);
    for (const [k, v] of Object.entries(SHEETS)) {
      if (!k.startsWith('fx/') || v.frames <= 1) continue;
      this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(k, {}), frameRate: 16, repeat: k === 'fx/cursor' || k === 'fx/piyo' || k === 'fx/curse' ? -1 : 0 });
    }
    this.anims.create({ key: 'dice/roll-hd', frames: this.anims.generateFrameNumbers('dice/roll-hd', {}), frameRate: 20, repeat: -1 });
    this.anims.create({ key: 'dice/chaos-roll-hd', frames: this.anims.generateFrameNumbers('dice/chaos-roll-hd', {}), frameRate: 20, repeat: -1 });
    for (const k of HEROES) {
      ['down', 'left', 'right', 'up'].forEach((d, row) => {
        this.anims.create({ key: `${k}_${d}`, frames: this.anims.generateFrameNumbers(k, { start: row * 4, end: row * 4 + 3 }), frameRate: 8, repeat: -1 });
      });
    }
    for (const k of MONSTERS) this.anims.create({ key: `${k}_idle`, frames: this.anims.generateFrameNumbers(k, {}), frameRate: 3, repeat: -1 });
    this.scene.start('Menu');
  }
}

/** ステータス用のビットマップ数字（UI_LAYOUT §3：テキスト流し込みにしない） */
export const STAT_GLYPHS = ' 0123456789HMG/';
export const STAT_W = 9;
export const STAT_H = 16;
function makeStatFont(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas('statfont', STAT_W * STAT_GLYPHS.length, STAT_H)!;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...STAT_GLYPHS].forEach((c, i) => ctx.fillText(c, i * STAT_W + STAT_W / 2, STAT_H / 2 + 1));
  tex.refresh();
  scene.cache.bitmapFont.add('stat', Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'statfont', width: STAT_W, height: STAT_H, chars: STAT_GLYPHS, charsPerRow: STAT_GLYPHS.length,
    'spacing.x': 0, 'spacing.y': 0, 'offset.x': 0, 'offset.y': 0, lineSpacing: 0,
  }));
}

function extrude(scene: Phaser.Scene, key: string) {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const t = scene.textures.createCanvas(`${key}+`, 42, 42)!;
  const c = t.getContext();
  c.imageSmoothingEnabled = false;
  c.drawImage(src, 0, 0, 40, 1, 1, 0, 40, 1);
  c.drawImage(src, 0, 39, 40, 1, 1, 41, 40, 1);
  c.drawImage(src, 0, 0, 1, 40, 0, 1, 1, 40);
  c.drawImage(src, 39, 0, 1, 40, 41, 1, 1, 40);
  c.drawImage(src, 0, 0, 40, 40, 1, 1, 40, 40);
  t.refresh();
}
