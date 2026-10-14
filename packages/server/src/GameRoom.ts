import { Room, type Client } from 'colyseus';
import {
  C, CHAT_COLORS, CHAT_MAX, CLASSIC_PRESET, DEFAULT_SETTINGS, PROTOCOL_VERSION, Runner, STAMPS,
} from '@gyusuji/shared';
import type { Ask, Input, SeatInit, Settings } from '@gyusuji/shared';
import { RoomStateS, SeatS } from './schema.js';
import { animMs, makeCpu } from './cpu.js';
import { friendRooms } from './registry.js';

interface JoinOptions {
  name?: string;
  spectator?: boolean;
  public?: boolean;
  token?: string;
  friendCode?: string;
  takeSeat?: number;
  slot?: number;
  protocol?: number;
  platform?: string;
}

interface Member {
  seat: number; // -1 = 観戦
  token: string;
  friendCode?: string;
  /** android / ios-web / web（障害調査用。表示しない） */
  platform: string;
}

export interface ReplayData {
  settings: Settings;
  seats: SeatInit[];
  seed: number;
  log: Input[];
}

/** 演出待ちの倍率（テスト時は 0） */
const PACE = Number(process.env.GYUSUJI_PACE ?? 1);

const rid = (n: number) => Array.from({ length: n }, () => '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 34)]).join('');

export class GameRoom extends Room<RoomStateS> {
  maxClients = 16;
  private members = new Map<string, Member>();
  private tokens: string[] = ['', '', '', ''];
  private timeouts = [0, 0, 0, 0];
  private runner: Runner | null = null;
  private seatInits: SeatInit[] = [];
  private seed = 0;
  private cpu = makeCpu(1);
  private timer?: ReturnType<Room['clock']['setTimeout']>;
  private gameSeatOf: number[] = []; // room seat → game seat
  private roomSeatOf: number[] = []; // game seat → room seat
  private lastReplay: ReplayData | null = null;
  /** キャラ選択を終えた席 */
  private picked = new Set<number>();

  onCreate(options: JoinOptions) {
    this.setState(new RoomStateS());
    for (let i = 0; i < C.MAX_PLAYERS; i++) this.state.seats.push(new SeatS());
    this.state.code = rid(5);
    this.setMetadata({ code: this.state.code, public: !!options.public, slot: options.slot ?? 0, phase: 'lobby', players: 0 });
    if (!options.public && !options.slot) this.setPrivate(true);
    this.autoDispose = true;

    this.onMessage('setChar', (c, m: { id: number }) => this.lobbySeat(c, (s) => {
      s.charId = clampInt(m?.id, 0, 4);
      this.picked.add(this.members.get(c.sessionId)!.seat);
      this.checkStart();
    }));
    this.onMessage('setMap', (c, m: { id: number }) => this.hostOnly(c, () => { this.state.settings.map = clampInt(m?.id, 0, 2); }));
    this.onMessage('setSettings', (c, m: Partial<Settings> & { preset?: string }) => this.hostOnly(c, () => this.applySettings(m)));
    this.onMessage('setCpu', (c, m: { seat: number; on: boolean }) => this.hostOnly(c, () => {
      const s = this.seat(clampInt(m?.seat, 0, 3));
      if (!s || s.kind === 'human') return;
      s.kind = m.on ? 'cpu' : 'empty';
      s.name = m.on ? `CPU${clampInt(m.seat, 0, 3) + 1}` : '';
      s.charId = m.on ? Math.floor(Math.random() * 5) : 0;
      this.checkStart();
    }));
    this.onMessage('ready', (c, m: { on?: boolean }) => this.lobbySeat(c, (s) => {
      s.ready = m?.on ?? !s.ready;
      this.checkStart();
    }));
    this.onMessage('allowJoin', (c, m: { on: boolean }) => this.hostOnly(c, () => { this.state.allowJoin = !!m?.on; }, true));
    this.onMessage('chat', (c, m: { text: string; color: number }) => {
      const text = String(m?.text ?? '').slice(0, CHAT_MAX).trim();
      if (!text) return;
      this.broadcast('chat', { from: this.nameOf(c), text, color: CHAT_COLORS[clampInt(m?.color, 0, 3)] });
    });
    this.onMessage('stamp', (c, m: { id: number }) => {
      const mem = this.members.get(c.sessionId);
      this.broadcast('stamp', { from: this.nameOf(c), seat: mem ? this.gameSeatOf[mem.seat] ?? -1 : -1, id: clampInt(m?.id, 0, STAMPS.length - 1) });
    });
    for (const type of ['roll', 'useItem', 'select', 'battleAttack'] as const) {
      this.onMessage(type, (c, m: Record<string, unknown>) => this.input(c, { ...(m ?? {}), type } as Input));
    }
    this.onMessage('rematch', (c) => {
      const mem = this.members.get(c.sessionId);
      if (this.state.phase !== 'result' || !mem || mem.seat < 0) return;
      this.seat(mem.seat).rematch = true;
      const humans = this.state.seats.filter((s) => s.kind === 'human' && s.connected);
      if (humans.length && humans.every((s) => s.rematch)) this.startGame();
    });
    // CPU 代行中のプレイヤーが操作を取り戻す
    this.onMessage('resume', (c) => {
      const m = this.members.get(c.sessionId);
      if (!m || m.seat < 0 || this.state.phase !== 'playing') return;
      const s = this.seat(m.seat);
      if (!s.proxy) return;
      s.proxy = false;
      this.timeouts[m.seat] = 0;
      this.pushSystem(`${s.name}さんが操作に戻りました`);
      this.kick();
    });
    this.onMessage('replay', (c) => {
      if (this.lastReplay) c.send('replay', this.lastReplay);
    });
  }

  onAuth(_c: Client, options: JoinOptions) {
    if (options?.protocol !== PROTOCOL_VERSION) throw new Error('アプリを更新してください');
    if (options?.spectator) return true;
    if (options?.token && this.tokens.includes(options.token)) return true;
    if (this.state.phase === 'lobby') {
      if (!this.state.seats.some((s) => s.kind === 'empty')) throw new Error('ルームが満員です');
      return true;
    }
    if (options?.takeSeat !== undefined && this.state.allowJoin) return true;
    throw new Error('ゲーム中のルームには入れません（観戦は可能です）');
  }

  onJoin(client: Client, options: JoinOptions) {
    const name = String(options?.name ?? 'ななし').slice(0, C.NAME_MAX) || 'ななし';
    // 再接続（トークン）
    const ti = options?.token ? this.tokens.indexOf(options.token) : -1;
    if (ti >= 0) {
      this.bindSeat(client, ti, options.token!, options.friendCode, options.platform);
      const s = this.seat(ti);
      s.connected = true;
      s.proxy = false;
      this.timeouts[ti] = 0;
      this.pushSystem(`${s.name}さんが復帰しました`);
      this.kick();
      return;
    }
    if (options?.spectator) {
      this.members.set(client.sessionId, { seat: -1, token: '', platform: String(options.platform ?? 'web') });
      this.state.spectators++;
      this.sendCatchUp(client);
      return;
    }
    let seat = -1;
    if (this.state.phase === 'lobby') {
      seat = this.state.seats.findIndex((s) => s.kind === 'empty');
    } else if (options.takeSeat !== undefined) {
      // 途中参加：CPU 枠のみ
      const t = clampInt(options.takeSeat, 0, 3);
      if (this.seat(t)?.kind === 'cpu') seat = t;
    }
    if (seat < 0) {
      client.leave(4001, '参加できる席がありません');
      return;
    }
    const s = this.seat(seat);
    const midJoin = s.kind === 'cpu';
    s.kind = 'human';
    s.name = name;
    s.connected = true;
    s.proxy = false;
    s.ready = false;
    if (!midJoin) s.charId = seat % 5;
    const token = rid(16);
    this.tokens[seat] = token;
    this.bindSeat(client, seat, token, options.friendCode, options.platform);
    if (this.state.host < 0) this.state.host = seat;
    if (midJoin && this.runner) {
      const gs = this.gameSeatOf[seat];
      const p = this.runner.game.players[gs];
      p.isCpu = false;
      p.name = name;
      this.seatInits[gs].name = name;
      this.publish([]);
      this.kick();
    }
    this.pushSystem(`${name}さんが入室しました`);
  }

  async onLeave(client: Client, consented: boolean) {
    const mem = this.members.get(client.sessionId);
    this.members.delete(client.sessionId);
    if (!mem) return;
    if (mem.friendCode) friendRooms.delete(mem.friendCode);
    if (mem.seat < 0) {
      this.state.spectators = Math.max(0, this.state.spectators - 1);
      return;
    }
    const s = this.seat(mem.seat);
    if (this.state.phase === 'lobby') {
      this.pushSystem(`${s.name}さんが退室しました`);
      s.kind = 'empty';
      s.name = '';
      s.ready = false;
      s.connected = false;
      this.tokens[mem.seat] = '';
      this.picked.delete(mem.seat);
      this.updateMeta();
      this.fixHost();
      this.checkStart();
      return;
    }
    s.connected = false;
    this.pushSystem(`${s.name}さんの接続が切れました`);
    if (consented) {
      this.toProxy(mem.seat);
      return;
    }
    try {
      const c2 = await this.allowReconnection(client, C.RECONNECT_SEC);
      this.members.set(c2.sessionId, mem);
      s.connected = true;
      s.proxy = false;
      this.pushSystem(`${s.name}さんが再接続しました`);
      this.sendCatchUp(c2);
      this.kick();
    } catch {
      this.toProxy(mem.seat);
    }
  }

  onDispose() {
    for (const [, m] of this.members) if (m.friendCode) friendRooms.delete(m.friendCode);
  }

  private seat(i: number): SeatS {
    return this.state.seats.at(i)!;
  }

  // ───── ロビー ─────

  private bindSeat(client: Client, seat: number, token: string, friendCode?: string, platform?: string) {
    const fc = friendCode && /^\d{8}$/.test(friendCode) ? friendCode : undefined;
    this.members.set(client.sessionId, { seat, token, friendCode: fc, platform: String(platform ?? 'web') });
    this.updateMeta();
    if (fc) friendRooms.set(fc, this.roomId);
    client.send('seat', { seat, token, roomId: this.roomId, code: this.state.code });
    this.sendCatchUp(client);
  }

  /** 部屋選択画面用（人数・ゲーム中・満員） */
  private updateMeta() {
    const players = this.state.seats.filter((s) => s.kind === 'human').length;
    this.setMetadata({ ...this.metadata, players, phase: this.state.phase });
  }

  private sendCatchUp(client: Client) {
    if (this.state.phase !== 'lobby') client.send('sync', { view: this.state.view, seatMap: this.gameSeatOf });
  }

  private nameOf(c: Client): string {
    const m = this.members.get(c.sessionId);
    if (!m) return '?';
    return m.seat < 0 ? '観戦者' : this.seat(m.seat).name;
  }

  private pushSystem(text: string) {
    this.broadcast('chat', { from: '', text, color: '#a0ffa0', system: true });
  }

  private lobbySeat(c: Client, fn: (s: SeatS) => void) {
    const m = this.members.get(c.sessionId);
    if (!m || m.seat < 0 || this.state.phase !== 'lobby') return;
    fn(this.seat(m.seat));
  }

  private hostOnly(c: Client, fn: () => void, anyPhase = false) {
    const m = this.members.get(c.sessionId);
    if (!m || m.seat !== this.state.host) return;
    if (!anyPhase && this.state.phase !== 'lobby') return;
    fn();
  }

  private fixHost() {
    if (this.state.host >= 0 && this.seat(this.state.host).kind === 'human') return;
    this.state.host = this.state.seats.findIndex((s) => s.kind === 'human');
  }

  private applySettings(m: Partial<Settings> & { preset?: string }) {
    const s = this.state.settings;
    const pick = <T>(v: unknown, allowed: readonly T[], cur: T): T => (allowed.includes(v as T) ? (v as T) : cur);
    if (m.preset === 'classic') Object.assign(s, CLASSIC_PRESET);
    if (m.preset === 'ext') Object.assign(s, { rule: 'ext', kiwamiRate: DEFAULT_SETTINGS.kiwamiRate });
    s.map = pick(m.map, [0, 1, 2], s.map);
    s.rule = pick(m.rule, ['classic', 'ext'], s.rule);
    s.turnLimit = pick(m.turnLimit, [0, 30, 50, 80], s.turnLimit);
    s.limitWinner = pick(m.limitWinner, ['steps', 'gold'], s.limitWinner);
    s.startGold = pick(m.startGold, [20, 50, 100], s.startGold);
    s.kiwamiRate = pick(m.kiwamiRate, [0, 20, 50], s.kiwamiRate);
    s.cpuLevel = pick(m.cpuLevel, ['weak', 'normal', 'strong'], s.cpuLevel);
    s.timeLimit = pick(m.timeLimit, [30, 60, 90], s.timeLimit);
  }

  private checkStart() {
    if (this.state.phase !== 'lobby') return;
    const humans = this.state.seats.filter((s) => s.kind === 'human');
    // 4人揃うか、全員が「ゲーム開始」を押すと開始
    const all4 = humans.length === C.MAX_PLAYERS && this.state.seats.every((s, i) => s.kind !== 'human' || this.picked.has(i));
    if (!humans.length || (!all4 && !humans.every((s) => s.ready))) return;
    this.startGame();
  }

  // ───── ゲーム ─────

  private settingsObj(): Settings {
    const s = this.state.settings;
    return {
      map: s.map as Settings['map'], rule: s.rule as Settings['rule'], turnLimit: s.turnLimit as Settings['turnLimit'],
      limitWinner: s.limitWinner as Settings['limitWinner'], startGold: s.startGold as Settings['startGold'],
      kiwamiRate: s.kiwamiRate as Settings['kiwamiRate'], cpuLevel: s.cpuLevel as Settings['cpuLevel'],
      timeLimit: s.timeLimit as Settings['timeLimit'],
    };
  }

  private startGame() {
    this.gameSeatOf = [];
    this.roomSeatOf = [];
    this.seatInits = [];
    this.state.seats.forEach((s, i) => {
      s.rematch = false;
      s.ready = false;
      if (s.kind === 'empty') return;
      this.gameSeatOf[i] = this.seatInits.length;
      this.roomSeatOf.push(i);
      this.seatInits.push({ name: s.name, charId: s.charId, isCpu: s.kind === 'cpu' });
    });
    if (!this.seatInits.length) return;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.cpu = makeCpu(this.seed);
    this.timeouts = [0, 0, 0, 0];
    this.runner = new Runner(this.settingsObj(), this.seatInits, this.seed);
    this.state.phase = 'playing';
    this.state.winner = -1;
    this.setMetadata({ ...this.metadata, phase: 'playing' });
    if (!this.metadata.slot) this.setPrivate(true);
    this.broadcast('start', { seatMap: this.gameSeatOf, settings: this.settingsObj(), seats: this.seatInits, view: JSON.stringify(this.runner.game.view()) });
    this.publish(this.runner.drain());
    this.kick();
  }

  /** 状態と演出イベントを配信 */
  private publish(events: ReturnType<Runner['drain']>) {
    const r = this.runner!;
    const view = JSON.stringify(r.game.view());
    this.state.view = view;
    this.state.ask = r.ask ? JSON.stringify(r.ask) : '';
    if (events.length) this.broadcast('ev', { events, view });
    if (!r.ask) this.finish();
    return animMs(events);
  }

  private finish() {
    const r = this.runner!;
    this.clock.clear();
    this.timer = undefined;
    this.state.phase = 'result';
    this.state.winner = r.game.winner;
    this.state.deadline = 0;
    this.lastReplay = { settings: this.settingsObj(), seats: this.seatInits, seed: this.seed, log: [...r.log] };
    this.setMetadata({ ...this.metadata, phase: 'result' });
  }

  private isAuto(gameSeat: number): boolean {
    const s = this.state.seats.at(this.roomSeatOf[gameSeat]);
    return !s || s.kind === 'cpu' || s.proxy;
  }

  /** 現在の入力待ちに対してタイマー（CPU 思考 or 制限時間）を張り直す */
  private kick(delay = 0) {
    delay *= PACE;
    this.timer?.clear();
    this.timer = undefined;
    const r = this.runner;
    if (!r?.ask || this.state.phase !== 'playing') return;
    const ask = r.ask;
    if (this.isAuto(ask.seat)) {
      this.state.deadline = 0;
      this.timer = this.clock.setTimeout(() => this.apply(this.cpu(r.game, ask)), delay + 500 * PACE);
    } else {
      const ms = delay + this.state.settings.timeLimit * 1000;
      this.state.deadline = Date.now() + ms;
      this.timer = this.clock.setTimeout(() => this.onTimeout(ask), ms);
    }
  }

  private onTimeout(ask: Ask) {
    const r = this.runner;
    if (!r || r.ask !== ask) return;
    const rs = this.roomSeatOf[ask.seat];
    this.timeouts[rs]++;
    if (this.timeouts[rs] >= C.CON_ERROR_COUNT) {
      this.pushSystem(`${this.seat(rs).name}さんは時間切れが続いたためCPUが代行します`);
      this.seat(rs).proxy = true;
    }
    this.apply({ type: 'timeout' });
  }

  private apply(inp: Input) {
    const r = this.runner;
    if (!r || !r.submit(inp)) return false;
    const ms = this.publish(r.drain());
    this.kick(ms);
    return true;
  }

  private input(c: Client, inp: Input) {
    const r = this.runner;
    const m = this.members.get(c.sessionId);
    if (!r?.ask || !m || m.seat < 0 || this.state.phase !== 'playing') return;
    if (this.gameSeatOf[m.seat] !== r.ask.seat) return; // 手番検証
    if (this.seat(m.seat).proxy) return;
    if (inp.type === 'timeout') return;
    if (this.apply(inp)) this.timeouts[m.seat] = 0;
  }

  private toProxy(seat: number) {
    const s = this.seat(seat);
    if (this.state.phase === 'playing') {
      s.proxy = true;
      this.pushSystem(`${s.name}さんの操作をCPUが代行します`);
      this.kick();
    }
    if (!this.state.seats.some((x) => x.kind === 'human' && x.connected)) {
      // 人間が全員いなくなったら終了
      this.timer?.clear();
      this.disconnect();
    }
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
