/** 端末ローカル保存（戦績・設定・フレンド・実績） */
const K = 'beefhunter.v1';

export interface Stats {
  games: number;
  wins: number;
  lastBossKills: number;
  casinoStreak: number;
}

export interface Store {
  name: string;
  speed: 1 | 2 | 3;
  serverUrl: string;
  friendCode: string;
  friends: { code: string; name: string }[];
  stats: Stats;
  achievements: Record<string, number>;
  tutorialDone: boolean;
  chatColor: number;
  sound: boolean;
  /** 流れるメッセージ：表示する／システムのみ／表示しない */
  stream: 'all' | 'system' | 'none';
}

const defaults = (): Store => ({
  name: '',
  speed: 1,
  serverUrl: (import.meta.env.VITE_SERVER_URL as string | undefined) || `ws://${location.hostname || 'localhost'}:2567`,
  friendCode: String(Math.floor(10000000 + Math.random() * 89999999)),
  friends: [],
  stats: { games: 0, wins: 0, lastBossKills: 0, casinoStreak: 0 },
  achievements: {},
  tutorialDone: false,
  chatColor: 0,
  sound: true,
  stream: 'all',
});

let cache: Store | null = null;

export function store(): Store {
  if (cache) return cache;
  let saved: Partial<Store> = {};
  try {
    saved = JSON.parse(localStorage.getItem(K) ?? '{}');
  } catch {
    saved = {};
  }
  cache = { ...defaults(), ...saved, stats: { ...defaults().stats, ...(saved.stats ?? {}) } };
  save();
  return cache;
}

export function save(): void {
  try {
    localStorage.setItem(K, JSON.stringify(cache));
  } catch {
    /* 保存できない環境では無視 */
  }
}

export function update(fn: (s: Store) => void): void {
  fn(store());
  save();
}
