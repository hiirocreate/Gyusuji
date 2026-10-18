export * from './chars.js';
export * from './enemies.js';
export * from './items.js';

export const C = {
  MAX_PLAYERS: 4,
  SLOTS: 10,
  INN_PRICE: 5,
  GOLD_MAX: 999,
  CON_LIMIT_TIME: 60,
  DRAW_LIMIT_TIME: 30,
  CON_ERROR_COUNT: 3,
  DICE_FRAMES: 58,
  TILE: 40,
  NAME_MAX: 6,
  RECONNECT_SEC: 60,
} as const;

export const STAMPS = ['よろしく！', 'ナイス！', 'ごめん…', 'やったー', 'うそでしょ', 'がんばれ', 'ありがとう', 'GG'];
/** チャット文字色：黒→赤→緑→青（UI_LAYOUT §4.1） */
export const CHAT_COLORS = ['#000000', '#ff3030', '#30c040', '#3070ff'];
export const SYSTEM_COLOR = '#FFE650';
export const CHAT_MAX = 40;
export const ROOM_SLOTS = 8;
/** クライアントとサーバのプロトコル版数。不一致なら入室させない */
export const PROTOCOL_VERSION = 5;
export type Platform = 'android' | 'ios-web' | 'web';
