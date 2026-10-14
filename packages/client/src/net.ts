import { Client, type Room } from 'colyseus.js';
import { cpuDecide, Rand, Runner } from '@gyusuji/shared';
import type { Ask, GameEvent, Input, PublicView, SeatInit, Settings } from '@gyusuji/shared';
import { store, update } from './store.js';

export interface ReplayData {
  settings: Settings;
  seats: SeatInit[];
  seed: number;
  log: Input[];
}

export interface ChatMsg {
  from: string;
  text: string;
  color: string;
  system?: boolean;
}

type Listener<T> = (v: T) => void;
class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(f: Listener<T>): () => void {
    this.ls.add(f);
    return () => this.ls.delete(f);
  }
  emit(v: T): void {
    for (const f of [...this.ls]) f(v);
  }
}

/** フィールド・戦闘シーンから見たゲーム進行の窓口（ローカル／オンライン／リプレイ共通） */
export abstract class Host {
  abstract kind: 'local' | 'online' | 'replay';
  mySeats = new Set<number>();
  spectator = false;
  view: PublicView | null = null;
  ask: Ask | null = null;
  deadline = 0;
  tutorial = false;
  readonly batch = new Emitter<{ events: GameEvent[]; view: PublicView }>();
  readonly askChanged = new Emitter<Ask | null>();
  readonly chat = new Emitter<ChatMsg>();
  readonly stamp = new Emitter<{ seat: number; id: number; from: string }>();
  constructor(public settings: Settings, public seats: SeatInit[]) {}
  abstract send(inp: Input): void;
  /** 演出キューが空になった時に呼ばれる */
  idle(): void {}
  sendChat(text: string, color: number): void {
    this.chat.emit({ from: store().name, text, color: ['#ffffff', '#ff8080', '#80c0ff', '#ffe060'][color] });
  }
  sendStamp(id: number): void {
    const seat = [...this.mySeats][0] ?? -1;
    this.stamp.emit({ seat, id, from: store().name });
  }
  leave(): void {}
  async replayData(): Promise<ReplayData | null> {
    return null;
  }
}

/** 端末内で対戦（ひとり用・チュートリアル） */
export class LocalHost extends Host {
  kind = 'local' as const;
  readonly runner: Runner;
  private cpuRand: Rand;
  private pending = false;
  private seed: number;

  constructor(settings: Settings, seats: SeatInit[], seed = (Math.random() * 0xffffffff) >>> 0) {
    super(settings, seats);
    this.seed = seed;
    this.runner = new Runner(settings, seats, seed);
    this.cpuRand = new Rand(seed ^ 0x1234567);
    seats.forEach((s, i) => !s.isCpu && this.mySeats.add(i));
    this.view = this.runner.game.view();
    this.ask = this.runner.ask;
  }

  start(): void {
    this.flush();
  }

  private flush(): void {
    const events = this.runner.drain();
    this.view = this.runner.game.view();
    this.ask = this.runner.ask;
    if (events.length) this.batch.emit({ events, view: this.view });
    this.askChanged.emit(this.ask);
  }

  send(inp: Input): void {
    if (this.runner.submit(inp)) this.flush();
  }

  idle(): void {
    const a = this.ask;
    if (!a || this.mySeats.has(a.seat) || this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      if (this.ask !== a) return;
      this.send(cpuDecide(this.runner.game, a, this.cpuRand));
    }, 350 / store().speed);
  }

  async replayData(): Promise<ReplayData> {
    return { settings: this.settings, seats: this.seats, seed: this.seed, log: [...this.runner.log] };
  }
}

/** リプレイ再生（seed＋入力列） */
export class ReplayHost extends Host {
  kind = 'replay' as const;
  private runner: Runner;
  private i = 0;
  private pending = false;
  constructor(private data: ReplayData) {
    super(data.settings, data.seats);
    this.spectator = true;
    this.runner = new Runner(data.settings, data.seats, data.seed);
    this.view = this.runner.game.view();
  }
  start(): void {
    const events = this.runner.drain();
    this.view = this.runner.game.view();
    if (events.length) this.batch.emit({ events, view: this.view });
  }
  send(): void {}
  idle(): void {
    if (this.pending || this.i >= this.data.log.length) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      this.runner.submit(this.data.log[this.i++]);
      this.start();
    }, 250 / store().speed);
  }
  async replayData(): Promise<ReplayData> {
    return this.data;
  }
}

