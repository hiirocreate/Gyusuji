import Phaser from 'phaser';
import { C, ENEMIES, GameMap, ITEMS, MAPS } from '@gyusuji/shared';
import type { Ask, GameEvent, PublicPlayer, PublicView } from '@gyusuji/shared';
import { Tracker } from '../achievements.js';
import { DIR_ROW, HEROES, NPC_OF, OBJ_OF, iconStyle } from '../assets.js';
import { bgm, se } from '../audio.js';
import { buildChatBar, closeLog, notify, say, setSender, system } from '../chat.js';
import { layout, onLayout } from '../layout.js';
import { net, type Host, type OnlineHost } from '../net.js';
import { update } from '../store.js';
import { $, centerWin, fieldUI, h, menuWin, type MenuItem } from '../ui.js';
import type { Battle } from './Battle.js';
import type { Overlay } from './Overlay.js';
import type { Status } from './Status.js';
import { fieldCam, frames, tween, wait } from './fieldcam.js';
import { drawShoreline, pathTexture, terrainTexture } from './classicTerrain.js';
import { itemHint } from '../itemHints.js';

const T = C.TILE;
/** キャラの描画位置はマス中心から上へ10px（SQU_CHR_OFFS_Y） */
const CHR_OFFS_Y = -10;
/** 隣接マスを隠さない小さなプリレンダ風の立ち姿。判定位置は従来どおり。 */
const HERO_SCALE = 0.72;
type Batch = { events: GameEvent[]; view: PublicView };
const ARROWS = ['up', 'down', 'left', 'right'];

/** 2秒ごとと、アプリが前面に戻った時に呼ぶ */
function watchAsk(f: () => void): () => void {
  const onVis = () => document.visibilityState === 'visible' && f();
  const id = window.setInterval(f, 2000);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}

