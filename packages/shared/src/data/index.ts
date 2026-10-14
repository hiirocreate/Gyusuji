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
export const CHAT_COLORS = ['#ffffff', '#ff8080', '#80c0ff', '#ffe060'];
