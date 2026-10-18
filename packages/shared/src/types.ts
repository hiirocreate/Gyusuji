export type Dir = 'up' | 'down' | 'left' | 'right';

export interface MapObject {
  x: number;
  y: number;
  type: string;
  dir?: Dir;
}

export interface PathCell {
  x: number;
  y: number;
  c: string;
  zone?: string;
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  terrainSet?: string;
  terrain: number[];
  objects: MapObject[];
  path: PathCell[];
}

export type MapId = 0 | 1 | 2;
export type CpuLevel = 'weak' | 'normal' | 'strong';

export interface Settings {
  map: MapId;
  rule: 'classic' | 'ext';
  turnLimit: 0 | 30 | 50 | 80;
  limitWinner: 'steps' | 'gold';
  startGold: 20 | 50 | 100;
  kiwamiRate: 0 | 20 | 50;
  cpuLevel: CpuLevel;
  timeLimit: 30 | 60 | 90;
}

export const DEFAULT_SETTINGS: Settings = {
  map: 0,
  rule: 'ext',
  turnLimit: 0,
  limitWinner: 'steps',
  startGold: 20,
  kiwamiRate: 20,
  cpuLevel: 'normal',
  timeLimit: 60,
};

export const CLASSIC_PRESET: Partial<Settings> = { rule: 'classic', kiwamiRate: 0, turnLimit: 0, startGold: 20 };

export interface SeatInit {
  name: string;
  charId: number;
  isCpu: boolean;
}

/** アイテムの実体。kiwami はサーバ専用（公開ビューには含めない） */
export interface ItemInst {
  id: number;
  kiwami?: boolean;
}

export interface Pos {
  x: number;
  y: number;
  dir: Dir;
  steps: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  charId: number;
  isCpu: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  luck: number;
  gold: number;
  items: ItemInst[];
  x: number;
  y: number;
  dir: Dir;
  steps: number;
  respawn: Pos;
  cursed: boolean;
  stun: number;
}

export interface ObjState {
  alive: boolean;
  hp: number;
  phase2?: boolean;
}

export interface BattleState {
  seat: number;
  obj: number;
  enemy: string;
  hp: number;
  maxHp: number;
  phase2: boolean;
}

/** クライアントへ送ってよい公開情報のみ */
export interface PublicPlayer extends Omit<PlayerState, 'items'> {
  items: number[];
  rank: number;
}

export interface PublicView {
  map: MapId;
  round: number;
  turn: number;
  players: PublicPlayer[];
  /** 消滅したオブジェクトの index */
  removed: number[];
  /** 敵の残り HP（ダメージを受けた物だけ） */
  enemyHp: Record<number, number>;
  battle: BattleState | null;
  winner: number;
  over: boolean;
}

export interface Option {
  label: string;
  disabled?: boolean;
  value?: number;
}

export type SelectKind =
  | 'branch' | 'treasure' | 'inn' | 'shop' | 'shoes' | 'qbox' | 'smith' | 'casino_bet' | 'casino_pick';

export type Ask =
  | { kind: 'action'; seat: number; items: number[] }
  | { kind: 'battle'; seat: number; items: number[] }
  | { kind: 'select'; seat: number; sub: SelectKind; title: string; options: Option[]; def: number };

export type Input =
  | { type: 'roll' }
  | { type: 'useItem'; slot: number }
  | { type: 'select'; index: number }
  | { type: 'battleAttack' }
  | { type: 'timeout' };

export type GameEvent =
  | { t: 'turn'; seat: number; round: number }
  | { t: 'skip'; seat: number; reason: string }
  | { t: 'dice'; seat: number; values: number[]; ichi?: boolean; purpose: string }
  | { t: 'move'; seat: number; cells: { x: number; y: number }[] }
  | { t: 'msg'; text: string; seat?: number }
  | { t: 'damage'; seat: number; amount: number }
  | { t: 'heal'; seat: number; amount: number }
  | { t: 'gold'; seat: number; amount: number }
  | { t: 'getItem'; seat: number; item: number }
  | { t: 'itemUse'; seat: number; item: number }
  | { t: 'loseItem'; seat: number; item: number }
  | { t: 'objRemove'; idx: number }
  | { t: 'chestOpen'; idx: number }
  | { t: 'fx'; name: string; seat?: number; x?: number; y?: number }
  | { t: 'battleStart'; seat: number; obj: number; enemy: string }
  | { t: 'battleHit'; seat: number; target: 'enemy' | 'player'; amount: number; fx: string }
  | { t: 'battleEnd'; seat: number; result: 'win' | 'lose' | 'leave' }
  | { t: 'phase2'; seat: number }
  | { t: 'death'; seat: number }
  | { t: 'revive'; seat: number }
  | { t: 'respawn'; seat: number }
  | { t: 'paru'; seat: number; kiwami: boolean; face: number }
  | { t: 'swap'; a: number; b: number }
  | { t: 'warp'; seat: number }
  | { t: 'stun'; seat: number; turns: number }
  | { t: 'curse'; seat: number }
  | { t: 'gameOver'; winner: number; reason: string };
