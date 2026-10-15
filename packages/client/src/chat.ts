import { CHAT_COLORS, CHAT_MAX, SYSTEM_COLOR } from '@gyusuji/shared';
import { layout, onLayout, toggleOrient } from './layout.js';
import { store, update } from './store.js';
import { h } from './ui.js';

/** チャット・システムメッセージ（UI_LAYOUT §4） */
export interface Line {
  from: string;
  text: string;
  color: string;
  system: boolean;
}

const SYS = '@Sys@';
const LOG_MAX = 200;
const lines: Line[] = [];
let sender: ((text: string, color: number) => void) | null = null;

/** 送信先（オンライン／ローカル）を差し替える */
export function setSender(f: ((text: string, color: number) => void) | null): void {
  sender = f;
}

/** ログに残し、flow=true なら画面に流す */
export function say(l: Line, flow = !l.system): void {
  lines.push(l);
  if (lines.length > LOG_MAX) lines.shift();
  logWin?.append(l);
  if (!flow) return;
  const mode = store().stream;
  if (mode === 'none' || (mode === 'system' && !l.system)) return;
  stream.push(l);
}

/** システムメッセージ：画面には流さず、ログにだけ残す */
export function system(text: string): void {
  say({ from: SYS, text, color: SYSTEM_COLOR, system: true }, false);
}

/** 対象外のプレイヤーへの通知（手番など）：ログに残して画面に流す */
export function notify(text: string): void {
  say({ from: SYS, text, color: SYSTEM_COLOR, system: true }, true);
}

const fmt = (l: Line) => (l.system ? `${SYS} ${l.text}` : `${l.from}: ${l.text}`);

// ───────── 流れるメッセージ ─────────

class Stream {
  private lanes: number[] = [];
  private queue: Line[] = [];
  private timer: number | undefined;

  reset(): void {
    this.lanes = Array(layout().stream.lanes).fill(0);
    const el = document.getElementById('stream')!;
    el.style.width = `${layout().stream.w}px`;
    el.style.height = `${layout().stream.h}px`;
  }

  push(l: Line): void {
    this.queue.push(l);
    this.drain();
  }

  private drain(): void {
    clearTimeout(this.timer);
    const L = layout().stream;
    if (this.lanes.length !== L.lanes) this.reset();
    const root = document.getElementById('stream')!;
    while (this.queue.length) {
      const now = performance.now();
      const lane = this.lanes.findIndex((t) => t <= now);
      if (lane < 0) {
        // 全レーンが埋まっていたら、先頭が画面に入りきるまで待つ
        this.timer = window.setTimeout(() => this.drain(), Math.min(...this.lanes) - now + 5);
        return;
      }
      const l = this.queue.shift()!;
      // 黒は見えにくいので流すときは白
      const color = l.color.toLowerCase() === '#000000' ? '#ffffff' : l.color;
      const laneH = L.h / L.lanes;
      const el = h('div', { class: 'flow', style: `color:${color};top:${Math.round(lane * laneH + (laneH - 20) / 2)}px` }, fmt(l));
      root.append(el);
      const w = el.offsetWidth;
      const speed = L.w / 6; // px/秒：画面幅を約6秒で横切る一定速度
      this.lanes[lane] = now + (w / speed) * 1000 + 120;
      const dur = ((L.w + w) / speed) * 1000;
      const anim = el.animate([{ transform: `translateX(${L.w}px)` }, { transform: `translateX(${-w}px)` }], { duration: dur, easing: 'linear' });
      anim.onfinish = () => el.remove();
    }
  }
}
const stream = new Stream();

// ───────── 会話ログ ─────────

class LogWindow {
  el: HTMLElement;
  private body: HTMLElement;
  constructor(onClose: () => void) {
    const L = layout().log;
    this.body = h('div', { class: 'body' }, ...lines.map((l) => this.row(l)));
    this.el = h('div', { class: 'logwin', style: `left:${L.x}px;top:${L.y}px;width:${L.w}px;height:${L.h}px` },
      h('div', { class: 'hd' }, h('span', {}, '会話ログ'), h('button', { class: 'x', onclick: onClose }, '×')),
      this.body,
      h('div', { class: 'ft' }, `上下スワイプでスクロール。最大${LOG_MAX}件`));
    document.getElementById('overlay')!.append(this.el);
    this.body.scrollTop = this.body.scrollHeight;
  }
  private row(l: Line) {
    // ログでは黒のまま…だが背景が濃紺のため白で表示（差異一覧に記載）
    const c = l.system ? SYSTEM_COLOR : l.color.toLowerCase() === '#000000' ? '#ffffff' : l.color;
    return h('div', { style: `color:${c}` }, fmt(l));
  }
  append(l: Line) {
    const atEnd = this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 4;
    this.body.append(this.row(l));
    while (this.body.childElementCount > LOG_MAX) this.body.firstElementChild?.remove();
    if (atEnd) this.body.scrollTop = this.body.scrollHeight;
  }
}
let logWin: LogWindow | null = null;

export function closeLog(): void {
  logWin?.el.remove();
  logWin = null;
}
export function toggleLog(): void {
  if (logWin) closeLog();
  else logWin = new LogWindow(closeLog);
}

// ───────── チャットバー ─────────

export function buildChatBar(): void {
  const bar = document.getElementById('chatbar')!;
  const L = layout().chat;
  bar.style.left = `${L.x}px`;
  bar.style.top = `${L.y}px`;
  bar.style.width = `${L.w}px`;
  bar.style.height = `${L.h}px`;
  const colorBtn = h('button', { class: 'color', style: `background:${CHAT_COLORS[store().chatColor]}` }, '色');
  colorBtn.onclick = () => {
    update((s) => (s.chatColor = (s.chatColor + 1) % CHAT_COLORS.length));
    colorBtn.style.background = CHAT_COLORS[store().chatColor];
  };
  const input = h('input', { placeholder: 'メッセージを入力', maxLength: CHAT_MAX, style: `width:${L.input}px` });
  const send = () => {
    const t = input.value.trim().slice(0, CHAT_MAX);
    if (!t) return;
    input.value = '';
    if (sender) sender(t, store().chatColor);
    else say({ from: store().name || 'ななし', text: t, color: CHAT_COLORS[store().chatColor], system: false });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  const rot = h('button', { class: 'color', title: '縦横切り替え', style: 'background:#333', onclick: () => toggleOrient() }, layout().orient === 'port' ? '横' : '縦');
  bar.replaceChildren(
    colorBtn, rot, input,
    h('button', { class: 'cbtn', style: 'background:#5050c8', onclick: send }, '送信'),
    h('button', { class: 'cbtn', style: 'background:#555', onclick: () => toggleLog() }, 'ログ'));
}

onLayout(() => {
  buildChatBar();
  stream.reset();
  if (logWin) {
    closeLog();
    toggleLog();
  }
});
