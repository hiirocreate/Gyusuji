import Phaser from 'phaser';
import { C, CHARS, CHAT_COLORS, ENEMIES, GameMap, ITEMS, MAPS, STAMPS } from '@gyusuji/shared';
import type { Ask, GameEvent, PublicPlayer, PublicView } from '@gyusuji/shared';
import { Tracker, unlock } from '../achievements.js';
import { DIR_ROW, HEROES, NPC_OF, OBJ_OF, classicTile, iconStyle, v2Tile } from '../assets.js';
import { bgm, se } from '../audio.js';
import type { Host, OnlineHost } from '../net.js';
import { store, update } from '../store.js';
import { clearUI, h, longPress, modal, mount, toast } from '../ui.js';
import type { Battle } from './Battle.js';
import type { Hud } from './Hud.js';

const T = C.TILE;
type Batch = { events: GameEvent[]; view: PublicView };

const TUTORIAL: Record<string, string> = {
  action: '「さいころ」で進みます。アイテムを使うとそのターンは終了です。',
  battle: '戦闘です。「たたかう」でダイスを振って攻撃！ 逃げることはできません。',
  shop: '商人からはアイテムを1つ買えます。品揃えは店ごとに違います。',
  treasure: '宝箱は運が低いと爆発しやすいので注意！',
  branch: '分かれ道です。楽な道と険しい道を選べます。',
  inn: '宿屋ではHPとMPが全回復します。',
  qbox: '?ボックスでは妨害アイテムがもらえます。',
};

export class Field extends Phaser.Scene {
  private host!: Host;
  private map!: GameMap;
  private view!: PublicView;
  private objSprites: (Phaser.GameObjects.Sprite | null)[] = [];
  private heroes: Phaser.GameObjects.Sprite[] = [];
  private marks: Phaser.GameObjects.Sprite[][] = [];
  private cursor!: Phaser.GameObjects.Sprite;
  private queue: Batch[] = [];
  private busy = false;
  private battle!: Battle;
  private hud!: Hud;
  private tracker!: Tracker;
  private ui!: { status: HTMLElement; log: HTMLElement; dialog: HTMLElement; timer: HTMLElement; chat: HTMLElement };
  private logLines: string[] = [];
  private shownAsk: Ask | null = null;
  private offs: (() => void)[] = [];
  private hinted = new Set<string>();
  private following: number = -1;

  constructor() {
    super('Field');
  }

  init(data: { host: Host }) {
    this.host = data.host;
    this.queue = [];
    this.busy = false;
    this.shownAsk = null;
    this.logLines = [];
    this.hinted.clear();
  }

