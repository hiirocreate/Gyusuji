import Phaser from 'phaser';
import { HEROES, MONSTERS, SHEETS } from '../assets.js';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload() {
    const bar = this.add.rectangle(427 - 150, 240, 0, 10, 0xffcf3f).setOrigin(0, 0.5);
    this.add.text(427, 210, 'Loading...', { color: '#fff', fontSize: '16px' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => (bar.width = 300 * v));
    this.load.setPath('./assets/img/');
    for (const k of HEROES) this.load.spritesheet(k, `chars/${k}.png`, { frameWidth: 64, frameHeight: 64 });
    for (const k of MONSTERS) this.load.spritesheet(k, `chars/${k}.png`, { frameWidth: 64, frameHeight: 64 });
    for (const [k, v] of Object.entries(SHEETS)) {
      if (v.frames > 1 || k.startsWith('npc/') || k === 'items/icons') {
        this.load.spritesheet(k, `${k}.png`, { frameWidth: v.frame[0], frameHeight: v.frame[1] });
      } else {
        this.load.image(k, `${k}.png`);
      }
    }
  }
  create() {
    for (const [k, v] of Object.entries(SHEETS)) {
      if (!k.startsWith('fx/') || v.frames <= 1) continue;
      this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(k, {}), frameRate: 16, repeat: k === 'fx/cursor' || k === 'fx/piyo' || k === 'fx/curse' ? -1 : 0 });
    }
    this.anims.create({ key: 'dice/roll', frames: this.anims.generateFrameNumbers('dice/roll', {}), frameRate: 24, repeat: -1 });
    for (const k of HEROES) {
      ['down', 'left', 'right', 'up'].forEach((d, row) => {
        this.anims.create({ key: `${k}_${d}`, frames: this.anims.generateFrameNumbers(k, { start: row * 4, end: row * 4 + 3 }), frameRate: 8, repeat: -1 });
      });
    }
    for (const k of MONSTERS) this.anims.create({ key: `${k}_idle`, frames: this.anims.generateFrameNumbers(k, {}), frameRate: 3, repeat: -1 });
    this.scene.start('Title');
  }
}
