import { ArraySchema, Schema, defineTypes } from '@colyseus/schema';

export class SeatS extends Schema {
  name = '';
  charId = 0;
  /** human / cpu / empty */
  kind = 'empty';
  ready = false;
  connected = false;
  /** 切断・タイムアウトで CPU が代行中 */
  proxy = false;
  rematch = false;
}
defineTypes(SeatS, {
  name: 'string', charId: 'int8', kind: 'string', ready: 'boolean', connected: 'boolean', proxy: 'boolean', rematch: 'boolean',
});

export class SettingsS extends Schema {
  map = 0;
  rule = 'ext';
  turnLimit = 0;
  limitWinner = 'steps';
  startGold = 20;
  kiwamiRate = 20;
  cpuLevel = 'normal';
  timeLimit = 60;
}
defineTypes(SettingsS, {
  map: 'int8', rule: 'string', turnLimit: 'int16', limitWinner: 'string', startGold: 'int16', kiwamiRate: 'int8',
  cpuLevel: 'string', timeLimit: 'int16',
});

export class RoomStateS extends Schema {
  /** lobby / playing / result */
  phase = 'lobby';
  code = '';
  host = -1;
  allowJoin = false;
  seats = new ArraySchema<SeatS>();
  settings = new SettingsS();
  /** 公開ビュー（JSON）。kiwami は含まれない */
  view = '';
  /** 現在の入力待ち（JSON） */
  ask = '';
  deadline = 0;
  spectators = 0;
  winner = -1;
}
defineTypes(RoomStateS, {
  phase: 'string', code: 'string', host: 'int8', allowJoin: 'boolean', seats: [SeatS], settings: SettingsS, view: 'string',
  ask: 'string', deadline: 'float64', spectators: 'int8', winner: 'int8',
});
