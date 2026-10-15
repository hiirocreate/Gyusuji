import Phaser from 'phaser';
import { C, CHARS, DEFAULT_SETTINGS } from '@gyusuji/shared';
import type { SeatInit, Settings } from '@gyusuji/shared';
import { ACHIEVEMENTS } from '../achievements.js';
import { bgm, se } from '../audio.js';
import { buildChatBar, say, setSender } from '../chat.js';
import { settingsForm } from '../forms.js';
import { LocalHost, ReplayHost, net, type ReplayData } from '../net.js';
import { store, update } from '../store.js';
import { $, h, menuWin, screenEl, type MenuItem } from '../ui.js';
import { TitleBackdrop } from './titlebg.js';

type Mode = 'solo' | 'net';
const stars = (n: number) => (n ? '★'.repeat(n) : 'なし');

/**
 * 画面遷移（UI_LAYOUT §8）
 * タイトル →「一人で遊ぶ／ネット対戦をする」→ 名前入力 → 部屋選択 → キャラ選択 → 待機 → ゲーム
 */
export class Menu extends Phaser.Scene {
  private mode: Mode = 'solo';
  private charId = 0;
  private cpus = [true, true, true];
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private offs: (() => void)[] = [];
  private bg!: TitleBackdrop;
  private pressed = false;

  constructor() {
    super('Menu');
  }

  create(data: { to?: string }) {
    this.cameras.main.setBackgroundColor('#1b4fa0');
    $('chatbar').style.display = 'none';
    this.bg = new TitleBackdrop(this);
    this.bg.build();
    bgm('title');
    this.events.once('shutdown', () => { this.offs.forEach((f) => f()); this.offs = []; screenEl().replaceChildren(); });
    this.offs.push(net.started.on((host) => this.scene.start('Field', { host })));
    if (data?.to === 'wait' && net.room) this.waitNet();
    else this.title();
  }

  private show(...els: (HTMLElement | null | false)[]) {
    this.bg?.setLogo(false);
    screenEl().replaceChildren(h('div', { class: 'full' }, ...els.filter(Boolean) as HTMLElement[]));
  }

  private list(items: MenuItem[]) {
    return menuWin(items.map((it) => ({ ...it, on: () => { se('select'); it.on?.(); } })), 'min-width:200px');
  }

  title() {
    $('chatbar').style.display = 'none';
    this.bg.setLogo(true);
    const foot = h('div', { class: 'tfoot' }, 'Ver 0.2　©2026 BEEF HUNTER');
    if (!this.pressed) {
      // 「TAP TO START」→ タップでメニュー
      const go = () => { this.pressed = true; se('select'); this.title(); };
      screenEl().replaceChildren(h('div', { class: 'titlescr', onclick: go }, h('div', { class: 'press' }, 'TAP TO START'), foot));
      return;
    }
    screenEl().replaceChildren(h('div', { class: 'titlescr' },
      menuWin([
        { label: '一人で遊ぶ', on: () => { this.mode = 'solo'; this.name(); } },
        { label: 'ネット対戦をする', on: () => { this.mode = 'net'; this.name(); } },
        { label: '設定', on: () => this.options() },
        { label: '戦績・実績', on: () => this.records() },
        { label: 'リプレイ再生', on: () => this.loadReplay() },
      ].map((it) => ({ ...it, on: () => { se('select'); it.on(); } })), 'min-width:180px'),
      foot));
  }

