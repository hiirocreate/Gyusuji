/** 画面構成（UI_LAYOUT.md §1）。論理キャンバスを縦横比を保って拡大縮小し、余白は黒帯 */
export type Orient = 'land' | 'port';

export interface Layout {
  orient: Orient;
  w: number;
  h: number;
  /** フィールド領域（中身は常に 280×280 の座標系で描き、scale 倍で表示） */
  field: { x: number; y: number; size: number; scale: number };
  status: { x: number; y: number; w: number; h: number };
  chat: { x: number; y: number; w: number; h: number; input: number };
  /** 流れるメッセージの範囲とレーン数 */
  stream: { w: number; h: number; lanes: number };
  log: { x: number; y: number; w: number; h: number };
}

export const FIELD = 280;

export const LAYOUTS: Record<Orient, Layout> = {
  land: {
    orient: 'land', w: 640, h: 324,
    field: { x: 0, y: 0, size: 280, scale: 1 },
    status: { x: 280, y: 0, w: 360, h: 280 },
    chat: { x: 0, y: 280, w: 640, h: 44, input: 466 },
    stream: { w: 640, h: 280, lanes: 6 },
    log: { x: 40, y: 20, w: 560, h: 250 },
  },
  port: {
    orient: 'port', w: 360, h: 684,
    field: { x: 0, y: 0, size: 360, scale: 360 / 280 },
    status: { x: 0, y: 360, w: 360, h: 280 },
    chat: { x: 0, y: 640, w: 360, h: 44, input: 186 },
    stream: { w: 360, h: 640, lanes: 10 },
    log: { x: 10, y: 60, w: 340, h: 520 },
  },
};

let cur: Layout = LAYOUTS.land;
let forcedOrient: Orient | null = null;
let initialized = false;
const listeners = new Set<(l: Layout) => void>();

export const layout = () => cur;

/** 初回は縦画面、以降は画面比率に追従（URL の ?orient=land|port で固定可：確認用） */
function detect(): Orient {
  if (forcedOrient) return forcedOrient;
  const q = new URLSearchParams(location.search).get('orient');
  if (q === 'land' || q === 'port') return q;
  if (!initialized) return 'port';
  return window.innerWidth > window.innerHeight ? 'land' : 'port';
}

/** ボタンから縦横レイアウトを切り替える。ゲーム状態と通信には触れない。 */
export function toggleOrientation(): Orient {
  forcedOrient = cur.orient === 'land' ? 'port' : 'land';
  applyLayout();
  return cur.orient;
}

function safeInsets() {
  const probe = document.getElementById('safe')!;
  const cs = getComputedStyle(probe);
  return {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
  };
}

let scaleV = 1;
export const stageScale = () => scaleV;

export function applyLayout(): void {
  const o = detect();
  initialized = true;
  const changed = o !== cur.orient;
  cur = LAYOUTS[o];
  const stage = document.getElementById('stage')!;
  stage.style.width = `${cur.w}px`;
  stage.style.height = `${cur.h}px`;
  stage.dataset.orient = o;
  // キーボード表示中（visualViewport が縮む）でも拡大率は変えない
  const vw = window.innerWidth;
  const vh = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const ins = safeInsets();
  const aw = vw - ins.l - ins.r;
  const ah = vh - ins.t - ins.b;
  const rotateStage = (aw / ah > 1) !== (cur.w / cur.h > 1);
  if (rotateStage) {
    scaleV = Math.min(aw / cur.h, ah / cur.w);
    const x = ins.l + (aw - cur.h * scaleV) / 2;
    const y = ins.t + (ah - cur.w * scaleV) / 2;
    stage.dataset.rotated = 'true';
    stage.style.transform = cur.orient === 'land'
      ? `translate(${x}px, ${y}px) rotate(90deg) scale(${scaleV}) translateY(-${cur.h}px)`
      : `translate(${x}px, ${y}px) rotate(-90deg) scale(${scaleV}) translateX(-${cur.w}px)`;
  } else {
    scaleV = Math.min(aw / cur.w, ah / cur.h);
    const x = ins.l + (aw - cur.w * scaleV) / 2;
    const y = ins.t + (ah - cur.h * scaleV) / 2;
    delete stage.dataset.rotated;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scaleV})`;
  }
  const f = cur.field;
  const fu = document.getElementById('fieldui')!;
  fu.style.left = `${f.x}px`;
  fu.style.top = `${f.y}px`;
  fu.style.transform = `scale(${f.scale})`;
  if (changed) for (const l of listeners) l(cur);
}

export function onLayout(f: (l: Layout) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let lastInner = { w: 0, h: 0 };
export function watchLayout(): void {
  const run = () => {
    // キーボード表示だけによる高さ変化では再配置しない
    const w = window.innerWidth;
    const h = window.innerHeight;
    const keyboard = document.activeElement?.tagName === 'INPUT' && w === lastInner.w && h < lastInner.h;
    lastInner = { w, h };
    if (!keyboard) applyLayout();
  };
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', () => setTimeout(run, 50));
  lastInner = { w: window.innerWidth, h: window.innerHeight };
  applyLayout();
}

export function platform(): 'android' | 'ios-web' | 'web' {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return 'android';
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios-web' : 'web';
}