  create() {
    const host = this.host;
    this.view = host.view!;
    this.map = new GameMap(MAPS[host.settings.map]);
    this.tracker = new Tracker(host.mySeats);
    this.cameras.main.setViewport(0, 0, 640, 480).setBackgroundColor('#1b4fa0');
    this.cameras.main.setBounds(-80, -80, this.map.data.width * T + 160, this.map.data.height * T + 160);
    this.drawMap();
    this.drawObjects();
    this.drawHeroes();
    this.setupInput();
    this.buildUI();

    this.scene.launch('Battle');
    this.scene.launch('Hud');
    this.battle = this.scene.get('Battle') as Battle;
    this.hud = this.scene.get('Hud') as Hud;
    this.scene.bringToTop('Battle');
    this.scene.bringToTop('Hud');

    this.offs = [
      host.batch.on((b) => { this.queue.push(b); void this.pump(); }),
      host.askChanged.on(() => this.refreshAsk(true)),
      host.chat.on((m) => this.addChat(m.system ? `※ ${m.text}` : `${m.from}：${m.text}`, m.color)),
      host.stamp.on((m) => this.showStamp(m.seat, m.id, m.from)),
    ];
    this.events.once('shutdown', () => {
      this.offs.forEach((f) => f());
      this.scene.stop('Battle');
      this.scene.stop('Hud');
    });
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickTimer() });
    bgm('field');
    this.applyView(this.view);
    this.focus(this.view.turn, true);
    if ('start' in host) (host as unknown as { start(): void }).start();
    this.refreshAsk();
  }

  // ───────── 描画 ─────────

  private drawMap() {
    const d = this.map.data;
    const v2 = d.terrainSet === 'v2';
    const blits: Record<string, Phaser.GameObjects.Blitter> = {};
    const blit = (tex: string, x: number, y: number) => {
      blits[tex] ??= this.add.blitter(0, 0, tex);
      blits[tex].create(x * T, y * T);
    };
    const seaCells: [number, number][] = [];
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const t = d.terrain[y * d.width + x];
        const tex = v2 ? v2Tile(t) : classicTile(t);
        if (tex === 'sea') seaCells.push([x, y]);
        else blit(tex, x, y);
      }
    }
    const sea0 = this.add.blitter(0, 0, 'tiles/sea_0');
    const sea1 = this.add.blitter(0, 0, 'tiles/sea_1').setVisible(false);
    for (const [x, y] of seaCells) {
      sea0.create(x * T, y * T);
      sea1.create(x * T, y * T);
    }
    sea0.setDepth(-2);
    sea1.setDepth(-2);
    this.time.addEvent({ delay: 700, loop: true, callback: () => { sea0.setVisible(!sea0.visible); sea1.setVisible(!sea1.visible); } });
    for (const p of d.path) {
      const t = d.terrain[p.y * d.width + p.x];
      const onSea = v2 ? t === 0 : t === 3;
      const tex = p.c === 'start' ? 'tiles/path_start' : p.c === 'branch' ? 'tiles/path_branch' : p.c === 'lastboss' ? 'tiles/path_lastboss'
        : /^boss/.test(p.c) ? 'tiles/path_boss' : onSea ? 'tiles/bridge' : 'tiles/path';
      blit(tex, p.x, p.y);
    }
    Object.values(blits).forEach((b) => b.setDepth(b.texture.key.includes('path') || b.texture.key.includes('bridge') ? -1 : -1.5));
  }

  private drawObjects() {
    this.objSprites = this.map.data.objects.map((o) => {
      const cx = o.x * T + T / 2;
      const cy = o.y * T + T / 2;
      let s: Phaser.GameObjects.Sprite | null = null;
      if (NPC_OF[o.type]) s = this.add.sprite(cx, cy + 6, NPC_OF[o.type], DIR_ROW[o.dir ?? 'down']).setScale(0.8).setOrigin(0.5, 0.75);
      else if (OBJ_OF[o.type]) s = this.add.sprite(cx, cy, OBJ_OF[o.type]).setScale(0.8);
      else if (ENEMIES[o.type]) {
        const e = ENEMIES[o.type];
        s = this.add.sprite(cx, cy + 6, e.sprite).setOrigin(0.5, 0.75).setScale(e.boss ? 1.2 : 0.8).play(`${e.sprite}_idle`);
        if (o.type === 'lastboss_king') s.setTint(0xff9090);
      }
      s?.setDepth(o.y);
      return s;
    });
  }

  private drawHeroes() {
    this.heroes = this.view.players.map((p) => this.add.sprite(0, 0, HEROES[p.charId], DIR_ROW[p.dir] * 4).setOrigin(0.5, 0.8).setScale(0.85));
    this.marks = this.view.players.map(() => []);
    this.cursor = this.add.sprite(0, 0, 'fx/cursor').play('fx/cursor').setDepth(1000).setScale(0.8);
    this.view.players.forEach((p) => this.placeHero(p.seat, p.x, p.y, this.view.players));
  }

  private heroPos(seat: number, x: number, y: number, players: PublicPlayer[]) {
    const same = players.filter((q) => q.x === x && q.y === y).map((q) => q.seat);
    const k = same.indexOf(seat);
    const off = same.length > 1 ? (k - (same.length - 1) / 2) * 10 : 0;
    return { px: x * T + T / 2 + off, py: y * T + T / 2 + 8 + (k % 2) * 3 };
  }

  private placeHero(seat: number, x: number, y: number, players: PublicPlayer[]) {
    const { px, py } = this.heroPos(seat, x, y, players);
    this.heroes[seat].setPosition(px, py).setDepth(y + 0.5);
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

  private setupInput() {
    const cam = this.cameras.main;
    let dragging = false;
    let pinch = 0;
    this.input.addPointer(1);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (pinch) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (d / pinch), 0.4, 2));
        pinch = d;
        return;
      }
      pinch = 0;
      if (!p.isDown || p.x > 640) return;
      const dx = p.x - p.prevPosition.x;
      const dy = p.y - p.prevPosition.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 3) return;
      dragging = true;
      cam.stopFollow();
      this.following = -1;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
    });
    this.input.on('pointerup', () => { dragging = false; pinch = 0; });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.4, 2)));
  }

  private focus(seat: number, instant = false) {
    const s = this.heroes[seat];
    if (!s) return;
    this.following = seat;
    const cam = this.cameras.main;
    if (instant) cam.centerOn(s.x, s.y);
    cam.startFollow(s, true, 0.12, 0.12);
  }

  // ───────── UI ─────────

  private buildUI() {
    clearUI();
    const status = mount(h('div', { id: 'status' }));
    const log = mount(h('div', { class: 'log' }));
    const timer = mount(h('div', { class: 'timer' }));
    const dialog = mount(h('div', { class: 'pass' }));
    const chat = mount(h('div', { class: 'pass' }));
    this.ui = { status, log, dialog, timer, chat };
    const bar = mount(h('div', { style: 'position:absolute;left:6px;bottom:6px', class: 'row' },
      h('button', { class: 'small', onclick: () => this.openChat() }, '💬'),
      h('button', { class: 'small', onclick: () => this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * 1.25, 0.4, 2)) }, '＋'),
      h('button', { class: 'small', onclick: () => this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * 0.8, 0.4, 2)) }, '－'),
      h('button', { class: 'small', onclick: () => this.focus(this.view.turn) }, '◎'),
      h('button', { class: 'small', onclick: () => this.cycleSpeed() }, `${store().speed}×`),
      h('button', { class: 'small danger', onclick: () => this.quit() }, '退出')));
    void bar;
  }

  private cycleSpeed() {
    update((s) => (s.speed = ((s.speed % 3) + 1) as 1 | 2 | 3));
    toast(`演出速度 ${store().speed}×`);
    this.buildUI();
    this.renderStatus();
    this.refreshAsk(true);
  }

  private quit() {
    modal('退出しますか？', h('div', {}, this.host.kind === 'online' ? '切断後もCPUが代わりに操作します。' : '進行状況は保存されません。'), [{
      label: '退出', cls: 'danger', on: () => { this.host.leave(); clearUI(); this.scene.start('Title'); },
    }]);
  }

  private renderStatus() {
    const v = this.view;
    const lim = this.host.settings.turnLimit;
    this.ui.status.replaceChildren(
      h('div', { id: 'round' }, `ターン ${v.round}${lim ? ` / ${lim}` : ''}${this.host.spectator ? '（観戦中）' : ''}`),
      ...v.players.map((p) => {
        const c = CHARS[p.charId];
        const card = h('div', { class: `pcard ${p.seat === v.turn ? 'turn' : ''}`, onclick: () => this.showItems(p.seat) },
          h('div', { class: 'nm' }, h('span', {}, `${this.host.mySeats.has(p.seat) ? '▶' : ''}${p.name}${p.isCpu ? '(CPU)' : ''}`), h('span', { style: 'color:var(--accent)' }, `${p.rank}位`)),
          h('div', { class: 'muted' }, `${c.role}　${p.gold}G　${p.steps}歩　運${p.luck}`,
            p.cursed && h('span', { class: 'badge', style: 'background:#640a64' }, '呪'),
            p.stun > 0 && h('span', { class: 'badge', style: 'background:#7a6400' }, `ピヨ${p.stun}`)),
          h('div', { class: 'bar' }, h('i', { style: `width:${(100 * p.hp) / p.maxHp}%;background:var(--hp)` })),
          h('div', { class: 'row', style: 'justify-content:space-between;font-size:11px' }, h('span', {}, `HP ${p.hp}/${p.maxHp}`), h('span', {}, `MP ${p.mp}/${p.maxMp}`)),
          p.maxMp > 0 && h('div', { class: 'bar' }, h('i', { style: `width:${(100 * p.mp) / p.maxMp}%;background:var(--mp)` })),
        );
        return card;
      }),
      ...(this.host.spectator ? [] : [h('button', { onclick: () => this.showItems([...this.host.mySeats][0] ?? 0) }, '所持品')]),
    );
  }

  private itemGrid(p: PublicPlayer, usable: number[] | null, onUse?: (slot: number) => void): HTMLElement {
    return h('div', { class: 'items' }, ...p.items.map((id, slot) => {
      const d = ITEMS[id];
      const ok = usable ? usable.includes(slot) : true;
      const el = h('div', { class: `item ${usable && !ok ? 'off' : ''}`, onclick: () => ok && onUse?.(slot) },
        h('span', { style: iconStyle(id) }), h('span', {}, d.name, d.mp ? h('div', { class: 'muted' }, `MP${d.mp}`) : null));
      longPress(el, () => `${d.name}：${d.desc}`);
      return el;
    }), ...Array.from({ length: C.SLOTS - p.items.length }, () => h('div', { class: 'item off' }, '―')));
  }

  private showItems(seat: number) {
    const p = this.view.players[seat];
    if (!p) return;
    modal(`${p.name}の所持品（${p.items.length}/${C.SLOTS}）`, h('div', { class: 'col' }, this.itemGrid(p, null), h('div', { class: 'muted' }, '長押しで説明を表示')));
  }

  private log(text: string) {
    this.logLines.push(text);
    if (this.logLines.length > 6) this.logLines.shift();
    this.ui.log.replaceChildren(...this.logLines.map((l) => h('div', {}, l)));
  }

  private chatLines: { text: string; color: string }[] = [];
  private addChat(text: string, color: string) {
    this.chatLines.push({ text, color });
    this.log(text);
  }

  private openChat() {
    const input = h('input', { maxLength: 80, style: 'width:300px', placeholder: 'メッセージ' });
    let color = store().chatColor;
    const body = h('div', { class: 'col' },
      h('div', { class: 'chatlog', style: 'height:120px;width:420px' }, ...this.chatLines.slice(-30).map((c) => h('div', { style: `color:${c.color}` }, c.text))),
      h('div', { class: 'row' }, input, ...CHAT_COLORS.map((c, i) => h('button', { class: 'small', style: `background:${c};width:18px;height:18px;padding:0`, onclick: () => { color = i; update((s) => (s.chatColor = i)); } }))),
      h('div', { class: 'row' }, ...STAMPS.map((s, i) => h('button', { class: 'small', onclick: () => { this.host.sendStamp(i); wrap.remove(); } }, s))));
    const wrap = modal('チャット・スタンプ', body, [{ label: '送信', cls: 'primary', on: () => input.value.trim() && this.host.sendChat(input.value.trim(), color) }]);
  }

  private showStamp(seat: number, id: number, from: string) {
    this.addChat(`${from}：[${STAMPS[id]}]`, '#ffffff');
    const s = this.heroes[seat];
    if (!s) return;
    const cam = this.cameras.main;
    const x = (s.x - cam.worldView.x) * cam.zoom;
    const y = (s.y - 50 - cam.worldView.y) * cam.zoom;
    if (x < 0 || x > 640 || y < 0 || y > 480) return;
    const el = mount(h('div', { class: 'stamp', style: `left:${x}px;top:${y}px` }, STAMPS[id]));
    setTimeout(() => el.remove(), 2500);
  }

  private hint(key: string) {
    if (!this.host.tutorial || this.hinted.has(key) || !TUTORIAL[key]) return;
    this.hinted.add(key);
    toast(`💡 ${TUTORIAL[key]}`, 4000);
  }

  // ───────── 入力待ち ─────────

  private refreshAsk(force = false) {
    if (this.busy || this.queue.length) return;
    const ask = this.host.ask;
    if (!force && JSON.stringify(ask) === JSON.stringify(this.shownAsk)) return;
    this.shownAsk = ask;
    this.ui.dialog.replaceChildren();
    this.ui.dialog.className = 'pass';
    if (this.host.kind === 'online' && (this.host as OnlineHost).proxied) {
      this.ui.dialog.className = '';
      this.ui.dialog.replaceChildren(h('div', { class: 'panel', style: 'position:absolute;left:200px;top:60px' }, 'CPUが代行中です ',
        h('button', { class: 'primary small', onclick: () => (this.host as OnlineHost).resume() }, '操作に戻る')));
      this.host.idle();
      return;
    }
    if (!ask || this.view.over) return;
    if (!this.host.mySeats.has(ask.seat)) {
      const p = this.view.players[ask.seat];
      if (p && !this.host.spectator) this.ui.dialog.replaceChildren(h('div', { class: 'toast', style: 'top:auto;bottom:40px' }, `${p.name}が考え中…`));
      this.host.idle();
      return;
    }
    this.ui.dialog.className = '';
    const send = (inp: Parameters<Host['send']>[0]) => {
      se('select');
      this.ui.dialog.replaceChildren();
      this.host.send(inp);
    };
    const p = this.view.players[ask.seat];
    let box: HTMLElement;
    if (ask.kind === 'action') {
      this.hint('action');
      this.focus(ask.seat);
      box = h('div', { class: 'panel dialog' },
        h('div', { class: 'q' }, `${p.name}のターン！`),
        h('div', { class: 'opts' },
          h('button', { class: 'primary', onclick: () => send({ type: 'roll' }) }, '🎲 さいころ'),
          h('button', { onclick: () => this.pickItem(p, ask.items, (slot) => send({ type: 'useItem', slot })) }, `アイテム（${ask.items.length}）`)));
    } else if (ask.kind === 'battle') {
      this.hint('battle');
      box = h('div', { class: 'panel dialog' },
        h('div', { class: 'q' }, 'どうする？'),
        h('div', { class: 'opts' },
          h('button', { class: 'primary', onclick: () => send({ type: 'battleAttack' }) }, '⚔ たたかう'),
          h('button', { onclick: () => this.pickItem(p, ask.items, (slot) => send({ type: 'useItem', slot })) }, `アイテム（${ask.items.length}）`)));
    } else {
      this.hint(ask.sub);
      box = h('div', { class: 'panel dialog' },
        h('div', { class: 'q' }, ask.title, ask.sub === 'shop' || ask.sub === 'smith' || ask.sub === 'casino_bet' ? h('span', { class: 'muted' }, `（所持金 ${p.gold}G）`) : null),
        h('div', { class: 'opts' }, ...ask.options.map((o, i) => {
          const b = h('button', { disabled: !!o.disabled, onclick: () => send({ type: 'select', index: i }) },
            o.value && ITEMS[o.value] ? h('span', { style: `${iconStyle(o.value)};vertical-align:middle;transform:scale(.7)` }) : null, o.label);
          if (o.value && ITEMS[o.value]) longPress(b, () => ITEMS[o.value!].desc);
          return b;
        })));
    }
    this.ui.dialog.replaceChildren(box);
  }

  private pickItem(p: PublicPlayer, usable: number[], onUse: (slot: number) => void) {
    const wrap = modal('アイテムを使う', h('div', { class: 'col' }, this.itemGrid(p, usable, (slot) => { wrap.remove(); onUse(slot); }), h('div', { class: 'muted' }, '使えるアイテムだけ選べます（長押しで説明）')));
  }

  private tickTimer() {
    const ask = this.host.ask;
    const dl = this.host.deadline;
    if (!ask || !dl || !this.host.mySeats.has(ask.seat) || this.busy) {
      this.ui.timer.textContent = '';
      return;
    }
    const left = Math.ceil((dl - Date.now()) / 1000);
    // 経過が DRAW_LIMIT_TIME を超えたら残り秒数を表示
    this.ui.timer.textContent = left <= this.host.settings.timeLimit - C.DRAW_LIMIT_TIME && left >= 0 ? `残り ${left} 秒` : '';
  }

  // ───────── 演出 ─────────

  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms / store().speed, r));
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    this.ui.dialog.replaceChildren();
    this.shownAsk = null;
    while (this.queue.length) {
      const b = this.queue.shift()!;
      for (const e of b.events) {
        try {
          await this.play(e, b.view);
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
      this.placeHero(p.seat, p.x, p.y, v.players);
      if (!s.anims.isPlaying || s.anims.currentAnim?.key.includes('_')) this.faceHero(p.seat, p.dir, false);
      s.setAlpha(1).setAngle(0);
      this.setMarks(p);
    });
    const removed = new Set(v.removed);
    this.objSprites.forEach((s, i) => s?.setVisible(!removed.has(i)));
    const cur = this.heroes[v.turn];
    if (cur) this.cursor.setPosition(cur.x, cur.y - 48);
    this.renderStatus();
  }

  private setMarks(p: PublicPlayer) {
    const list = this.marks[p.seat];
    list.forEach((m) => m.destroy());
    list.length = 0;
    const s = this.heroes[p.seat];
    if (p.stun > 0) list.push(this.add.sprite(s.x, s.y - 40, 'fx/piyo').play('fx/piyo').setScale(0.6).setDepth(999));
    if (p.cursed) list.push(this.add.sprite(s.x + 14, s.y - 30, 'fx/curse').play('fx/curse').setScale(0.4).setDepth(999));
  }

  private fxAt(name: string, x: number, y: number, scale = 1) {
    if (!this.textures.exists(`fx/${name}`)) return;
    const s = this.add.sprite(x, y, `fx/${name}`).setDepth(2000).setScale(scale).play(`fx/${name}`);
    s.once('animationcomplete', () => s.destroy());
  }

  private float(seat: number, text: string, color: string) {
    const s = this.heroes[seat];
    if (!s) return;
    const t = this.add.text(s.x, s.y - 40, text, { fontSize: '20px', color, stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5).setDepth(2001);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 1100 / store().speed, onComplete: () => t.destroy() });
  }

  private name(seat: number) {
    return this.view.players[seat]?.name ?? '?';
  }

  private async play(e: GameEvent, end: PublicView): Promise<void> {
    const inBattle = this.battle.active;
    switch (e.t) {
      case 'turn': {
        this.view = { ...this.view, turn: e.seat, round: e.round };
        this.renderStatus();
        this.focus(e.seat);
        const s = this.heroes[e.seat];
        this.cursor.setPosition(s.x, s.y - 48);
        if (this.host.mySeats.has(e.seat)) se('turn');
        this.log(`― ${this.name(e.seat)}のターン ―`);
        await this.wait(250);
        return;
      }
      case 'skip':
        se('piyo');
        toast(`${this.name(e.seat)}は動けない！`);
        await this.wait(700);
        return;
      case 'dice':
        await this.hud.roll(e.values, e.ichi);
        return;
      case 'move': {
        const seat = e.seat;
        const s = this.heroes[seat];
        this.focus(seat);
        this.cursor.setVisible(false);
        let px = Math.floor(s.x / T);
        let py = Math.floor(s.y / T);
        for (const c of e.cells) {
          const dir = c.x > px ? 'right' : c.x < px ? 'left' : c.y > py ? 'down' : 'up';
          this.faceHero(seat, dir, true);
          const { px: tx, py: ty } = this.heroPos(seat, c.x, c.y, []);
          await new Promise<void>((r) => this.tweens.add({ targets: s, x: tx, y: ty, duration: (5 / 24) * 1000 / store().speed, onComplete: () => r() }));
          s.setDepth(c.y + 0.5);
          se('step');
          px = c.x;
          py = c.y;
        }
        s.stop();
        this.faceHero(seat, end.players[seat]?.dir ?? 'down', false);
        this.cursor.setVisible(true).setPosition(s.x, s.y - 48);
        return;
      }
      case 'msg':
        this.log(e.text);
        if (!inBattle || e.seat === undefined) toast(e.text, 1400 / store().speed);
        else void this.hud.banner(e.text, '#ffffff', 900);
        await this.wait(450);
        return;
      case 'damage':
        se('damage');
        if (inBattle && e.seat === this.view.battle?.seat) return;
        this.float(e.seat, `-${e.amount}`, '#ff5050');
        this.cameras.main.shake(150, 0.006);
        await this.wait(300);
        return;
      case 'heal':
        se('heal');
        if (inBattle) this.battle.heal(e.amount);
        else this.float(e.seat, `+${e.amount}`, '#60ff80');
        await this.wait(300);
        return;
      case 'gold':
        if (e.amount > 0) se('gold');
        this.float(e.seat, `${e.amount >= 0 ? '+' : ''}${e.amount}G`, '#ffe060');
        await this.wait(250);
        return;
      case 'getItem':
        se('get');
        this.log(`${this.name(e.seat)}は${ITEMS[e.item].name}を手に入れた`);
        await this.wait(300);
        return;
      case 'loseItem':
        this.log(`${this.name(e.seat)}の${ITEMS[e.item].name}がなくなった`);
        return;
      case 'objRemove': {
        const s = this.objSprites[e.idx];
        if (s) this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.setVisible(false).setAlpha(1) });
        return;
      }
      case 'chestOpen':
        this.objSprites[e.idx]?.setTexture('obj/chest_open');
        await this.wait(400);
        return;
      case 'fx': {
        const s = e.seat !== undefined ? this.heroes[e.seat] : null;
        const x = s ? s.x : (e.x ?? 0) * T + T / 2;
        const y = s ? s.y - 16 : (e.y ?? 0) * T + T / 2;
        if (inBattle && e.name === 'explosion') return;
        if (e.name === 'explosion') se('explode');
        if (e.name === 'warp') se('warp');
        this.fxAt(e.name, x, y, e.name === 'explosion' ? 1.3 : 1);
        await this.wait(500);
        return;
      }
      case 'battleStart': {
        const p = this.view.players[e.seat];
        const enemy = ENEMIES[e.enemy];
        bgm(enemy.boss ? 'boss' : 'battle');
        this.ui.dialog.replaceChildren();
        await this.hud.encount();
        this.view = { ...this.view, battle: { seat: e.seat, obj: e.obj, enemy: e.enemy, hp: this.view.enemyHp[e.obj] ?? enemy.hp, maxHp: enemy.hp, phase2: false } };
        this.battle.begin(e.enemy, this.view.enemyHp[e.obj] ?? enemy.hp, p);
        return;
      }
      case 'battleHit':
        await this.battle.hit(e.target, e.amount, e.fx);
        return;
      case 'phase2':
        await this.hud.banner('第2形態！', '#ff6060');
        await this.battle.phase2();
        return;
      case 'battleEnd':
        await this.battle.end(e.result);
        this.view = { ...this.view, battle: null };
        bgm('field');
        return;
      case 'death':
        se('lose');
        if (!inBattle) await new Promise<void>((r) => this.tweens.add({ targets: this.heroes[e.seat], alpha: 0.2, angle: 90, duration: 500, onComplete: () => r() }));
        return;
      case 'revive':
        if (inBattle) this.battle.revive();
        this.fxAt('heal', this.heroes[e.seat].x, this.heroes[e.seat].y - 16);
        await this.wait(400);
        return;
      case 'respawn': {
        const r = end.players[e.seat]?.respawn;
        const s = this.heroes[e.seat];
        if (r) {
          const { px, py } = this.heroPos(e.seat, r.x, r.y, []);
          s.setPosition(px, py).setAlpha(1).setAngle(0);
          se('warp');
          this.fxAt('warp', px, py - 16);
        }
        await this.wait(400);
        return;
      }
      case 'warp': {
        const p = end.players[e.seat];
        const s = this.heroes[e.seat];
        se('warp');
        this.fxAt('warp', s.x, s.y - 16);
        await this.wait(400);
        if (p) this.placeHero(e.seat, p.x, p.y, end.players);
        this.fxAt('warp', s.x, s.y - 16);
        this.focus(e.seat);
        await this.wait(400);
        return;
      }
      case 'swap': {
        const a = this.heroes[e.a];
        const b = this.heroes[e.b];
        se('swap');
        this.fxAt('swap', a.x, a.y - 16);
        this.fxAt('swap', b.x, b.y - 16);
        await this.wait(500);
        const ax = a.x, ay = a.y;
        a.setPosition(b.x, b.y);
        b.setPosition(ax, ay);
        await this.wait(300);
        return;
      }
      case 'paru':
        await this.hud.paru(e.kiwami);
        return;
      case 'stun':
        se('piyo');
        this.fxAt('piyo', this.heroes[e.seat].x, this.heroes[e.seat].y - 30);
        await this.wait(400);
        return;
      case 'curse':
        se('curse');
        this.fxAt('curse', this.heroes[e.seat].x, this.heroes[e.seat].y - 20);
        await this.wait(300);
        return;
      case 'gameOver': {
        bgm('win');
        se('win');
        await this.hud.banner(`${this.name(e.winner)}の優勝！`, '#ffe060', 2200);
        this.tracker.gameOver(e.winner, this.host.kind !== 'replay' && !this.host.spectator);
        if (this.host.tutorial) {
          unlock('tutorial');
          update((s) => (s.tutorialDone = true));
        }
        this.applyView(end);
        this.scene.start('Result', { host: this.host, view: end, reason: e.reason });
        return;
      }
    }
  }
}