  name() {
    const input = h('input', { value: store().name, maxLength: C.NAME_MAX, placeholder: '6文字まで' });
    const ok = () => {
      const v = input.value.trim().slice(0, C.NAME_MAX);
      if (!v) return input.focus();
      update((s) => (s.name = v));
      if (this.mode === 'net') this.rooms();
      else this.chars();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    this.show(h('div', {}, '名前を入力してください'), input, this.list([{ label: '決定', on: ok }, { label: 'もどる', on: () => this.title() }]));
  }

  async rooms() {
    this.show(h('div', {}, '部屋を選んでください'), h('div', { class: 'muted' }, '読み込み中…'));
    let slots: Awaited<ReturnType<typeof net.slots>> | null = null;
    // 無料サーバは15分使われないと眠るため、起動まで最大約90秒待つ
    let cancelled = false;
    for (let i = 0; i < 18 && !slots && !cancelled; i++) {
      try {
        slots = await net.slots();
      } catch {
        if (!this.scene.isActive('Menu')) return;
        this.show(h('div', {}, 'サーバを起動しています…'), h('div', { class: 'muted' }, `しばらくお待ちください（${(i + 1) * 5}秒）`),
          this.list([{ label: 'もどる', on: () => { cancelled = true; this.title(); } }]));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    if (cancelled) return;
    if (!slots) {
      if (this.scene.isActive('Menu')) this.show(h('div', {}, 'サーバに接続できませんでした'), this.list([{ label: '再試行', on: () => this.rooms() }, { label: 'もどる', on: () => this.title() }]));
      return;
    }
    const items: MenuItem[] = slots.map((r) => {
      const playing = r.phase === 'playing' || r.phase === 'result';
      const full = !playing && r.players >= C.MAX_PLAYERS;
      const tag = playing ? 'ゲーム中' : full ? '満員' : `${r.players}人`;
      return {
        label: `部屋${r.slot}　${tag}`, disabled: playing || full,
        on: async () => {
          try {
            await net.joinSlot(r.slot);
            this.chars();
          } catch (e) {
            this.show(h('div', {}, (e as Error).message), this.list([{ label: 'もどる', on: () => this.rooms() }]));
          }
        },
      };
    });
    items.push({ label: '更新', on: () => this.rooms() }, { label: 'もどる', on: () => this.title() });
    this.show(h('div', {}, '部屋を選んでください'), this.list(items));
  }

  chars() {
    const items: MenuItem[] = CHARS.map((c) => ({
      label: `${c.name}（${c.role}）　HP${stars(c.stars.hp)} MP${stars(c.stars.mp)} 運${stars(c.stars.luck)}`,
      on: () => {
        this.charId = c.id;
        if (this.mode === 'net') {
          net.send('setChar', { id: c.id });
          this.waitNet();
        } else this.waitSolo();
      },
    }));
    items.push({ label: 'もどる', on: () => { if (this.mode === 'net') net.leave(); this.title(); } });
    this.show(h('div', {}, 'キャラクターを選んでください'), this.list(items));
  }

  private chatOn(local: boolean) {
    buildChatBar();
    $('chatbar').style.display = 'flex';
    setSender(local ? null : (text, color) => net.send('chat', { text, color }));
  }

  waitSolo() {
    this.chatOn(true);
    const seats = [`${store().name}（${CHARS[this.charId].role}）`, ...this.cpus.map((on, i) => (on ? `CPU${i + 1}` : '（空き）'))];
    this.show(
      h('div', {}, '参加者'),
      h('div', { class: 'win list', style: 'min-width:220px' }, ...seats.map((s) => h('div', { class: 'it off', style: 'color:#fff' }, s))),
      this.list([
        { label: 'ゲーム開始', on: () => this.startSolo() },
        ...this.cpus.map((on, i) => ({ label: `CPU${i + 1}を${on ? '外す' : '追加'}`, on: () => { this.cpus[i] = !on; this.waitSolo(); } })),
        { label: 'ハウスルール', on: () => this.houseRules(this.settings, true, (p) => { this.settings = { ...this.settings, ...p }; }) },
        { label: 'もどる', on: () => this.chars() },
      ]));
  }

  private startSolo() {
    const seats: SeatInit[] = [{ name: store().name, charId: this.charId, isCpu: false }];
    this.cpus.forEach((on, i) => on && seats.push({ name: `CPU${i + 1}`, charId: (this.charId + 1 + i) % CHARS.length, isCpu: true }));
    this.scene.start('Field', { host: new LocalHost(this.settings, seats) });
  }

  waitNet() {
    this.chatOn(false);
    const draw = () => {
      if (!this.scene.isActive('Menu')) return;
      const room = net.room;
      if (!room) return this.title();
      const st = room.state as { phase: string; host: number; seats: { name: string; kind: string; ready: boolean; charId: number }[]; settings: Settings };
      if (st.phase !== 'lobby') return this.show(h('div', {}, 'ゲーム進行中… 同期しています'));
      const me = net.seat;
      const isHost = me >= 0 && me === st.host;
      const seats = [...st.seats];
      const mine = seats[me];
      const items: MenuItem[] = [
        { label: mine?.ready ? 'ゲーム開始（取り消す）' : 'ゲーム開始', on: () => net.send('ready', { on: !mine?.ready }) },
      ];
      if (isHost) {
        seats.forEach((s, i) => s.kind !== 'human' && items.push({ label: `席${i + 1}：CPUを${s.kind === 'cpu' ? '外す' : '追加'}`, on: () => net.send('setCpu', { seat: i, on: s.kind !== 'cpu' }) }));
        items.push({ label: 'ハウスルール', on: () => this.houseRules({ ...st.settings }, true, (p) => net.send('setSettings', p)) });
      }
      items.push({ label: 'キャラを選び直す', on: () => this.chars() }, { label: '退室', on: () => { net.leave(); this.title(); } });
      this.show(
        h('div', {}, '参加者（4人揃うか全員が「ゲーム開始」を押すと始まります）'),
        h('div', { class: 'win list', style: 'min-width:260px' }, ...seats.map((s, i) => h('div', { class: 'it off', style: 'color:#fff' },
          s.kind === 'empty' ? `席${i + 1}　（空き）` : `席${i + 1}　${s.name}${s.kind === 'cpu' ? '' : `（${CHARS[s.charId].role}）`}${s.kind === 'human' && s.ready ? '　準備OK' : ''}${i === st.host ? '　★' : ''}`))),
        this.list(items));
    };
    this.offs.push(net.changed.on(draw));
    this.offs.push(net.chat.on((m) => say({ from: m.from, text: m.text, color: m.color, system: !!m.system })));
    draw();
  }

  private houseRules(s: Settings, editable: boolean, onChange: (p: Partial<Settings>) => void) {
    let cur = { ...s };
    const body = settingsForm(cur, editable, (p) => { cur = { ...cur, ...p }; onChange(p); });
    const back = this.mode === 'net' ? () => this.waitNet() : () => this.waitSolo();
    this.show(h('div', {}, 'ハウスルール'), h('div', { class: 'win', style: 'padding:8px' }, body), this.list([{ label: 'もどる', on: back }]));
  }

  private options() {
    const s = store();
    const streamLabel = { all: '表示する', system: '通知のみ', none: '表示しない' }[s.stream];
    this.show(h('div', {}, '設定'), this.list([
      { label: `演出速度：${s.speed}×`, on: () => { update((x) => (x.speed = ((x.speed % 3) + 1) as 1 | 2 | 3)); this.options(); } },
      { label: `流れるメッセージ：${streamLabel}`, on: () => { update((x) => (x.stream = x.stream === 'all' ? 'system' : x.stream === 'system' ? 'none' : 'all')); this.options(); } },
      { label: `サウンド：${s.sound ? 'ON' : 'OFF'}`, on: () => { update((x) => (x.sound = !x.sound)); if (!store().sound) bgm(null); this.options(); } },
      { label: 'もどる', on: () => this.title() },
    ]));
  }

  private records() {
    const st = store().stats;
    this.show(h('div', {}, `対戦数 ${st.games}　優勝数 ${st.wins}　ラスボス撃破 ${st.lastBossKills}`),
      h('div', { class: 'win list', style: 'max-height:200px;overflow:auto' }, ...ACHIEVEMENTS.map((a) => h('div', { class: 'it off', style: `color:${store().achievements[a.id] ? '#ffe650' : '#889'}` }, `${a.name}：${a.desc}`))),
      this.list([{ label: 'もどる', on: () => this.title() }]));
  }

  private loadReplay() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        this.scene.start('Field', { host: new ReplayHost(JSON.parse(await f.text()) as ReplayData) });
      } catch {
        this.title();
      }
    };
    inp.click();
  }
}