export class Field extends Phaser.Scene {
  private host!: Host;
  private map!: GameMap;
  private view!: PublicView;
  private objSprites: (Phaser.GameObjects.Sprite | null)[] = [];
  private heroes: Phaser.GameObjects.Sprite[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private marks: Phaser.GameObjects.Sprite[][] = [];
  private cursor!: Phaser.GameObjects.Sprite;
  private queue: Batch[] = [];
  private busy = false;
  /** 最後に入力を送った時刻（応答待ちの判定用） */
  private sentAt = 0;
  private battle!: Battle;
  private overlay!: Overlay;
  private status!: Status;
  private tracker!: Tracker;
  private shownAsk = '';
  private streamedAsk = '';
  private pendingItemSlot: number | null = null;
  private pendingOptionIndex: number | null = null;
  private offs: (() => void)[] = [];
  private actor = 0;
  private hpWin: HTMLElement | null = null;
  private timerWin: HTMLElement | null = null;
  private pendingRespawn: { seat: number; x: number; y: number; dir: PublicPlayer['dir'] } | null = null;

  constructor() {
    super('Field');
  }

  init(data: { host: Host }) {
    this.host = data.host;
    this.queue = [];
    this.busy = false;
    this.shownAsk = '';
    this.streamedAsk = '';
    this.pendingRespawn = null;
  }

  create() {
    const host = this.host;
    this.view = host.view!;
    this.map = new GameMap(MAPS[host.settings.map]);
    this.tracker = new Tracker(host.mySeats);
    fieldCam(this, true);
    this.cameras.main.setBackgroundColor('#000000');
    this.drawMap();
    this.drawObjects();
    this.drawHeroes();

    this.scene.launch('Battle');
    this.scene.launch('Overlay');
    this.scene.launch('Status');
    this.battle = this.scene.get('Battle') as Battle;
    this.overlay = this.scene.get('Overlay') as Overlay;
    this.status = this.scene.get('Status') as Status;
    this.scene.bringToTop('Battle');
    this.scene.bringToTop('Overlay');

    buildChatBar();
    $('chatbar').style.display = 'flex';
    setSender(host.kind === 'online' ? (t, c) => host.sendChat(t, c) : null);
    const exitGame = () => {
      closeLog();
      if (host.kind === 'online') net.leave();
      this.scene.start('Menu');
    };
    window.addEventListener('game-exit', exitGame);

    this.offs = [
      host.batch.on((b) => { this.queue.push(b); void this.pump(); }),
      host.askChanged.on(() => this.refreshAsk(true)),
      host.kind === 'online' ? host.chat.on((m) => say({ from: m.from, text: m.text, color: m.color, system: !!m.system })) : () => {},
      host.kind === 'online' ? net.started.on((next) => this.scene.restart({ host: next })) : () => {},
      onLayout(() => this.time.delayedCall(0, () => { this.status?.draw(this.view, this.view.turn); this.lookAt(this.actor); this.positionDesc(); })),
      watchAsk(() => this.ensureAsk()),
    ];
    this.events.once('shutdown', () => {
      window.removeEventListener('game-exit', exitGame);
      this.offs.forEach((f) => f());
      fieldUI().replaceChildren();
      $('overlay').querySelectorAll('.result-window').forEach((el) => el.remove());
      $('overlay').querySelectorAll('.item-desc').forEach((el) => el.remove());
      this.descWin = null;
      closeLog();
      this.scene.stop('Battle');
      this.scene.stop('Overlay');
      this.scene.stop('Status');
    });
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickTimer() });
    bgm('field');
    this.time.delayedCall(0, () => {
      this.applyView(this.view);
      this.lookAt(this.view.turn);
      if ('start' in host) (host as unknown as { start(): void }).start();
      this.refreshAsk(true);
    });
  }

  // ───────── 描画 ─────────

  private drawMap() {
    const d = this.map.data;
    const v2 = d.terrainSet === 'v2';
    const blits: Record<string, Phaser.GameObjects.Blitter> = {};
    const blit = (tex: string, x: number, y: number) => {
      blits[tex] ??= this.add.blitter(0, 0, `${tex}+`).setDepth(-2);
      blits[tex].create(x * T - 1, y * T - 1);
    };
    // タイルは縁を1px延長した版を1pxずらして重ねる（拡大時の隙間対策）
    const sea0 = this.add.blitter(-1, -1, 'classic/sea_0+').setDepth(-3);
    const sea1 = this.add.blitter(-1, -1, 'classic/sea_1+').setDepth(-3).setVisible(false);
    // 画面外も海で埋める
    for (let y = -6; y < d.height + 6; y++) {
      for (let x = -6; x < d.width + 6; x++) {
        const inside = x >= 0 && y >= 0 && x < d.width && y < d.height;
        const t = inside ? d.terrain[y * d.width + x] : -1;
        const tex = !inside ? 'sea' : terrainTexture(t, v2, x, y);
        if (tex === 'sea') {
          sea0.create(x * T, y * T);
          sea1.create(x * T, y * T);
        } else blit(tex, x, y);
      }
    }
    this.time.addEvent({ delay: 700, loop: true, callback: () => { sea0.setVisible(!sea0.visible); sea1.setVisible(!sea1.visible); } });
    drawShoreline(this, d);
    for (const p of d.path) {
      const t = d.terrain[p.y * d.width + p.x];
      const onSea = v2 ? t === 0 : t === 3;
      const tex = pathTexture(p.c, onSea);
      blits[`p:${tex}`] ??= this.add.blitter(0, 0, `${tex}+`).setDepth(-1);
      blits[`p:${tex}`].create(p.x * T - 1, p.y * T - 1);
    }
  }

  /** y の小さい順に描く（下の物ほど手前） */
  private depthOf(y: number, extra = 0) {
    return y * 10 + extra;
  }

  private drawObjects() {
    this.objSprites = this.map.data.objects.map((o) => {
      const cx = o.x * T + T / 2;
      const cy = o.y * T + T / 2;
      let s: Phaser.GameObjects.Sprite | null = null;
      if (NPC_OF[o.type]) s = this.add.sprite(cx, cy + CHR_OFFS_Y, NPC_OF[o.type], DIR_ROW[o.dir ?? 'down']).setScale(HERO_SCALE);
      else if (OBJ_OF[o.type]) s = this.add.sprite(cx, cy, OBJ_OF[o.type]).setDisplaySize(38, 38);
      else if (ENEMIES[o.type]) {
        const e = ENEMIES[o.type];
        s = this.add.sprite(cx, cy + CHR_OFFS_Y, e.sprite).setScale(e.boss ? 1.15 : HERO_SCALE).play(`${e.sprite}_idle`);
        if (o.type === 'lastboss_king') s.setTint(0xff9090);
      }
      s?.setDepth(this.depthOf(o.y, 2));
      return s;
    });
  }

  private drawHeroes() {
    this.heroes = this.view.players.map((p) => this.add.sprite(0, 0, HEROES[p.charId], DIR_ROW[p.dir] * 4).setScale(HERO_SCALE));
    this.shadows = this.view.players.map(() => this.add.ellipse(0, 0, 22, 7, 0x000000, 0.35));
    this.marks = this.view.players.map(() => []);
    this.cursor = this.add.sprite(0, 0, 'fx/cursor').play('fx/cursor').setDepth(100000).setScale(0.6);
    this.view.players.forEach((p) => this.placeHero(p.seat, p.x, p.y));
  }

  private placeHero(seat: number, x: number, y: number) {
    const px = x * T + T / 2;
    const py = y * T + T / 2;
    this.heroes[seat].setPosition(px, py + CHR_OFFS_Y);
    this.shadows[seat].setPosition(px, py + 8);
    this.restack();
    this.syncMarks(seat);
  }

  /** 手番キャラは同じマスでも一番手前 */
  private restack() {
    this.heroes.forEach((s, i) => {
      const cy = Math.floor((s.y - CHR_OFFS_Y) / T);
      s.setDepth(this.depthOf(cy, i === this.view.turn ? 6 : 4));
      this.shadows[i].setDepth(this.depthOf(cy, 1)).setPosition(s.x, s.y - CHR_OFFS_Y + 8);
    });
    const cur = this.heroes[this.view.turn];
    if (cur) this.cursor.setPosition(cur.x, cur.y - 30);
  }

  private faceHero(seat: number, dir: string, walk: boolean) {
    const s = this.heroes[seat];
    const key = HEROES[this.view.players[seat].charId];
    if (walk) s.play(`${key}_${dir}`, true);
    else {
      s.stop();
      s.setFrame(DIR_ROW[dir as keyof typeof DIR_ROW] * 4);
    }
  }

  /** カメラは手番（イベント対象）キャラを中心に。対象が変わると画面を切り替える */
  private lookAt(seat: number) {
    const s = this.heroes[seat];
    if (!s) return;
    this.actor = seat;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.startFollow(s, true, 1, 1, 0, -CHR_OFFS_Y);
  }

  /** ワールド座標 → フィールド領域内座標（0〜280） */
  private toField(wx: number, wy: number) {
    const v = this.cameras.main.worldView;
    return { x: wx - v.x, y: wy - v.y };
  }

  // ───────── ウィンドウ（フィールド内部座標） ─────────

  private clearWins() {
    fieldUI().querySelectorAll('.askwin').forEach((e) => e.remove());
  }

  private addWin(el: HTMLElement) {
    el.classList.add('askwin');
    fieldUI().append(el);
    return el;
  }

  private descWin: HTMLElement | null = null;
  private positionDesc() {
    if (!this.descWin) return;
    const L = layout();
    const left = L.orient === 'land' ? L.field.x + L.field.size + 8 : 12;
    const top = L.orient === 'land' ? 164 : L.field.y + L.field.size + 12;
    this.descWin.style.left = `${left}px`;
    this.descWin.style.top = `${top}px`;
    this.descWin.style.width = `${L.w - left - 12}px`;
  }

  private showDesc(it: MenuItem | null) {
    this.descWin?.remove();
    this.descWin = null;
    if (!it?.desc) return;
    this.descWin = h('div', { class: 'win item-desc', 'aria-live': 'polite' },
      h('div', { class: 'item-desc-title' }, it.label), h('div', { class: 'item-desc-copy' }, it.desc));
    $('overlay').append(this.descWin);
    this.positionDesc();
    // A dedicated screen-space window keeps every selectable row unobstructed.
    this.descWin.style.pointerEvents = 'none';
  }

  private showItemHint(id: number, label: string, use = false) {
    this.showDesc({ label, desc: itemHint(id) });
    if (use) this.descWin?.append(h('div', { class: 'tap-instruction' }, '同じアイテムをもう一度タップすると使います'));
  }

  private showActionHint(label: string, hint: string, action: string) {
    this.showDesc({ label, desc: hint });
    this.descWin?.append(h('div', { class: 'tap-instruction' }, `もう一度タップすると${action}`));
  }

  private gotWin(icon: number | null, text: string, durationMs = 1500) {
    const el = centerWin(140, 140, icon ? h('span', { style: `${iconStyle(icon)};vertical-align:middle;margin-right:6px` }) : null, text);
    el.classList.add('notice-window');
    if (icon) el.querySelector('span')?.classList.add('win-icon');
    fieldUI().append(el);
    this.time.delayedCall(durationMs, () => el.remove());
  }

  /** 自分の番なのに操作ウィンドウが無い状態（復帰直後など）を検出して出し直す */
  private ensureAsk() {
    if (!this.sys.isActive() || this.busy || this.queue.length || this.view?.over) return;
    const ask = this.host.ask;
    if (!ask || !this.host.mySeats.has(ask.seat)) return;
    if (fieldUI().querySelector('.askwin, .turnpop')) return;
    // 入力を送った直後は応答を少し待つ（通信中にウィンドウを出し直さない）
    if (Date.now() - this.sentAt < 2500) return;
    // 送ったのに応答が無い：オンラインで切断中なら復帰を試みる
    if (this.host.kind === 'online' && !net.room) void net.resume();
    this.refreshAsk(true);
  }

  private refreshAsk(force = false) {
    if (this.busy || this.queue.length) return;
    const ask = this.host.ask;
    const key = JSON.stringify(ask);
    if (!force && key === this.shownAsk) return;
    if (key !== this.shownAsk) {
      this.pendingOptionIndex = null;
      this.pendingItemSlot = null;
    }
    this.shownAsk = key;
    this.clearWins();
    this.showDesc(null);
    if (this.host.kind === 'online' && (this.host as OnlineHost).proxied) {
      this.addWin(menuWin([{ label: 'CPUが代行中', disabled: true }, { label: '操作に戻る', on: () => (this.host as OnlineHost).resume() }], 'left:16px;top:16px'));
      return;
    }
    if (!ask || this.view.over) return;
    // 問いかけはシステムメッセージとして流す
    if (ask.kind === 'select' && this.streamedAsk !== key) system(ask.title);
    this.streamedAsk = key;
    if (!this.host.mySeats.has(ask.seat)) {
      this.host.idle();
      return;
    }
    closeLog(); // 手番が来たらログは自動で閉じる
    const send = (inp: Parameters<Host['send']>[0]) => {
      try { se('select'); } catch { /* 音が鳴らせなくても入力は送る */ }
      this.pendingOptionIndex = null;
      this.pendingItemSlot = null;
      this.clearWins();
      this.showDesc(null);
      this.sentAt = Date.now();
      try {
        this.host.send(inp);
      } catch (err) {
        console.error(err);
        this.refreshAsk(true); // 送れなかったらウィンドウを出し直す
      }
    };
    const p = this.view.players[ask.seat];
    if (ask.kind === 'action') {
      this.lookAt(ask.seat);
      this.addWin(menuWin([
        { label: '移動', on: () => send({ type: 'roll' }) },
        { label: 'アイテム', on: () => this.itemList(p, ask.items, ask.seat, (slot) => send({ type: 'useItem', slot })) },
      ], 'left:16px;top:16px'));
    } else if (ask.kind === 'battle') {
      this.addWin(menuWin([
        { label: 'たたかう', on: () => send({ type: 'battleAttack' }) },
        { label: 'アイテム', on: () => this.itemList(p, ask.items, ask.seat, (slot) => send({ type: 'useItem', slot })) },
      ], 'left:16px;top:200px'));
    } else {
      const needsTwoTaps = (i: number) => {
        const o = ask.options[i];
        const treasure = ask.sub === 'treasure' && o.label.includes('開ける');
        const item = !!o.value && !!ITEMS[o.value] && ['shop', 'smith', 'shoes', 'qbox'].includes(ask.sub);
        return !o.disabled && (item || treasure);
      };
      const rows = ask.options.map((o, i) => ({
        label: o.label, disabled: o.disabled,
        icon: needsTwoTaps(i) ? iconStyle(o.value!) : undefined,
        desc: needsTwoTaps(i) ? itemHint(o.value!) : undefined,
        on: () => {
          if (needsTwoTaps(i) && this.pendingOptionIndex !== i) {
            this.pendingOptionIndex = i;
            win.querySelectorAll('.it').forEach((el) => el.classList.remove('confirm-tap'));
            win.querySelectorAll('.it')[i]?.classList.add('confirm-tap');
            if (o.value && ITEMS[o.value]) this.showItemHint(o.value, o.label, true);
            else this.showActionHint(o.label, '中には思いがけないお宝が入っているかも。', '宝箱を開けます');
            return;
          }
          send({ type: 'select', index: i });
        },
      }));
      const win = this.addWin(menuWin(rows, 'left:16px;top:16px;max-height:248px;overflow-y:auto', (it) => this.showDesc(it)));
      if (this.pendingOptionIndex !== null) win.querySelectorAll('.it')[this.pendingOptionIndex]?.classList.add('confirm-tap');
      // 問いかけ文は対象プレイヤーのウィンドウ先頭に表示（流さない）
      win.prepend(h('div', { style: 'padding:0 11px;line-height:22px;color:#ffe650;white-space:normal;max-width:240px' }, ask.title));
    }
  }

  private itemList(p: PublicPlayer, usable: number[], seat: number, onUse: (slot: number) => void) {
    this.clearWins();
    const items: MenuItem[] = p.items.map((id, slot) => ({
      label: ITEMS[id].name + (ITEMS[id].mp ? `（MP${ITEMS[id].mp}）` : ''),
      icon: iconStyle(id), desc: itemHint(id), disabled: !usable.includes(slot), on: () => {
        if (this.pendingItemSlot !== slot) {
          this.pendingItemSlot = slot;
          win.querySelectorAll('.it').forEach((el) => el.classList.remove('confirm-tap'));
          win.querySelectorAll('.it')[slot]?.classList.add('confirm-tap');
          this.showItemHint(id, ITEMS[id].name, true);
          return;
        }
        this.pendingItemSlot = null;
        this.overlay.itemUse(id, this.heroes[seat].x, this.heroes[seat].y - 12);
        onUse(slot);
      },
    }));
    items.push({ label: 'もどる', on: () => { this.pendingItemSlot = null; this.refreshAsk(true); } });
    const win = this.addWin(menuWin(items, 'left:16px;top:16px;max-height:248px;overflow-y:auto', (it) => this.showDesc(it)));
    if (this.pendingItemSlot !== null) win.querySelectorAll('.it')[this.pendingItemSlot]?.classList.add('confirm-tap');
  }

  private tickTimer() {
    const ask = this.host.ask;
    const dl = this.host.deadline;
    const left = Math.ceil((dl - Date.now()) / 1000);
    const show = !!ask && !!dl && this.host.mySeats.has(ask.seat) && !this.busy && left >= 0 && left <= this.host.settings.timeLimit - C.DRAW_LIMIT_TIME;
    if (!show) {
      this.timerWin?.remove();
      this.timerWin = null;
      return;
    }
    const y = this.battle.active ? 32 : 240;
    const text = `あと${left}秒でターン終了`;
    if (!this.timerWin) this.timerWin = fieldUI().appendChild(centerWin(140, y, text));
    this.timerWin.textContent = text;
    this.timerWin.style.top = `${y}px`;
  }

  // ───────── 演出 ─────────

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    this.clearWins();
    this.showDesc(null);
    this.shownAsk = '';
    while (this.queue.length) {
      const b = this.queue.shift()!;
      this.sentAt = 0; // 応答が来た
      for (const e of b.events) {
        try {
          // 演出が何らかの理由で終わらなくても（アプリの一時停止等）操作不能にならないよう上限を設ける。
          // 手番ポップアップはプレイヤーの操作待ちなので除く。
          const run = this.play(e, b.view);
          await (e.t === 'turn' ? run : Promise.race([run, new Promise<void>((r) => setTimeout(r, 6000))]));
        } catch (err) {
          console.error(err);
        }
      }
      this.applyView(b.view);
      this.tracker.feed(b.events, b.view);
    }
    this.busy = false;
    this.refreshAsk(true);
  }

  private applyView(v: PublicView) {
    this.view = v;
    v.players.forEach((p) => {
      const s = this.heroes[p.seat];
      if (!s) return;
      this.placeHero(p.seat, p.x, p.y);
      this.faceHero(p.seat, p.dir, false);
      s.setAlpha(1).setAngle(0);
      this.setMarks(p);
    });
    const removed = new Set(v.removed);
    this.objSprites.forEach((s, i) => s?.setVisible(!removed.has(i)));
    this.restack();
    this.status.draw(v, v.turn);
  }

  private setMarks(p: PublicPlayer) {
    const list = this.marks[p.seat];
    const s = this.heroes[p.seat];
    const sync = (texture: string, active: boolean, x: number, y: number, scale: number) => {
      const index = list.findIndex((mark) => mark.texture.key === texture);
      if (!active) {
        if (index >= 0) list.splice(index, 1)[0].destroy();
        return;
      }
      if (index >= 0) {
        list[index].setPosition(x, y).setDepth(99999).setScale(scale);
        return;
      }
      list.push(this.add.sprite(x, y, texture).play(texture).setScale(scale).setDepth(99999));
    };
    sync('fx/piyo', p.stun > 0, s.x, s.y - 22, 0.5);
    sync('fx/curse', p.cursed, s.x + 10, s.y - 18, 0.35);
  }

  private syncMarks(seat: number) {
    const s = this.heroes[seat];
    for (const mark of this.marks[seat]) {
      if (mark.texture.key === 'fx/piyo') mark.setPosition(s.x, s.y - 22);
      else if (mark.texture.key === 'fx/curse') mark.setPosition(s.x + 10, s.y - 18);
    }
  }

  private fxAt(name: string, wx: number, wy: number, scale = 0.7) {
    if (!this.textures.exists(`fx/${name}`)) return;
    const s = this.add.sprite(wx, wy, `fx/${name}`).setDepth(99998).setScale(scale).play(`fx/${name}`);
    s.once('animationcomplete', () => s.destroy());
    // ループするアニメ（ひよこ等）は完了しないので一定時間で消す（状態表示は setMarks が担当）
    if (s.anims.currentAnim?.repeat === -1) this.time.delayedCall(frames(24), () => s.destroy());
  }

  private popAt(seat: number, sheet: string, value: number) {
    if (this.battle.active && seat === this.view.battle?.seat) {
      this.overlay.pop(sheet, value, 200, 170);
      return;
    }
    const s = this.heroes[seat];
    if (!s) return;
    const p = this.toField(s.x, s.y - 20);
    this.overlay.pop(sheet, value, p.x, p.y);
  }

  private name(seat: number) {
    return this.view.players[seat]?.name ?? '?';
  }

  private updateEnemyHp(hp: number, max: number) {
    // 敵HP表示（UI_LAYOUT §6 / 図：左上(24,128) 100×16）
    if (!this.hpWin) this.hpWin = fieldUI().appendChild(h('div', { class: 'win', style: 'left:24px;top:128px;width:100px;height:16px;font-size:11px;line-height:14px;padding:0 6px' }));
    this.hpWin.textContent = `敵HP ${Math.max(0, hp)}/${max}`;
  }

  private async play(e: GameEvent, end: PublicView): Promise<void> {
    const inBattle = this.battle.active;
    switch (e.t) {
      case 'turn':
        this.view = { ...this.view, turn: e.seat, round: e.round };
        if (end.players[e.seat]) this.setMarks(end.players[e.seat]);
        this.restack();
        this.status.draw(this.view, e.seat);
        this.lookAt(e.seat);
        if (this.host.mySeats.has(e.seat)) {
          // 自分の手番は明確な行動開始ボタンで知らせる。
          system(`${this.name(e.seat)}の番です`);
          se('turn');
          await this.turnPopup(`${this.name(e.seat)}の番です`);
        } else {
          // 対象外のプレイヤーにはコメントを流して通知
          notify(`${this.name(e.seat)}の番です`);
          await wait(this, frames(6));
        }
        return;
      case 'skip':
        se('piyo');
        await wait(this, frames(16));
        if (end.players[e.seat]) this.setMarks(end.players[e.seat]); // 行動不能が明けたらひよこを外す
        return;
      case 'dice':
        if (inBattle && (e.purpose === 'attack' || e.purpose === 'enemy' || e.purpose === 'chaos')) await this.battle.attack(e.purpose !== 'enemy');
        await this.overlay.roll(e.values, e.ichi, e.purpose === 'chaos');
        return;
      case 'move': {
        const seat = e.seat;
        const s = this.heroes[seat];
        if (end.players[seat]) this.setMarks(end.players[seat]);
        this.lookAt(seat);
        this.cursor.setVisible(false);
        let px = Math.floor(s.x / T);
        let py = Math.floor((s.y - CHR_OFFS_Y) / T);
        for (const c of e.cells) {
          const dir = c.x > px ? 'right' : c.x < px ? 'left' : c.y > py ? 'down' : 'up';
          this.faceHero(seat, dir, true);
          // 1マス 5 フレームの直線補間
          await tween(this, { targets: s, x: c.x * T + T / 2, y: c.y * T + T / 2 + CHR_OFFS_Y, duration: frames(5) });
          this.shadows[seat].setPosition(s.x, s.y - CHR_OFFS_Y + 8);
          this.syncMarks(seat);
          this.overlay.stepFx(s.x, s.y + 10);
          s.setDepth(this.depthOf(c.y, 6));
          se('step');
          px = c.x;
          py = c.y;
          // 歩き終わるたびにそのマスの矢印方向へ向きを変える
          const arrow = this.map.cell(c.x, c.y)?.c ?? '';
          this.faceHero(seat, ARROWS.includes(arrow) ? arrow : dir, true);
        }
        s.stop();
        this.faceHero(seat, end.players[seat]?.dir ?? 'down', false);
        this.cursor.setVisible(true);
        this.restack();
        return;
      }
      case 'msg':
        system(e.text);
        await wait(this, frames(8));
        return;
      case 'damage':
        se('damage');
        this.popAt(e.seat, 'num/damage', e.amount);
        if (!inBattle) this.cameras.main.shake(120, 0.01);
        await wait(this, frames(8));
        return;
      case 'heal':
        se('heal');
        this.popAt(e.seat, 'num/heal', e.amount);
        await wait(this, frames(8));
        return;
      case 'gold':
        if (e.amount > 0) {
          se('gold');
          this.popAt(e.seat, 'num/gold', e.amount);
          if (this.host.mySeats.has(e.seat)) this.gotWin(null, `${e.amount}G 手に入れた！`);
        }
        await wait(this, frames(6));
        return;
      case 'getItem':
        se('get');
        system(`${this.name(e.seat)}は${ITEMS[e.item].name}を手に入れた！`);
        this.gotWin(e.item, `${this.name(e.seat)}は${ITEMS[e.item].name}を手に入れた！`);
        await wait(this, 1500);
        return;
      case 'itemUse':
        this.gotWin(e.item, `${this.name(e.seat)}は${ITEMS[e.item].name}を使った！`);
        await wait(this, 1500);
        return;
      case 'loseItem':
        return;
      case 'objRemove': {
        const s = this.objSprites[e.idx];
        if (s) this.tweens.add({ targets: s, alpha: 0, duration: frames(6), onComplete: () => s.setVisible(false).setAlpha(1) });
        return;
      }
      case 'chestOpen':
        this.objSprites[e.idx]?.setTexture('obj/chest_open-hd');
        await wait(this, frames(8));
        return;
      case 'fx': {
        if (inBattle) return;
        const s = e.seat !== undefined ? this.heroes[e.seat] : null;
        const x = s ? s.x : (e.x ?? 0) * T + T / 2;
        const y = s ? s.y : (e.y ?? 0) * T + T / 2;
        if (e.name === 'explosion') se('explode');
        if (e.name === 'warp') se('warp');
        this.fxAt(e.name, x, y);
        await wait(this, frames(10));
        return;
      }
      case 'battleStart': {
        const enemy = ENEMIES[e.enemy];
        const hp = this.view.enemyHp[e.obj] ?? enemy.hp;
        bgm(enemy.boss ? 'boss' : 'battle');
        this.clearWins();
        await this.overlay.encount();
        this.view = { ...this.view, battle: { seat: e.seat, obj: e.obj, enemy: e.enemy, hp, maxHp: enemy.hp, phase2: false } };
        this.battle.begin(e.enemy, hp, this.view.players[e.seat]);
        this.updateEnemyHp(hp, enemy.hp);
        return;
      }
      case 'battleHit':
        if (e.fx !== 'hit') await this.battle.magic(e.fx);
        if (e.target === 'enemy') {
          this.battle.hp -= e.amount;
          this.updateEnemyHp(this.battle.hp, this.battle.maxHp);
          this.overlay.pop('num/damage', e.amount, 80, 50);
          se('hit');
          await wait(this, frames(12));
        }
        return;
      case 'phase2':
        await this.battle.phase2();
        return;
      case 'battleEnd':
        await this.battle.end(e.result);
        this.hpWin?.remove();
        this.hpWin = null;
        this.view = { ...this.view, battle: null };
        bgm('field');
        if (this.pendingRespawn) {
          const r = this.pendingRespawn;
          this.pendingRespawn = null;
          await this.animateRespawn(r.seat, r);
        }
        return;
      case 'death':
        se('lose');
        if (!inBattle) await tween(this, { targets: this.heroes[e.seat], alpha: 0.2, angle: 90, duration: frames(12) });
        return;
      case 'revive':
        this.fxAt('heal', this.heroes[e.seat].x, this.heroes[e.seat].y);
        await wait(this, frames(10));
        return;
      case 'respawn': {
        const player = end.players[e.seat];
        if (!player) return;
        this.setMarks(player);
        const r = player.respawn;
        const target = { seat: e.seat, x: r.x, y: r.y, dir: r.dir };
        if (inBattle) this.pendingRespawn = target;
        else await this.animateRespawn(e.seat, target);
        return;
      }
      case 'warp': {
        const p = end.players[e.seat];
        se('warp');
        this.fxAt('warp', this.heroes[e.seat].x, this.heroes[e.seat].y);
        await wait(this, frames(10));
        if (p) this.placeHero(e.seat, p.x, p.y);
        this.lookAt(e.seat);
        this.fxAt('warp', this.heroes[e.seat].x, this.heroes[e.seat].y);
        await wait(this, frames(10));
        return;
      }
      case 'swap': {
        const a = this.heroes[e.a];
        const b = this.heroes[e.b];
        se('swap');
        this.lookAt(e.a);
        this.fxAt('swap', a.x, a.y);
        await wait(this, frames(12));
        const ax = a.x;
        const ay = a.y;
        a.setPosition(b.x, b.y);
        b.setPosition(ax, ay);
        this.restack();
        this.lookAt(e.a);
        this.fxAt('swap', a.x, a.y);
        await wait(this, frames(12));
        return;
      }
      case 'paru':
        this.lookAt(e.seat);
        await this.overlay.paru(e.kiwami);
        return;
      case 'stun':
        se('piyo');
        this.lookAt(e.seat);
        this.fxAt('piyo', this.heroes[e.seat].x, this.heroes[e.seat].y - 20);
        await wait(this, frames(10));
        return;
      case 'curse':
        se('curse');
        this.fxAt('curse', this.heroes[e.seat].x, this.heroes[e.seat].y);
        await wait(this, frames(8));
        return;
      case 'gameOver':
        bgm('win');
        se('win');
        this.tracker.gameOver(e.winner, this.host.kind !== 'replay' && !this.host.spectator);
        if (this.host.tutorial) update((s) => (s.tutorialDone = true));
        this.applyView(end);
        this.result(e.winner);
        return;
    }
  }

  /** 手番ポップアップ：〇を押すまで待つ */
  private turnPopup(text: string): Promise<void> {
    return new Promise((resolve) => {
      const close = () => {
        el.remove();
        resolve();
      };
      const el = centerWin(140, 140,
        h('div', { style: 'font-size:16px;margin-bottom:6px;text-align:center' }, text),
        h('div', { style: 'text-align:center' }, h('button', {
          class: 'okbtn', onclick: () => { se('select'); close(); },
        }, h('span', { class: 'turn-play-icon' }, '▶'), ' 行動をはじめる')));
      el.classList.add('turnpop');
      fieldUI().append(el);
      // 画面の作り直し等でポップアップが消えた場合は待ち続けない
      const guard = window.setInterval(() => {
        if (el.isConnected) return;
        window.clearInterval(guard);
        resolve();
      }, 1000);
    });
  }

  private async animateRespawn(seat: number, target: { x: number; y: number; dir: PublicPlayer['dir'] }) {
    const hero = this.heroes[seat];
    if (!hero) return;
    const x = target.x * T + T / 2;
    const y = target.y * T + T / 2 + CHR_OFFS_Y;
    const dx = x - hero.x;
    const dy = y - hero.y;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
    this.lookAt(seat);
    this.faceHero(seat, direction, true);
    hero.setVisible(true).setAlpha(0.35).setAngle(0);
    se('warp');
    this.fxAt('warp', hero.x, hero.y);
    await tween(this, {
      targets: hero, x, y, alpha: 1, angle: 0, duration: frames(24), ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.shadows[seat].setPosition(hero.x, hero.y - CHR_OFFS_Y + 8);
        this.syncMarks(seat);
        this.restack();
      },
    });
    hero.stop();
    this.faceHero(seat, target.dir, false);
    this.placeHero(seat, target.x, target.y);
    this.fxAt('warp', hero.x, hero.y);
    await wait(this, frames(8));
  }

  /** 結果（UI_LAYOUT §5）：閉じるとゲーム終了 */
  private result(winner: number) {
    let resultWindow: HTMLElement | null = null;
    const close = () => {
      resultWindow?.remove();
      resultWindow = null;
      if (this.host.kind === 'online') net.leave();
      this.scene.start('Menu');
    };
    const actions: HTMLElement[] = [];
    if (this.host.kind === 'online') {
      const rematch = h('button', { type: 'button', class: 'result-action', onclick: () => {
        if (rematch.disabled) return;
        rematch.disabled = true;
        rematch.textContent = '相手の再戦を待っています…';
        net.send('rematch');
      } }, 'リマッチ');
      actions.push(rematch);
    }
    actions.push(h('button', { type: 'button', class: 'result-action', onclick: async () => {
        const d = await this.host.replayData();
        if (d) h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })), download: `beefhunter_replay_${Date.now()}.json` }).click();
      } }, 'リプレイ保存'));
    actions.push(h('button', { type: 'button', class: 'result-action', onclick: close }, '閉じる'));
    resultWindow = h('div', { class: 'win result-window', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ゲーム結果' },
      h('div', { class: 'result-title' }, `優勝者は ${this.name(winner)} さんです！`),
      h('div', { class: 'result-copy' }, 'このウィンドウを閉じるとゲームを終了します'),
      h('div', { class: 'result-actions' }, ...actions));
    $('overlay').append(resultWindow);
  }
}