// ───────── オンライン ─────────

export function httpBase(): string {
  return store().serverUrl.replace(/^ws/, 'http').replace(/\/$/, '');
}

export class Net {
  client: Client | null = null;
  room: Room | null = null;
  seat = -1;
  readonly chat = new Emitter<ChatMsg>();
  readonly started = new Emitter<OnlineHost>();
  readonly changed = new Emitter<void>();
  host: OnlineHost | null = null;

  private cl(): Client {
    if (!this.client) this.client = new Client(store().serverUrl);
    return this.client;
  }

  reset(): void {
    this.client = null;
  }

  private opts(extra: Record<string, unknown> = {}) {
    return { name: store().name, friendCode: store().friendCode, ...extra };
  }

  async create(isPublic: boolean): Promise<void> {
    this.attach(await this.cl().create('game', this.opts({ public: isPublic })));
  }

  async random(): Promise<void> {
    this.attach(await this.cl().joinOrCreate('game', this.opts({ public: true })));
  }

  async joinById(roomId: string, extra: Record<string, unknown> = {}): Promise<void> {
    this.attach(await this.cl().joinById(roomId, this.opts(extra)));
  }

  async joinByCode(code: string): Promise<void> {
    const r = await fetch(`${httpBase()}/find?code=${encodeURIComponent(code.trim().toUpperCase())}`);
    if (!r.ok) throw new Error('ルームが見つかりません');
    const { roomId } = await r.json();
    await this.joinById(roomId);
  }

  async joinFriend(code: string): Promise<void> {
    const r = await fetch(`${httpBase()}/friend?code=${encodeURIComponent(code)}`);
    if (!r.ok) throw new Error('フレンドはオンラインのルームにいません');
    const { roomId } = await r.json();
    await this.joinById(roomId);
  }

  async rooms(): Promise<{ roomId: string; code: string; clients: number }[]> {
    const r = await fetch(`${httpBase()}/rooms`);
    return r.ok ? r.json() : [];
  }

  async spectate(roomId: string): Promise<void> {
    await this.joinById(roomId, { spectator: true });
  }

  /** 前回の席へ復帰（切断から時間が経っても可） */
  async resume(): Promise<boolean> {
    const last = sessionStorage.getItem('bh.lastSeat');
    if (!last) return false;
    const { roomId, token } = JSON.parse(last);
    try {
      await this.joinById(roomId, { token });
      return true;
    } catch {
      sessionStorage.removeItem('bh.lastSeat');
      return false;
    }
  }

  leave(): void {
    sessionStorage.removeItem('bh.lastSeat');
    void this.room?.leave(true);
    this.room = null;
    this.host = null;
    this.seat = -1;
  }

  send(type: string, msg?: unknown): void {
    this.room?.send(type, msg);
  }

