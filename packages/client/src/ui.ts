/** 軽量 DOM ヘルパ */
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

export const $ = (id: string) => document.getElementById(id)!;
export const screenEl = () => $('screen');
export const fieldUI = () => $('fieldui');

export interface MenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  on?: () => void;
  /** 選択中（ホバー）に説明ウィンドウへ出す文 */
  desc?: string;
}

/** 縦並びテキストリストのウィンドウ（UI_LAYOUT §5） */
export function menuWin(items: MenuItem[], style: string, onHover?: (it: MenuItem | null) => void): HTMLElement {
  return h('div', { class: 'win list', style },
    ...items.map((it) => {
      const row = h('div', { class: `it ${it.disabled ? 'off' : ''}`, tabindex: 0 },
        it.icon ? h('span', { class: 'ico', style: it.icon }) : null, it.label);
      row.addEventListener('pointerenter', () => onHover?.(it));
      row.addEventListener('focus', () => onHover?.(it));
      row.addEventListener('click', () => { if (!it.disabled) it.on?.(); });
      return row;
    }));
}

/** 中心座標指定のウィンドウ */
export function centerWin(cx: number, cy: number, ...children: (Child | Child[])[]): HTMLElement {
  return h('div', { class: 'win', style: `left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);padding:6px 12px;white-space:nowrap` }, ...children);
}
