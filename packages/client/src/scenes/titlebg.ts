import Phaser from 'phaser';
import { C, ENEMIES, GameMap, MAPS } from '@gyusuji/shared';
import type { Dir } from '@gyusuji/shared';
import { DIR_ROW, HEROES, NPC_OF, OBJ_OF, v2Tile } from '../assets.js';
import { layout, onLayout } from '../layout.js';

const T = C.TILE;
const D: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** タイトル画面の背景：長編マップを主人公5人が隊列で歩き、カメラが追う */
export class TitleBackdrop {
  private route: { x: number; y: number; dir: Dir }[] = [];
  private party: Phaser.GameObjects.Sprite[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private logo!: Phaser.GameObjects.Container;
  private shade!: Phaser.GameObjects.Graphics;
  private step = 0;
  private off?: () => void;

  constructor(private scene: Phaser.Scene) {}

  build(): void {
    const s = this.scene;
    const map = new GameMap(MAPS[2]);
    const d = map.data;
    // 地形（縁を1px延長したタイルを使う）
    const blits: Record<string, Phaser.GameObjects.Blitter> = {};
    const put = (tex: string, x: number, y: number, depth: number) => {
      blits[tex + depth] ??= s.add.blitter(0, 0, `${tex}+`).setDepth(depth);
      blits[tex + depth].create(x * T - 1, y * T - 1);
    };
    for (let y = -8; y < d.height + 8; y++) {
      for (let x = -8; x < d.width + 8; x++) {
        const inside = x >= 0 && y >= 0 && x < d.width && y < d.height;
        const tex = inside ? v2Tile(d.terrain[y * d.width + x]) : 'sea';
        put(tex === 'sea' ? 'tiles/sea_0' : tex, x, y, -3);
      }
    }
    for (const p of d.path) {
      const tex = p.c === 'start' ? 'tiles/path_start' : p.c === 'branch' ? 'tiles/path_branch' : /boss/.test(p.c) ? 'tiles/path_boss' : 'tiles/path';
      put(tex, p.x, p.y, -2);
    }
    for (const o of d.objects) {
      const cx = o.x * T + T / 2;
      const cy = o.y * T + T / 2;
      if (NPC_OF[o.type]) s.add.sprite(cx, cy - 10, NPC_OF[o.type], DIR_ROW[o.dir ?? 'down']).setScale(0.9).setDepth(o.y * 10);
      else if (OBJ_OF[o.type]) s.add.image(cx, cy, OBJ_OF[o.type]).setScale(0.8).setDepth(o.y * 10);
      else if (ENEMIES[o.type]) {
        const e = ENEMIES[o.type];
        s.add.sprite(cx, cy - 10, e.sprite).setScale(e.boss ? 1.15 : 0.9).setDepth(o.y * 10).play(`${e.sprite}_idle`);
      }
    }
    // スタートからラスボスまでの道順（分岐は楽な道）
    let x = map.start.x;
    let y = map.start.y;
    let dir: Dir = map.startDir;
    for (let i = 0; i < 2000; i++) {
      this.route.push({ x, y, dir });
      if (map.cell(x, y)?.c === 'lastboss') break;
      const nd = map.nextDir(x, y, dir) ?? map.branchOptions(x, y, dir)[0].dir;
      x += D[nd][0];
      y += D[nd][1];
      dir = nd;
      if (!map.cell(x, y)) break;
    }
    // 主人公5人の隊列
    HEROES.forEach((k) => {
      this.shadows.push(s.add.ellipse(0, 0, 22, 7, 0x000000, 0.35));
      this.party.push(s.add.sprite(0, 0, k).setScale(0.9));
    });
    this.place(0);
    s.cameras.main.startFollow(this.party[0], true, 0.08, 0.08);
    s.time.addEvent({ delay: 420, loop: true, callback: () => this.walk() });

    // 文字を読みやすくする暗幕（画面固定）
    this.shade = s.add.graphics().setScrollFactor(0).setDepth(9000);
    this.logo = this.makeLogo();
    this.relayout();
    this.off = onLayout(() => this.relayout());
    s.events.once('shutdown', () => this.off?.());
  }

  private place(i: number) {
    this.party.forEach((sp, k) => {
      const r = this.route[Math.max(0, i - k) % this.route.length];
      sp.setPosition(r.x * T + T / 2, r.y * T + T / 2 - 10).setDepth(r.y * 10 + 5);
      sp.play(`${sp.texture.key}_${r.dir}`, true);
      this.shadows[k].setPosition(sp.x, sp.y + 18).setDepth(r.y * 10 + 1);
    });
  }

  private walk() {
    this.step = (this.step + 1) % this.route.length;
    this.party.forEach((sp, k) => {
      const r = this.route[Math.max(0, this.step - k)];
      sp.play(`${sp.texture.key}_${r.dir}`, true);
      this.scene.tweens.add({ targets: sp, x: r.x * T + T / 2, y: r.y * T + T / 2 - 10, duration: 400 });
      this.scene.tweens.add({ targets: this.shadows[k], x: r.x * T + T / 2, y: r.y * T + T / 2 + 8, duration: 400 });
      sp.setDepth(r.y * 10 + 5);
    });
    // ラスボスに着いたら最初から
    if (this.step >= this.route.length - 1) {
      this.step = 0;
      this.place(0);
    }
  }

  /** 金色の立体ロゴ（オリジナル） */
  private makeLogo(): Phaser.GameObjects.Container {
    const s = this.scene;
    const key = 'title-logo';
    if (!s.textures.exists(key)) {
      const W = 1200;
      const H = 300;
      const t = s.textures.createCanvas(key, W, H)!;
      const c = t.getContext();
      const font = '900 150px "Arial Black", "Hiragino Kaku Gothic ProN", sans-serif';
      c.font = font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const cx = W / 2;
      const cy = 120;
      // 奥行き（押し出し）
      for (let i = 14; i > 0; i--) {
        c.fillStyle = i > 10 ? '#1a0800' : '#5a2400';
        c.fillText('BEEF HUNTER', cx + i * 0.6, cy + i);
      }
      c.lineJoin = 'round';
      c.lineWidth = 18;
      c.strokeStyle = '#2a0e00';
      c.strokeText('BEEF HUNTER', cx, cy);
      const g = c.createLinearGradient(0, cy - 70, 0, cy + 70);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.35, '#ffd84a');
      g.addColorStop(0.55, '#f39a00');
      g.addColorStop(1, '#b84a00');
      c.fillStyle = g;
      c.fillText('BEEF HUNTER', cx, cy);
      // ハイライト
      c.save();
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(0, cy - 70, W, 34);
      c.restore();
      // サブタイトルのリボン
      const ry = 240;
      c.fillStyle = '#9a1020';
      c.beginPath();
      c.moveTo(300, ry - 34); c.lineTo(900, ry - 34); c.lineTo(940, ry); c.lineTo(900, ry + 34); c.lineTo(300, ry + 34); c.lineTo(260, ry);
      c.closePath();
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = '#ffd84a';
      c.stroke();
      c.font = 'bold 50px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
      c.fillStyle = '#ffffff';
      c.fillText('〜 す ご ろ く バ ト ル 〜', cx, ry + 2);
      t.refresh();
    }
    const img = s.add.image(0, 0, key);
    const glow = s.add.sprite(-260, -40, 'fx/gold').setScale(1.2).play({ key: 'fx/gold', repeat: -1 });
    const glow2 = s.add.sprite(270, 10, 'fx/gold').setScale(0.9).play({ key: 'fx/gold', repeat: -1, delay: 300 });
    const ct = s.add.container(0, 0, [img, glow, glow2]).setScrollFactor(0).setDepth(9500);
    s.tweens.add({ targets: ct, y: '+=6', yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
    return ct;
  }

  relayout(): void {
    const L = layout();
    const s = this.scene;
    s.cameras.main.setViewport(0, 0, L.w, L.h).setZoom(L.orient === 'port' ? 1.15 : 1);
    const zoom = s.cameras.main.zoom;
    // 画面固定オブジェクトはズームの影響を受けるので補正
    const fit = Math.min((L.w * 0.92) / 1200, (L.h * 0.3) / 300) / zoom;
    this.logo.setScale(fit);
    this.logo.setPosition(L.w / 2 / zoom + (L.w / 2) * (1 - 1 / zoom), (L.orient === 'port' ? L.h * 0.2 : L.h * 0.22) / zoom + (L.h / 2) * (1 - 1 / zoom));
    this.shade.clear();
    this.shade.fillStyle(0x000000, 0.35).fillRect(-L.w, -L.h, L.w * 3, L.h * 3);
  }

  setLogo(on: boolean): void {
    this.logo.setVisible(on);
    this.shade.setAlpha(on ? 0.6 : 1.6);
  }
}
