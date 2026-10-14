import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from 'colyseus.js';
import { GameRoom } from '../src/GameRoom.js';

process.env.GYUSUJI_PACE = '0';
const PORT = 25670;
let server: Server;

beforeAll(async () => {
  const hs = http.createServer();
  server = new Server({ transport: new WebSocketTransport({ server: hs }) });
  server.define('game', GameRoom).filterBy(['public', 'slot']);
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('GameRoom', () => {
  it('プロトコル版数が違うと入室できない', async () => {
    const c = new Client(`ws://localhost:${PORT}`);
    await expect(c.create('game', { name: 'X', protocol: 1 })).rejects.toThrow(/更新/);
  });

  it('人間1人＋CPU3人で最後まで進み、kiwami が送られない', async () => {
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.create<any>('game', { name: 'テスト', protocol: 2 });
    const raw: string[] = [];
    let mySeat = -1;
    let over = false;
    room.onMessage('seat', (m) => { mySeat = m.seat; });
    room.onMessage('chat', () => {});
    room.onMessage('start', () => {});
    room.onMessage('sync', () => {});
    room.onMessage('ev', (m) => { raw.push(JSON.stringify(m)); });
    room.onStateChange((st: any) => {
      raw.push(st.view, st.ask);
      if (st.phase === 'result') over = true;
      if (st.phase !== 'playing' || !st.ask) return;
      const ask = JSON.parse(st.ask);
      const view = JSON.parse(st.view);
      if (ask.seat !== 0 || view.players[0] === undefined) return;
      if (ask.kind === 'action') room.send('roll');
      else if (ask.kind === 'battle') room.send('battleAttack');
      else room.send('select', { index: ask.def });
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(mySeat).toBe(0);
    for (const s of [1, 2, 3]) room.send('setCpu', { seat: s, on: true });
    room.send('setSettings', { map: 1, kiwamiRate: 50 });
    room.send('ready', { on: true });
    const t0 = Date.now();
    while (!over && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
    expect(over).toBe(true);
    expect(room.state.winner).toBeGreaterThanOrEqual(0);
    expect(raw.filter((x) => x && !x.includes('"t":"paru"')).join('\n')).not.toContain('kiwami');
    const replay = await new Promise<any>((res) => { room.onMessage('replay', res); room.send('replay'); });
    expect(replay.log.length).toBeGreaterThan(10);
    await room.leave();
  }, 70000);

  it('ゲーム中のルームには入れないが観戦はできる', async () => {
    const a = new Client(`ws://localhost:${PORT}`);
    const room = await a.create<any>('game', { name: 'A', protocol: 2 });
    room.onMessage('*', () => {});
    await new Promise((r) => setTimeout(r, 50));
    room.send('setSettings', { timeLimit: 90 });
    room.send('setCpu', { seat: 1, on: true });
    room.send('ready', { on: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(room.state.phase).toBe('playing');
    const b = new Client(`ws://localhost:${PORT}`);
    await expect(b.joinById(room.roomId, { name: 'B', protocol: 2 })).rejects.toBeTruthy();
    const spec = await b.joinById<any>(room.roomId, { spectator: true, protocol: 2 });
    spec.onMessage('*', () => {});
    await new Promise((r) => setTimeout(r, 100));
    expect(room.state.spectators).toBe(1);
    await spec.leave();
    await room.leave();
  });
});