  private attach(room: Room): void {
    this.room = room;
    this.seat = -1;
    this.host = null;
    room.onMessage('seat', (m: { seat: number; token: string; roomId: string }) => {
      this.seat = m.seat;
      sessionStorage.setItem('bh.lastSeat', JSON.stringify({ roomId: m.roomId, token: m.token }));
      this.changed.emit();
    });
    room.onMessage('chat', (m: ChatMsg) => {
      this.chat.emit(m);
      this.host?.chat.emit(m);
    });
    room.onMessage('stamp', (m: { seat: number; id: number; from: string }) => this.host?.stamp.emit(m));
    room.onMessage('start', (m: { seatMap: number[]; settings: Settings; seats: SeatInit[]; view: string }) => {
      this.host = new OnlineHost(this, m.settings, m.seats, m.seatMap);
      this.host.view = JSON.parse(m.view) as PublicView;
      this.started.emit(this.host);
    });
    room.onMessage('sync', (m: { view: string; seatMap: number[] }) => {
      if (!m.view) return;
      const view = JSON.parse(m.view) as PublicView;
      if (!this.host) {
        const st = room.state as { settings: Settings };
        const seats = view.players.map((p) => ({ name: p.name, charId: p.charId, isCpu: p.isCpu }));
        this.host = new OnlineHost(this, { ...st.settings } as Settings, seats, m.seatMap);
        this.host.view = view;
        this.started.emit(this.host);
      } else {
        this.host.view = view;
      }
    });
    room.onMessage('ev', (m: { events: GameEvent[]; view: string }) => {
      const view = JSON.parse(m.view) as PublicView;
      if (this.host) {
        this.host.view = view;
        this.host.batch.emit({ events: m.events, view });
      }
    });
    room.onMessage('replay', (m: ReplayData) => this.host?.gotReplay(m));
    room.onStateChange(() => {
      this.host?.syncAsk();
      this.changed.emit();
    });
    const rtoken = () => room.reconnectionToken;
    room.onLeave(async (code: number) => {
      if (this.room !== room) return;
      this.room = null;
      // 意図しない切断なら 60 秒以内の再接続を試みる
      if (code !== 1000 && code < 4000) {
        for (let i = 0; i < 6; i++) {
          try {
            const r2 = await this.cl().reconnect(rtoken());
            const host = this.host;
            const seat = this.seat;
            this.attach(r2);
            this.host = host;
            this.seat = seat;
            this.changed.emit();
            return;
          } catch {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        if (await this.resume()) return;
      }
      this.changed.emit();
    });
  }
}

export const net = new Net();

export class OnlineHost extends Host {
  kind = 'online' as const;
  proxied = false;
  private replayWait: ((d: ReplayData) => void) | null = null;
  constructor(private n: Net, settings: Settings, seats: SeatInit[], public seatMap: number[]) {
    super(settings, seats);
    const gs = seatMap[n.seat];
    if (n.seat >= 0 && gs !== undefined) this.mySeats.add(gs);
    else this.spectator = true;
    this.syncAsk();
  }
  syncAsk(): void {
    const st = this.n.room?.state as { ask: string; deadline: number; seats: { proxy: boolean }[] } | undefined;
    if (!st) return;
    const ask = st.ask ? (JSON.parse(st.ask) as Ask) : null;
    this.deadline = st.deadline;
    const proxy = this.n.seat >= 0 && st.seats[this.n.seat]?.proxy;
    if (JSON.stringify(ask) !== JSON.stringify(this.ask)) {
      this.ask = ask;
      this.askChanged.emit(ask);
    }
    const gs = this.seatMap[this.n.seat];
    const was = this.proxied;
    this.proxied = !!proxy;
    if (proxy) this.mySeats.clear();
    else if (gs !== undefined && this.n.seat >= 0) this.mySeats.add(gs);
    if (was !== this.proxied) this.askChanged.emit(this.ask);
  }
  resume(): void {
    this.n.send('resume');
  }
  send(inp: Input): void {
    if (inp.type === 'timeout') return;
    const { type, ...rest } = inp;
    this.n.send(type, rest);
  }
  sendChat(text: string, color: number): void {
    this.n.send('chat', { text, color });
  }
  sendStamp(id: number): void {
    this.n.send('stamp', { id });
  }
  leave(): void {
    this.n.leave();
  }
  gotReplay(d: ReplayData): void {
    this.replayWait?.(d);
    this.replayWait = null;
  }
  replayData(): Promise<ReplayData | null> {
    return new Promise((res) => {
      this.replayWait = res;
      this.n.send('replay');
      setTimeout(() => res(null), 5000);
    });
  }
}

export function rememberFriend(code: string, name: string): void {
  update((s) => {
    if (!/^\d{8}$/.test(code) || s.friends.some((f) => f.code === code)) return;
    s.friends.push({ code, name });
  });
}
