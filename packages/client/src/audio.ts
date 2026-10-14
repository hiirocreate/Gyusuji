import { store } from './store.js';

/** 外部ファイル不要の簡易シンセ（オリジナルBGM・SE） */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmTimer: number | undefined;
let bgmName = '';

function ac(): AudioContext | null {
  if (!store().sound) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'square', vol = 0.3, slide = 0): void {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + t0 + dur);
  g.gain.setValueAtTime(vol, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
  o.connect(g).connect(master);
  o.start(c.currentTime + t0);
  o.stop(c.currentTime + t0 + dur + 0.02);
}

function noise(t0: number, dur: number, vol = 0.3): void {
  const c = ac();
  if (!c || !master) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(master);
  s.start(c.currentTime + t0);
}

const SE: Record<string, () => void> = {
  dice: () => { for (let i = 0; i < 6; i++) tone(600 + i * 80, i * 0.05, 0.04, 'square', 0.12); },
  diceStop: () => tone(880, 0, 0.12, 'square', 0.2),
  step: () => tone(220, 0, 0.05, 'triangle', 0.15),
  damage: () => { noise(0, 0.15, 0.4); tone(160, 0, 0.2, 'sawtooth', 0.2, -100); },
  heal: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.15, 'sine', 0.25)),
  get: () => [784, 988, 1318].forEach((f, i) => tone(f, i * 0.08, 0.12, 'square', 0.18)),
  gold: () => [1318, 1760].forEach((f, i) => tone(f, i * 0.06, 0.1, 'square', 0.15)),
  explode: () => { noise(0, 0.5, 0.6); tone(90, 0, 0.5, 'sawtooth', 0.3, -60); },
  fire: () => { noise(0, 0.35, 0.3); tone(300, 0, 0.35, 'sawtooth', 0.15, 300); },
  summon: () => [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.22)),
  curse: () => [400, 380, 300, 200].forEach((f, i) => tone(f, i * 0.12, 0.2, 'sawtooth', 0.15)),
  lose: () => tone(500, 0, 0.3, 'square', 0.15, -350),
  encount: () => [330, 311, 330, 311, 330, 494].forEach((f, i) => tone(f, i * 0.07, 0.08, 'square', 0.2)),
  hit: () => { noise(0, 0.08, 0.35); tone(200, 0, 0.1, 'square', 0.2, -120); },
  warp: () => tone(300, 0, 0.5, 'sine', 0.25, 900),
  paru: () => [523, 784, 659, 988, 784, 1175].forEach((f, i) => tone(f, i * 0.06, 0.1, 'triangle', 0.2)),
  kiwami: () => [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i * 0.1, 0.4, 'square', 0.2)),
  swap: () => { tone(400, 0, 0.2, 'sine', 0.2, 400); tone(800, 0.2, 0.2, 'sine', 0.2, -400); },
  piyo: () => [1568, 1760, 1568].forEach((f, i) => tone(f, i * 0.09, 0.06, 'square', 0.15)),
  select: () => tone(660, 0, 0.05, 'square', 0.12),
  turn: () => [659, 880].forEach((f, i) => tone(f, i * 0.08, 0.1, 'triangle', 0.2)),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.25, 'square', 0.2)),
};

export function se(name: string): void {
  try {
    SE[name]?.();
  } catch {
    /* 音が鳴らせなくても続行 */
  }
}

// BGM: [音程(半音, nullは休符)] を 8分音符で繰り返す簡易シーケンサ
const BGM: Record<string, { tempo: number; mel: (number | null)[]; bass: number[]; wave: OscillatorType }> = {
  field: { tempo: 150, wave: 'triangle', mel: [0, 4, 7, 4, 9, 7, 4, 2, 0, 4, 7, 12, 11, 7, 9, null], bass: [-12, -12, -5, -5, -7, -7, -5, -5] },
  battle: { tempo: 180, wave: 'square', mel: [0, 0, 3, 0, 5, 3, 7, 6, 0, 0, 3, 0, 8, 7, 5, 3], bass: [-12, -12, -9, -9, -7, -7, -6, -6] },
  boss: { tempo: 190, wave: 'sawtooth', mel: [0, 1, 0, 6, 0, 1, 0, 7, 0, 1, 0, 8, 7, 6, 5, 3], bass: [-12, -11, -12, -6, -12, -11, -12, -5] },
  win: { tempo: 120, wave: 'square', mel: [0, 4, 7, 12, null, 7, 12, null, 9, 12, 16, null, 14, 12, 11, 12], bass: [-12, -5, -3, -8, -12, -5, -7, -12] },
  title: { tempo: 110, wave: 'triangle', mel: [7, null, 4, 7, 9, 7, 4, null, 2, 4, 7, 4, 2, 0, null, null], bass: [-12, -12, -8, -8, -10, -10, -5, -5] },
};

export function bgm(name: string | null): void {
  if (name === bgmName) return;
  bgmName = name ?? '';
  clearInterval(bgmTimer);
  if (!name || !BGM[name]) return;
  const b = BGM[name];
  let i = 0;
  const base = 330;
  const step = 60 / b.tempo / 2;
  bgmTimer = window.setInterval(() => {
    if (!store().sound) return;
    const m = b.mel[i % b.mel.length];
    if (m !== null) tone(base * Math.pow(2, m / 12), 0, step * 0.9, b.wave, 0.07);
    if (i % 2 === 0) tone((base / 2) * Math.pow(2, b.bass[(i / 2) % b.bass.length] / 12), 0, step * 1.8, 'triangle', 0.09);
    i++;
  }, step * 1000);
}

/** 初回タップで AudioContext を有効化 */
export function unlockAudio(): void {
  const f = () => {
    ac();
    window.removeEventListener('pointerdown', f);
  };
  window.addEventListener('pointerdown', f);
}
