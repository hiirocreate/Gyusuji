import Phaser from 'phaser';
import { C, ENEMIES, GameMap, MAPS } from '@gyusuji/shared';
import type { Dir } from '@gyusuji/shared';
import { DIR_ROW, HEROES, NPC_OF, OBJ_OF } from '../assets.js';
import { drawShoreline, pathTexture, terrainTexture } from './classicTerrain.js';
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
    const sea0 = s.add.blitter(-1, -1, 'classic/sea_0+').setDepth(-3);
    const sea1 = s.add.blitter(-1, -1, 'classic/sea_1+').setDepth(-3).setVisible(false);
    for (let y = -8; y < d.height + 8; y++) {
      for (let x = -8; x < d.width + 8; x++) {
        const inside = x >= 0 && y >= 0 && x < d.width && y < d.height;
        const tex = inside ? terrainTexture(d.terrain[y * d.width + x], d.terrainSet === 'v2', x, y) : 'sea';
        if (tex === 'sea') {
          sea0.create(x * T, y * T);
          sea1.create(x * T, y * T);
        } else put(tex, x, y, -2);
      }
    }
    s.time.addEvent({ delay: 700, loop: true, callback: () => { sea0.setVisible(!sea0.visible); sea1.setVisible(!sea1.visible); } });
    drawShoreline(s, d);
    for (const p of d.path) {
      const t = d.terrain[p.y * d.width + p.x];
      const onSea = d.terrainSet === 'v2' ? t === 0 : t === 3;
      put(pathTexture(p.c, onSea), p.x, p.y, -1);
    }
    for (const o of d.objects) {
      const cx = o.x * T + T / 2;
      const cy = o.y * T + T / 2;
      if (NPC_OF[o.type]) s.add.sprite(cx, cy - 10, NPC_OF[o.type], DIR_ROW[o.dir ?? 'down']).setScale(0.72).setDepth(o.y * 10);
      else if (OBJ_OF[o.type]) s.add.image(cx, cy, OBJ_OF[o.type]).setDisplaySize(38, 38).setDepth(o.y * 10);
      else if (ENEMIES[o.type]) {
        const e = ENEMIES[o.type];
        s.add.sprite(cx, cy - 10, e.sprite).setScale(e.boss ? 1.15 : 0.72).setDepth(o.y * 10).play(`${e.sprite}_idle`);
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
      this.party.push(s.add.sprite(0, 0, k).setScale(0.72));
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

  /** カラフルな牛すじ紋章と和題を組み合わせたポップRPGロゴ */
  private makeLogo(): Phaser.GameObjects.Container {
    const s = this.scene;
    const key = 'title-logo';
    if (!s.textures.exists(key)) {
      const W = 1200;
      const H = 320;
      const t = s.textures.createCanvas(key, W, H)!;
      const c = t.getContext();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const cx = W / 2;
      c.fillStyle = 'rgba(14,18,42,.58)';
      c.beginPath(); c.roundRect(96, 31, 1040, 256, 35); c.fill();
      const gradient = c.createLinearGradient(80, 30, 80, 286);
      gradient.addColorStop(0, '#54427d'); gradient.addColorStop(.52, '#342d58'); gradient.addColorStop(1, '#252947');
      c.fillStyle = gradient; c.beginPath(); c.roundRect(78, 18, 1040, 256, 35); c.fill();
      c.lineWidth = 11; c.strokeStyle = '#6e452d'; c.stroke();
      c.lineWidth = 6; c.strokeStyle = '#ffd966'; c.stroke();
      c.beginPath(); c.roundRect(92, 32, 1012, 228, 25); c.lineWidth = 2.5; c.strokeStyle = '#fff1c3'; c.stroke();
      // Gold corner studs and slim enamel rules give the sign readable, layered RPG framing.
      for (const x of [111,1085]) for (const y of [50,242]) {
        c.beginPath(); c.arc(x,y,7,0,Math.PI*2); c.fillStyle='#ffe698'; c.fill();
        c.beginPath(); c.arc(x-2,y-2,2.2,0,Math.PI*2); c.fillStyle='#fff9dd'; c.fill();
      }
      c.font = '900 106px "Arial Black", "Noto Sans JP", sans-serif';
      c.textAlign='center'; c.lineJoin='round';
      c.lineWidth=18; c.strokeStyle='#28243f'; c.strokeText('牛すじハンター',525,130);
      c.lineWidth=9; c.strokeStyle='#eb6849'; c.strokeText('牛すじハンター',525,130);
      const titleGrad=c.createLinearGradient(0,78,0,182);
      titleGrad.addColorStop(0,'#fff9df'); titleGrad.addColorStop(.48,'#ffeba3'); titleGrad.addColorStop(1,'#ffd26a');
      c.fillStyle=titleGrad; c.fillText('牛すじハンター',525,130);
      c.font = '900 38px "Arial Black", sans-serif'; c.letterSpacing='5px';
      c.fillStyle='#9ef2e3'; c.fillText('BEEF  HUNTER',525,204); c.letterSpacing='0px';
      c.font = 'bold 31px sans-serif'; c.fillStyle='#fff9e5';
      c.fillText('サイコロを転がして、お宝をつかめ！',525,244);
      c.beginPath(); c.roundRect(153,52,128,32,14); c.fillStyle='#f5a83e'; c.fill();
      c.font='bold 20px sans-serif'; c.fillStyle='#38274c'; c.fillText('冒険RPG',217,73);
      t.refresh();
    }
    const img = s.add.image(0, 0, key);
    const crest = s.add.image(430, 10, 'brand/beef-rune').setDisplaySize(160, 160);
    const ct = s.add.container(0, 0, [img, crest]).setScrollFactor(0).setDepth(9500);
    s.tweens.add({ targets: ct, y: '+=2', yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });
    return ct;
  }

  relayout(): void {
    const L = layout();
    const s = this.scene;
    s.cameras.main.setViewport(0, 0, L.w, L.h).setZoom(L.orient === 'port' ? 1.15 : 1);
    const zoom = s.cameras.main.zoom;
    // 画面固定オブジェクトはズームの影響を受けるので補正
    const fit = Math.min((L.w * 0.97) / 1200, (L.h * 0.36) / 320) / zoom;
    this.logo.setScale(fit);
    this.logo.setPosition(L.w / 2 / zoom + (L.w / 2) * (1 - 1 / zoom), (L.orient === 'port' ? L.h * 0.19 : L.h * 0.22) / zoom + (L.h / 2) * (1 - 1 / zoom));
    this.shade.clear();
    this.shade.fillStyle(0x000000, 0.35).fillRect(-L.w, -L.h, L.w * 3, L.h * 3);
  }

  setLogo(on: boolean): void {
    this.logo.setVisible(on);
    this.shade.setAlpha(on ? 0.6 : 1.6);
  }
}
