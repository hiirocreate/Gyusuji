import Phaser from 'phaser';
import { BASE_CHAR_COUNT, C, CHARS, DEFAULT_SETTINGS, ITEMS, MAP_NAMES, charUnlocked, characterCodeUnlockKey } from '@gyusuji/shared';
import type { SeatInit, Settings } from '@gyusuji/shared';
import { ACHIEVEMENTS, SECRET_UNLOCKS } from '../achievements.js';
import { bgm, se } from '../audio.js';
import { buildChatBar, say, setSender } from '../chat.js';
import { settingsForm } from '../forms.js';
import { LocalHost, ReplayHost, httpBase, net, type ReplayData } from '../net.js';
import { store, update } from '../store.js';
import { $, h, menuWin, screenEl, type MenuItem } from '../ui.js';
import { HEROES, iconStyle } from '../assets.js';
import { TitleBackdrop } from './titlebg.js';

type Mode = 'solo' | 'net';
/** 未解放キャラの解放条件（キャラ選択の「？？？」行に表示） */
const UNLOCK_HINT: Record<string, string> = { all5: '5人全員で優勝すると解放', true_hero: 'ラスボスを10回倒すと解放' };
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
  private bossKillTapCount = 0;

  constructor() {
    super('Menu');
  }

  create(data: { to?: string }) {
    this.cameras.main.setBackgroundColor('#1b4fa0');
    $('chatbar').style.display = 'none';
    this.bg = new TitleBackdrop(this);
    this.bg.build();
    bgm('title');
    const exit = () => {
      if (!$('chatbar') || $('chatbar').style.display !== 'flex') return;
      net.leave();
      this.title();
    };
    window.addEventListener('game-exit', exit);
    this.events.once('shutdown', () => { window.removeEventListener('game-exit', exit); this.offs.forEach((f) => f()); this.offs = []; screenEl().replaceChildren(); });
    this.offs.push(net.started.on((host) => this.scene.start('Field', { host })));
    if (data?.to === 'wait' && net.room) this.waitNet();
    else this.title();
  }

  private show(...els: (HTMLElement | null | false)[]) {
    this.bg?.setLogo(false);
    const contents = els.filter(Boolean) as HTMLElement[];
    // 以降の各画面は同じ小さな紺の見出し窓を使う。
    contents[0]?.classList.add('menu-heading', 'win');
    const chatVisible = $('chatbar').style.display === 'flex';
    screenEl().replaceChildren(h('div', { class: `full menu-full${chatVisible ? ' chat-visible' : ''}` }, ...contents));
  }

  private list(items: MenuItem[], style = 'min-width:200px') {
    const list = menuWin(items.map((it) => ({ ...it, on: () => { se('select'); it.on?.(); } })), style);
    list.classList.add('menu-list');
    return list;
  }

  title() {
    $('chatbar').style.display = 'none';
    this.bg.setLogo(true);
    const foot = h('div', { class: 'tfoot' }, 'Ver 0.2　©2026 BEEF HUNTER');
    if (!this.pressed) {
      const go = () => { this.pressed = true; se('select'); this.title(); };
      screenEl().replaceChildren(h('div', { class: 'titlescr' },
        h('button', { type: 'button', class: 'press', 'aria-label': '冒険をはじめる', onclick: go }, '冒険をはじめる', h('span', { class: 'press-arrow' }, '▶')),
        foot));
      return;
    }
    screenEl().replaceChildren(h('div', { class: 'titlescr' },
      this.list([
        { label: '一人で遊ぶ', on: () => { this.mode = 'solo'; this.name(); } },
        { label: 'ネット対戦をする', on: () => { this.mode = 'net'; this.name(); } },
        { label: '設定', on: () => this.options() },
        { label: '戦績・実績', on: () => this.records() },
        { label: '遊び方', on: () => this.howto() },
        { label: 'リプレイ再生', on: () => this.loadReplay() },
      ], 'min-width:180px'),
      foot));
  }

  name() {
    const input = h('input', { class: 'menu-input', value: store().name, maxLength: C.NAME_MAX, placeholder: '6文字まで' });
    const ok = () => {
      const v = input.value.trim().slice(0, C.NAME_MAX);
      if (!v) return input.focus();
      update((s) => (s.name = v));
      if (this.mode === 'net') this.rooms();
      else this.chars();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    this.show(h('div', {}, '名前を入力してください'), h('div', { class: 'win menu-form' }, input), this.list([{ label: '決定', on: ok }, { label: 'もどる', on: () => this.title() }]));
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
    const unlocks = Object.keys(store().achievements);
    // 隠し実績で解放されるキャラは解放されるまで表示しない
    const shown = CHARS.filter((c) => !c.unlock || !SECRET_UNLOCKS.includes(c.unlock) || charUnlocked(c.id, unlocks));
    const rows = shown.map((c) => {
      if (!charUnlocked(c.id, unlocks)) {
        return h('div', { class: 'it off char-it char-locked' },
          h('span', { class: 'hero-thumb', style: `background:url(./assets/img/chars/${HEROES[c.id]}.png) 0 0 / 144px 144px no-repeat;filter:brightness(0)` }),
          h('span', { class: 'char-name' }, '？？？'),
          h('span', { class: 'char-stats' }, `　${UNLOCK_HINT[c.unlock!] ?? '条件を満たすと解放'}`));
      }
      const choose = () => {
        this.charId = c.id;
        if (this.mode === 'net') {
          net.send('setChar', { id: c.id });
          this.waitNet();
        } else this.waitSolo();
      };
      const row = h('div', { class: 'it char-it', tabindex: 0 },
        h('span', { class: 'hero-thumb', style: `background:url(./assets/img/chars/${HEROES[c.id]}.png) 0 0 / 144px 144px no-repeat` }),
        h('span', { class: 'char-name' }, `${c.name}（${c.role}）`),
        h('span', { class: 'char-stats stars' }, `　HP${stars(c.stars.hp)} MP${stars(c.stars.mp)} 運${stars(c.stars.luck)}`));
      row.addEventListener('click', () => { se('select'); choose(); });
      return row;
    });
    const back = h('div', { class: 'it', tabindex: 0 }, 'もどる');
    back.addEventListener('click', () => { se('select'); if (this.mode === 'net') net.leave(); this.title(); });
    this.show(h('div', {}, 'キャラクターを選んでください'),
      h('div', { class: 'win list char-list', style: 'width:340px;max-width:calc(100% - 20px)' }, ...rows, back));
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
    this.cpus.forEach((on, i) => on && seats.push({ name: `CPU${i + 1}`, charId: (this.charId + 1 + i) % BASE_CHAR_COUNT, isCpu: true }));
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
        items.push({ label: `マップ選択：${MAP_NAMES[st.settings.map]}`, on: () => this.netMapPicker(st.settings.map) });
        seats.forEach((s, i) => s.kind !== 'human' && items.push({ label: `席${i + 1}：CPUを${s.kind === 'cpu' ? '外す' : '追加'}`, on: () => net.send('setCpu', { seat: i, on: s.kind !== 'cpu' }) }));
        items.push({ label: 'ハウスルール', on: () => this.houseRules({ ...st.settings }, true, (p) => net.send('setSettings', p)) });
      }
      items.push({ label: 'キャラを選び直す', on: () => this.chars() }, { label: '退室', on: () => { net.leave(); this.title(); } });
      this.show(
        h('div', {}, `マップ：${MAP_NAMES[st.settings.map]}　｜　参加者（4人揃うか全員が「ゲーム開始」を押すと始まります）`),
        h('div', { class: 'win list', style: 'min-width:260px' }, ...seats.map((s, i) => h('div', { class: 'it off', style: 'color:#fff' },
          s.kind === 'empty' ? `席${i + 1}　（空き）` : `席${i + 1}　${s.name}${s.kind === 'cpu' ? '' : `（${CHARS[s.charId].role}）`}${s.kind === 'human' && s.ready ? '　準備OK' : ''}${i === st.host ? '　★' : ''}`))),
        this.list(items));
    };
    this.offs.push(net.changed.on(draw));
    this.offs.push(net.chat.on((m) => say({ from: m.from, text: m.text, color: m.color, system: !!m.system })));
    draw();
  }

  private netMapPicker(current: Settings['map']) {
    const maps: Settings['map'][] = [0, 1, 2];
    const items: MenuItem[] = maps.map((id) => ({
      label: `${id === current ? '✓ ' : ''}${MAP_NAMES[id]}${id === 0 ? '（標準）' : id === 1 ? '（コンパクト）' : '（じっくり冒険）'}`,
      on: () => {
        net.send('setMap', { id });
        this.waitNet();
      },
    }));
    this.show(h('div', {}, '対戦するマップを選んでください'), this.list(items, 'min-width:240px'),
      this.list([{ label: 'ロビーへ戻る', on: () => this.waitNet() }], 'min-width:180px'));
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

  /** 遊び方：基本ルールとアイテム説明。固有アイテムは持ち主のキャラが解放されるまで伏せる */
  private howto() {
    const unlocks = Object.keys(store().achievements);
    const known = (owner?: string) => {
      if (!owner) return true;
      const c = CHARS.find((x) => x.key === owner);
      return !c || charUnlocked(c.id, unlocks);
    };
    const RULES = [
      'サイコロを振ってマスを進み、ラスボスを倒した人が優勝です。ターン上限がある場合は歩数（または所持金）が一番の人が優勝します。',
      '敵のマスに止まると戦闘。攻撃は1ダイス＋武器の攻撃力、受けるダメージは盾の防御力だけ減ります。',
      'HPが0になると復活地点（神父・アミュレットで記録）に戻ります。エリクサーがあればその場で全回復します。',
      '宝箱は運が高いほど良いアイテムが出やすく、運が低いと爆発しやすくなります。',
    ];
    const rows = Object.values(ITEMS).map((d) => {
      const open = known(d.owner);
      return h('div', { class: 'it off howto-item' },
        open ? h('span', { class: 'ico', style: iconStyle(d.no) }) : h('span', { class: 'ico howto-secret' }, '？'),
        h('span', { class: 'howto-text' },
          h('b', {}, open ? d.name : '？？？'),
          h('span', { class: 'howto-desc' }, open ? `${d.desc}${d.price ? `（${d.price}G）` : ''}` : 'まだ秘密のアイテム')));
    });
    this.show(h('div', {}, '遊び方'),
      h('div', { class: 'win list howto-list' },
        h('div', { class: 'howto-h' }, '基本ルール'), ...RULES.map((t) => h('div', { class: 'it off howto-rule' }, t)),
        h('div', { class: 'howto-h' }, 'アイテム'), ...rows),
      this.list([{ label: 'もどる', on: () => this.title() }]));
  }

  private records() {
    this.bossKillTapCount = 0;
    const st = store().stats;
    const bossKills = h('button', {
      type: 'button',
      class: 'boss-kills-trigger',
      'aria-label': `ラスボス撃破 ${st.lastBossKills}`,
      onclick: () => {
        this.bossKillTapCount += 1;
        if (this.bossKillTapCount === 5) {
          this.bossKillTapCount = 0;
          this.openAdminCodeDialog(bossKills);
        }
      },
    }, `ラスボス撃破 ${st.lastBossKills}`);
    this.show(h('div', { class: 'records-summary' }, `対戦数 ${st.games}　優勝数 ${st.wins}　`, bossKills),
      h('div', { class: 'win list achievement-list' }, ...ACHIEVEMENTS.filter((a) => !a.hidden || store().achievements[a.id]).map((a) => h('div', { class: 'it off', style: `color:${store().achievements[a.id] ? '#ffe650' : '#889'}` }, `${a.name}：${a.desc}`))),
      this.list([{ label: 'もどる', on: () => this.title() }]));
  }

  private openAdminCodeDialog(returnFocus: HTMLElement) {
    const root = screenEl().querySelector('.menu-full');
    if (!root || root.querySelector('.admin-code-dialog')) return;

    let backdrop!: HTMLElement;
    let dialog!: HTMLElement;
    const close = () => {
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      dialog.remove();
      returnFocus.focus();
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const input = h('input', {
      class: 'admin-code-input',
      type: 'text',
      maxLength: 96,
      autoComplete: 'off',
      autoCapitalize: 'characters',
      placeholder: 'コードを入力',
      'aria-label': '管理コード',
    });
    const status = h('div', { class: 'admin-code-status', 'aria-live': 'polite' }, '管理者コードを入力してください。');
    const submitButton = h('button', { class: 'result-action', type: 'submit' }, '解放');
    const form = h('form', {
      class: 'admin-code-form',
      onsubmit: async (event: Event) => {
        event.preventDefault();
        const code = input.value.trim();
        if (!code) {
          status.textContent = 'コードを入力してください。';
          input.focus();
          return;
        }
        submitButton.disabled = true;
        status.textContent = 'コードを確認しています…';
        try {
          const response = await fetch(`${httpBase()}/character-unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!response.ok) {
            status.textContent = response.status === 404 ? 'コードが正しくありません。' : 'コードを確認できませんでした。';
            return;
          }
          const payload = await response.json() as { characterId?: unknown };
          const id = payload?.characterId;
          const character = typeof id === 'number' && Number.isInteger(id) ? CHARS[id] : undefined;
          if (!character?.unlock) {
            status.textContent = 'このコードではキャラクターを解放できません。';
            return;
          }
          const wasUnlocked = charUnlocked(character.id, Object.keys(store().achievements));
          update((s) => { s.achievements[characterCodeUnlockKey(character.key)] = 1; });
          status.textContent = wasUnlocked ? `${character.name}はすでに使用できます。` : `${character.name}を解放しました！`;
          input.value = '';
          se('select');
        } catch {
          status.textContent = 'サーバーに接続できません。ネットワークをご確認ください。';
        } finally {
          submitButton.disabled = false;
          input.focus();
        }
      },
    }, input, status, h('div', { class: 'admin-code-actions' },
      submitButton,
      h('button', { class: 'result-action admin-code-cancel', type: 'button', onclick: close }, '閉じる')));
    dialog = h('div', { class: 'win admin-code-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'キャラクター解放コード' },
      h('div', { class: 'admin-code-title' }, '管理者コード'),
      h('div', { class: 'admin-code-note' }, 'コードを入力して、対応するキャラクターを解放します。'),
      form);
    backdrop = h('div', { class: 'admin-code-backdrop', 'aria-hidden': 'true', onclick: close });
    root.append(backdrop, dialog);
    document.addEventListener('keydown', onKeydown);
    input.focus();
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
