import Phaser from 'phaser';
import type { PublicView } from '@gyusuji/shared';
import { HEROES } from '../assets.js';
import { layout, onLayout } from '../layout.js';

const PW = 180;
const PH = 140;

/** ステータス領域 360×280（1人分 180×140 を 2×2、UI_LAYOUT §3） */
export class Status extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private off?: () => void;

  constructor() {
    super('Status');
  }

  create() {
    this.layer = this.add.container(0, 0);
    this.relayout();
    this.off = onLayout(() => this.relayout());
    this.events.once('shutdown', () => this.off?.());
  }

  relayout() {
    const s = layout().status;
    this.cameras.main.setViewport(s.x, s.y, s.w, s.h).setScroll(0, 0).setBackgroundColor('#000000');
  }

  draw(v: PublicView, turn: number) {
    this.layer.removeAll(true);
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * PW;
      const y = Math.floor(i / 2) * PH;
      const p = v.players[i];
      const g = this.add.graphics();
      g.fillStyle(p && i === turn ? 0x404080 : 0x000000, 1).fillRect(x, y, PW, PH);
      g.lineStyle(1, p && i === turn ? 0xd6dcec : 0x75838f, 1).strokeRect(x + 0.5, y + 0.5, PW - 1, PH - 1);
      g.lineStyle(1, 0x75838f, 0.45).lineBetween(x + 8, y + 76.5, x + PW - 8, y + 76.5);
      if (p && i === turn) g.fillStyle(0xffe650).fillRect(x + 1, y + 1, 2, 13);
      this.layer.add(g);
      if (!p) continue;
      this.layer.add(this.add.text(x + 5, y + 1, p.name.slice(0, 6), { fontSize: '12px', color: '#ffffff', fontFamily: 'Meiryo, sans-serif' }));
      this.layer.add(this.add.image(x + 4, y + 16, HEROES[p.charId], 0).setOrigin(0).setDisplaySize(44, 44));
      this.layer.add(this.add.text(x + 94, y + 20, '歩数', { fontSize: '10px', color: '#b6c4d1', fontFamily: 'Meiryo, sans-serif' }));
      this.layer.add(this.add.bitmapText(x + 124, y + 18, 'stat', String(Math.min(999, p.steps)).padStart(3, ' ')));
      this.layer.add(this.add.bitmapText(x + 52, y + 36, 'stat', `H ${String(p.hp).padStart(2, ' ')} / M ${String(p.mp).padStart(2, ' ')}`));
      this.layer.add(this.add.bitmapText(x + 106, y + 56, 'stat', `${String(p.gold).padStart(3, ' ')}G`));
      // アイテム欄：参考図に合わせ (10,82) から枠30×26・ピッチ32×28（所持金の数字と重ならない）
      const box = this.add.graphics().lineStyle(1, 0x627181, 1);
      this.layer.add(box);
      for (let k = 0; k < 10; k++) {
        const ix = x + 10 + (k % 5) * 32;
        const iy = y + 82 + Math.floor(k / 5) * 28;
        box.fillStyle(0x10212d, p && i === turn ? 0.35 : 0.55).fillRect(ix + 1, iy + 1, 28, 24);
        box.strokeRect(ix + 0.5, iy + 0.5, 29, 25);
        const id = p.items[k];
        if (id) this.layer.add(this.add.image(ix + 15, iy + 13, 'items/icons', id - 1).setDisplaySize(26, 26));
      }
    }
  }
}
