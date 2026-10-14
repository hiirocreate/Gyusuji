/** 軽量 DOM ヘルパ。#ui は 854×480 の論理座標でキャンバスに重なる */
export const W = 854;
export const H = 480;
export const FIELD_W = 640;

type Attrs = Record<string, unknown> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const uiRoot = () => document.getElementById('ui')!;

export function clearUI(): void {
  uiRoot().replaceChildren();
}

export function mount<T extends HTMLElement>(el: T): T {
  uiRoot().append(el);
  return el;
}

export function toast(text: string, ms = 1600): void {
  const el = mount(h('div', { class: 'toast' }, text));
  setTimeout(() => (el.style.opacity = '0'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

/** 長押しで説明を表示 */
export function longPress(el: HTMLElement, text: () => string): void {
  let t: number | undefined;
  let tip: HTMLElement | null = null;
  const show = () => {
    const r = el.getBoundingClientRect();
    const sc = scale();
    const root = uiRoot().getBoundingClientRect();
    tip = mount(h('div', { class: 'tip', style: `left:${(r.left - root.left) / sc}px;top:${(r.bottom - root.top) / sc + 4}px` }, text()));
  };
  const hide = () => {
    clearTimeout(t);
    tip?.remove();
    tip = null;
  };
  el.addEventListener('pointerdown', () => { t = window.setTimeout(show, 450); });
  el.addEventListener('pointerup', hide);
  el.addEventListener('pointerleave', hide);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

let _scale = 1;
export const scale = () => _scale;

/** 画面にフィットさせる（横向き、余白は黒） */
export function fitStage(): void {
  const stage = document.getElementById('stage')!;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _scale = Math.min(vw / W, vh / H);
  stage.style.transform = `translate(${(vw - W * _scale) / 2}px, ${(vh - H * _scale) / 2}px) scale(${_scale})`;
}

export function modal(title: string, body: HTMLElement, buttons: { label: string; cls?: string; on: () => void }[] = []): HTMLElement {
  const close = () => wrap.remove();
  const wrap = mount(h('div', { class: 'screen', style: 'background:rgba(0,0,0,.55);z-index:5' },
    h('div', { class: 'panel col', style: 'max-width:780px;max-height:440px;overflow:auto' },
      h('div', { style: 'font-size:16px;font-weight:bold' }, title),
      body,
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        ...buttons.map((b) => h('button', { class: b.cls, onclick: () => { close(); b.on(); } }, b.label)),
        h('button', { onclick: close }, '閉じる')),
    )));
  return wrap;
}
