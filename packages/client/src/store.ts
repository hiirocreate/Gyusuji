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
  /** 画面の向き（既定：縦） */
  orient: 'port' | 'land';
}

const defaults = (): Store => ({
  name: '',
  speed: 1,
  serverUrl: defaultServer(),
  friendCode: String(Math.floor(10000000 + Math.random() * 89999999)),
  friends: [],
  stats: { games: 0, wins: 0, lastBossKills: 0, casinoStreak: 0 },
  achievements: {},
  tutorialDone: false,
  chatColor: 0,
  sound: true,
  stream: 'all',
  orient: 'port',
});

/** 本番サーバ（Render）。ビルド変数 VITE_SERVER_URL があればそちらを優先 */
export const PROD_SERVER = 'wss://beefhunter-server.onrender.com';

/** https:// を wss://、http:// を ws:// に直す（どちらで入力されても接続できるように） */
export function normalizeServer(u: string): string {
  return u.trim().replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '');
}

function defaultServer(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return normalizeServer(env);
  // 開発時（localhost）はローカルサーバ、公開版・アプリは本番サーバ
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && location.protocol === 'http:';
  return local ? `ws://${location.hostname}:2567` : PROD_SERVER;
}

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
  cache.serverUrl = normalizeServer(cache.serverUrl);
  // https のページからは ws:// に接続できないため、古い保存値は本番サーバに置き換える
  if (location.protocol === 'https:' && cache.serverUrl.startsWith('ws://')) cache.serverUrl = defaultServer();
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
